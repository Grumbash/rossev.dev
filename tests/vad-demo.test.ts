// Issue #9: the voice demo in the Sully case. Checks the built output: the trigger and its
// privacy line in both languages, zero demo bytes before the click (no model or worker URL in
// any page or in the JavaScript a page loads up front), and that audio code never talks to the network.
import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { EVENTS } from '../src/scripts/analytics';
import { t } from '../src/i18n';
import { WEIGHTS_BYTES } from '../src/scripts/vad/model';
import { withChrome } from './fixtures/cdp';
import { hasChrome } from './fixtures/probe';
import { buildSite } from './fixtures/build';

setDefaultTimeout(120_000);

const read = (p: string) => readFileSync(p, 'utf8');
const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"');
const WEIGHTS_FILE = 'silero-vad-v6.2.3.bin';
// Anything that would mean the demo's model, runtime or worker is fetched or preloaded. (The copy
// names "Silero VAD v6" in words; only the weights file name has the hyphen.)
const DEMO_URL = /silero-vad|\/vad\/|\.onnx|onnxruntime|ort-wasm/i;

/** The page's own scripts and modulepreloads, plus everything they import statically. */
function eagerJs(html: string): string[] {
  const urls = [
    ...[...html.matchAll(/<script\b[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]),
    ...[...html.matchAll(/<link\b[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g)].map((m) => m[1]),
  ].filter((u) => u.startsWith('/_astro/'));
  const seen = new Set<string>();
  const walk = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    // Static imports only (`import ... from "./x.js"` and bare `import "./x.js"`); import("...") is lazy.
    for (const m of read(join('dist/_astro', file)).matchAll(/(?:\bfrom|\bimport)\s*["']\.\/([^"']+\.js)["']/g)) walk(m[1]);
  };
  for (const u of urls) walk(u.replace('/_astro/', ''));
  return [...seen].map((f) => join('dist/_astro', f));
}

const PAGES = {
  en: ['dist/cases/sully/index.html', 'dist/partials/case-sully/index.html'],
  ru: ['dist/ru/cases/sully/index.html', 'dist/ru/partials/case-sully/index.html'],
} as const;

beforeAll(() => {
  buildSite();
});

describe('voice demo markup', () => {
  for (const lang of ['en', 'ru'] as const) {
    test(`the Sully case (page and home fragment) has the trigger and the privacy line in ${lang.toUpperCase()}`, () => {
      const d = t(lang).vad;
      for (const p of PAGES[lang]) {
        const html = decode(read(p));
        expect(html).toContain('data-vad-start');
        expect(html).toContain(d.start);
        expect(html).toContain(d.privacy);
        expect(html).toContain(d.before);
        // Every state has its copy in the page language, so the lazy chunk carries no strings.
        for (const phase of ['asking', 'loading', 'calibrating', 'listening', 'detected', 'quiet', 'denied', 'nomic', 'unsupported', 'savedata', 'error'])
          expect(html).toContain(`data-vad-msg="${phase}"`);
      }
    });
  }

  test('the privacy line says nothing is recorded or sent, in both languages', () => {
    expect(t('en').vad.privacy).toBe('Audio stays on your device; nothing is recorded or sent.');
    expect(t('ru').vad.privacy).toMatch(/устройств.*не записывается и не отправляется/);
  });

  test('only the Sully case has the demo', () => {
    for (const id of ['yagni', 'kingpin', 'battlepro']) expect(read(`dist/cases/${id}/index.html`)).not.toContain('data-vad');
  });

  test('home carries no demo markup at all: it arrives with the Sully breakdown', () => {
    for (const p of ['dist/index.html', 'dist/ru/index.html']) expect(read(p)).not.toContain('data-vad');
  });
});

describe('nothing loads before the click', () => {
  const pages = ['dist/index.html', 'dist/ru/index.html', ...PAGES.en, ...PAGES.ru];

  test('no model, runtime or worker URL in any of these pages', () => {
    for (const p of pages) expect(read(p)).not.toMatch(DEMO_URL);
  });

  test('no model, runtime or worker URL in the JavaScript they load up front', () => {
    for (const p of ['dist/index.html', 'dist/cases/sully/index.html']) {
      const files = eagerJs(read(p));
      expect(files.length).toBeGreaterThan(0);
      for (const f of files) expect({ file: f, hit: read(f).match(DEMO_URL)?.[0] ?? null }).toEqual({ file: f, hit: null });
    }
  });

  test('the model URL lives only in a lazy chunk, and the weights ship as one static file', () => {
    const lazy = readdirSync('dist/_astro').filter((f) => f.endsWith('.js') && read(join('dist/_astro', f)).includes(WEIGHTS_FILE));
    expect(lazy.length).toBe(1);
    expect(eagerJs(read('dist/index.html'))).not.toContain(join('dist/_astro', lazy[0]));
    expect(statSync(`dist/vad/${WEIGHTS_FILE}`).size).toBe(WEIGHTS_BYTES);
  });
});

describe('audio stays on the device', () => {
  const NETWORK = /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|importScripts|RTCPeerConnection/;

  test('the worker and the audio code have no network calls', () => {
    for (const f of ['worker.ts', 'model.ts', 'onset.ts', 'resample.ts', 'states.ts', 'loader.ts'])
      expect({ f, hit: read(`src/scripts/vad/${f}`).match(NETWORK)?.[0] ?? null }).toEqual({ f, hit: null });
  });

  test('the built worker has no network calls either', () => {
    const workers = readdirSync('dist/_astro').filter((f) => f.startsWith('worker-') && read(join('dist/_astro', f)).includes('VAD weights'));
    expect(workers.length).toBe(1);
    expect(read(join('dist/_astro', workers[0]))).not.toMatch(NETWORK);
  });

  test('the progress percentage stays out of the screen-reader announcements', () => {
    expect(read('dist/cases/sully/index.html')).toMatch(/<span data-vad-progress aria-hidden="true">/);
  });

  test('the demo fetches exactly one thing: the weights, before any audio exists', () => {
    const demo = read('src/scripts/vad/demo.ts');
    expect(demo.match(/\bfetch\s*\(/g)?.length).toBe(1);
    expect(demo).toContain(WEIGHTS_FILE);
    expect(demo).not.toMatch(/XMLHttpRequest|WebSocket|sendBeacon|EventSource|MediaRecorder|RTCPeerConnection/);
  });
});

describe('analytics contract', () => {
  test('vad_demo is declared with action and a bucketed latency', () => {
    expect(EVENTS.vad_demo).toEqual(['action', 'ms']);
  });

  test('README documents vad_demo', () => {
    const row = read('README.md').split('\n').find((l) => l.startsWith('| `vad_demo`'));
    expect(row).toBeDefined();
    for (const word of ['start', 'denied', 'detected', 'error', 'ms']) expect(row).toContain(word);
  });
});

describe.skipIf(!hasChrome())('microphone requests', () => {
  // The site's scripts arrive a second late, as on a busy CI runner: the clicks must still reach a
  // page whose loader is listening.
  const slowScripts = { delay: (p: string) => (p.startsWith('/_astro/') && p.endsWith('.js') ? 1000 : 0) };
  for (const prefix of ['', '/ru']) {
    test(`a late permission from a previous visit and truncated model release the mic on ${prefix}/cases/sully/`, async () => {
      const result = await withChrome(async ({ origin, navigate, evaluate }) => {
        await navigate(origin + prefix + '/cases/sully/');
        return evaluate(`(async () => {
          let closed = 0, stopped = 0, answer = [];
          window.AudioContext = class {
            sampleRate = 48000;
            async resume() {} async close() { closed++; }
          };
          Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: () => new Promise(r => answer.push(r)) });
          const nativeFetch = window.fetch;
          window.fetch = (...args) => String(args[0]).endsWith('.bin') ? Promise.resolve(new Response(new Uint8Array(5))) : nativeFetch(...args);
          const stream = () => ({ getTracks: () => [{ stop: () => stopped++ }] });
          const start = document.querySelector('[data-vad-start]'), root = start.closest('[data-vad]');
          start.click();
          dispatchEvent(new Event('pagehide'));
          const left = root.dataset.vadPhase;
          start.click();
          answer[0](stream());
          await new Promise(r => setTimeout(r, 100));
          const old = { closed, stopped, phase: root.dataset.vadPhase };
          answer[1](stream());
          for (let i = 0; i < 300 && root.dataset.vadPhase !== 'error'; i++) await new Promise(r => setTimeout(r, 30));
          const final = { closed, stopped, phase: root.dataset.vadPhase };
          let downloadSignal;
          window.fetch = (url, opts) => {
            if (!String(url).endsWith('.bin')) return nativeFetch(url, opts);
            downloadSignal = opts.signal;
            return new Promise((_, reject) => opts.signal.addEventListener('abort', () => reject(opts.signal.reason)));
          };
          start.click(); answer[2](stream());
          for (let i = 0; i < 500 && !downloadSignal; i++) await new Promise(r => setTimeout(r, 20));
          dispatchEvent(new Event('pagehide')); start.click();
          await new Promise(r => setTimeout(r, 30));
          return { left, old, final, aborted: downloadSignal?.aborted, retry: root.dataset.vadPhase };
        })()`);
      }, slowScripts);
      expect(result).toEqual({ left: 'idle', old: { closed: 1, stopped: 1, phase: 'asking' }, final: { closed: 2, stopped: 2, phase: 'error' }, aborted: true, retry: 'asking' });
    });

    test(`a second press while waiting for permission on ${prefix}/cases/sully/ is ignored; a denial can be retried`, async () => {
      const result = await withChrome(async ({ origin, navigate, evaluate }) => {
        await navigate(origin + prefix + '/cases/sully/');
        return evaluate(`(async () => {
          let requests = 0, contexts = 0, deny;
          window.AudioContext = class {
            constructor() { contexts++; }
            async resume() {} async close() {}
          };
          Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {value: () => {
            requests++; return new Promise((_, reject) => { deny = reject; });
          }});
          const start = document.querySelector('[data-vad-start]');
          const phase = () => start.closest('[data-vad]').dataset.vadPhase;
          start.click(); start.click();
          const pending = { requests, contexts, state: phase(), disabled: start.getAttribute('aria-disabled') };
          deny(new DOMException('Denied', 'NotAllowedError'));
          for (let i = 0; i < 100 && phase() !== 'denied'; i++) await new Promise(r => setTimeout(r, 30));
          const ended = phase();
          start.click();
          return { pending, ended, retry: { requests, contexts, state: phase() } };
        })()`);
      }, slowScripts);
      expect(result).toEqual({ pending: { requests: 1, contexts: 1, state: 'asking', disabled: 'true' }, ended: 'denied', retry: { requests: 2, contexts: 2, state: 'asking' } });
    });
  }
});
