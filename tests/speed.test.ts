// The site measures itself for you. Under the footer's fine print: "This page opened for you in 0.28 s"
// and, for engineers, how: the server's first byte, the first paint and the bytes that came over the
// network, or "from this browser's cache" when nothing did. Real numbers from the Performance API in
// this visitor's browser (largest contentful paint, else first paint), never sent anywhere. Back to the
// page from the back/forward cache: restored instantly. In the page's language.
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { speedLine } from '../src/scripts/speed';
import { EVENTS } from '../src/scripts/analytics';
import { en } from '../src/i18n/en';
import { ru } from '../src/i18n/ru';
import { buildSite } from './fixtures/build';
import { hasChrome, probeServer } from './fixtures/probe';

setDefaultTimeout(120_000);

beforeAll(() => buildSite());

describe('the line', () => {
  test('seconds and the how, in English', () => {
    expect(speedLine({ lcp: 284, fcp: 191, ttfb: 40, bytes: 34_800 }, 'en', en.speed)).toEqual({
      main: 'This page opened for you in 0.28 s',
      detail: 'server 40 ms · first paint 0.19 s · 34 KB over the network',
    });
  });

  test('in Russian, with a decimal comma; from the cache when nothing came over the network', () => {
    expect(speedLine({ lcp: 1250, fcp: 600, ttfb: 3, bytes: 0 }, 'ru', ru.speed)).toEqual({
      main: 'Эта страница открылась у вас за 1,25 с',
      detail: 'сервер 3 мс · первая отрисовка 0,60 с · из кэша этого браузера',
    });
  });

  test('no largest paint yet: the first paint is the number', () => {
    expect(speedLine({ lcp: 0, fcp: 410, ttfb: 22, bytes: 9_000 }, 'en', en.speed).main).toBe('This page opened for you in 0.41 s');
  });

  test('not tracked: the numbers go nowhere', () => {
    expect(Object.keys(EVENTS).filter((k) => /speed|perf|timing|vital/.test(k))).toEqual([]);
    expect(readFileSync('src/scripts/speed.ts', 'utf8')).not.toMatch(/fetch\(|sendBeacon|umami/);
  });
});

describe('the build', () => {
  test('the footer has the line, empty and hidden until measured, with its words in the page language', () => {
    for (const [prefix, d] of [['', en], ['ru/', ru]] as const) {
      const p = readFileSync(`dist/${prefix}index.html`, 'utf8').match(/<p[^>]*data-speed[^>]*>(.*?)<\/p>/)!;
      expect(p[0]).toMatch(/\bhidden\b/);
      expect(p[1]).toBe('');
      expect(p[0]).toContain(`data-speed-opened="${d.speed.opened}"`);
    }
  });
});

describe.skipIf(!hasChrome())('in the browser', () => {
  const PROBE = () => `<script>(async () => { try {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await wait(2500);
    const p = document.querySelector('[data-speed]');
    const pre = document.createElement('pre'); pre.id = '__probe';
    pre.textContent = JSON.stringify({ hidden: p.hidden, text: p.textContent.replace(/\\s+/g, ' ').trim() });
    document.body.appendChild(pre);
  } catch (e) { const pre = document.createElement('pre'); pre.id = '__probe'; pre.textContent = JSON.stringify({ error: String(e && e.stack || e) }); document.body.appendChild(pre); } })();</script>`;

  let srv: ReturnType<typeof probeServer>;
  beforeAll(() => (srv = probeServer(PROBE)));
  afterAll(() => srv?.stop());

  test('after the page loads, the line says how fast it opened, in seconds, and how', async () => {
    const r = await srv.run('/ru/', 'speed');
    expect(r.error).toBeUndefined();
    expect(r.hidden).toBe(false);
    expect(r.text).toMatch(/^Эта страница открылась у вас за \d+,\d\d с/);
    expect(r.text).toMatch(/сервер \d+ мс · первая отрисовка \d+,\d\d с · /);
  });
});
