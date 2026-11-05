// The GR monogram is a toy far down the page, so it must cost almost nothing until a
// visitor scrolls to it, cost little when they do, and nothing at all on a data-saving
// or 2G connection. Checks the built page and the shipped weights.
import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { decodeWeights } from '../src/scripts/nca/weights';
import { shouldLoadNca } from '../src/scripts/nca/loader';
import { buildSite } from './fixtures/build';

setDefaultTimeout(120_000);

let html = '';
const gz = (b: Buffer | string) => gzipSync(b).length;

beforeAll(() => {
  buildSite();
  html = readFileSync('dist/index.html', 'utf8');
});

const eagerScripts = () =>
  [...html.matchAll(/<script[^>]*\ssrc="(\/_astro\/[^"]+\.js)"/g)].map((m) => readFileSync('dist' + m[1], 'utf8'));
const inlineStyles = () => [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');

describe('before the visitor reaches the monogram', () => {
  test('the page ships only a small loader for it, which imports the rest on demand', () => {
    // A chunk belongs to the monogram if it touches its markup or module, not if some
    // unrelated identifier happens to contain the letters n-c-a (openCaseBreakdown).
    const nca = eagerScripts().filter((s) => /nca-(block|canvas|section|fallback)|monogram/i.test(s));
    expect(nca.length).toBeGreaterThan(0);
    for (const s of nca) {
      expect(gz(s)).toBeLessThan(600);
      expect(s).toMatch(/import\(/);
      // The pointer, keyboard and frame-drawing code lives in the lazy chunk.
      expect(s).not.toMatch(/pointerdown|putImageData|lostpointercapture/);
    }
  });

  test('the critical inline CSS keeps at most a size reservation for the block', () => {
    const rules = inlineStyles().match(/\.nca-[\w-]+[^{]*\{/g) ?? [];
    expect(rules.length).toBeLessThanOrEqual(2);
  });

  test('the block reserves its size so the lazy CSS does not shift the layout', () => {
    expect(html).toMatch(/<canvas[^>]*id="nca-canvas"[^>]*\swidth="56"[^>]*\sheight="56"|<canvas[^>]*\sheight="56"[^>]*\swidth="56"[^>]*id="nca-canvas"/);
    const css = inlineStyles();
    expect(css).toMatch(/\.nca-[\w-]+[^{]*\{[^}]*(min-height|aspect-ratio|height)\s*:/);
  });

  test('neither the weights nor the worker are referenced from the HTML', () => {
    expect(html).not.toMatch(/gr\.(json|bin)/);
    expect(html).not.toMatch(/worker-[\w-]+\.js/);
  });
});

describe('when the visitor does reach it', () => {
  test('the weights ship as a compact binary under 20 KB gzipped, and the JSON is gone', () => {
    expect(existsSync('public/nca/gr.json')).toBe(false);
    const bin = readFileSync('public/nca/gr.bin');
    expect(gz(bin)).toBeLessThan(20_000);
  });

  test('the binary decodes to the 8,320-parameter model the page describes', () => {
    const buf = readFileSync('public/nca/gr.bin');
    const w = decodeWeights(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    expect(w.size).toBe(56);
    expect(w.channels).toBe(16);
    const params = w.w1.flat().length + w.b1.length + w.w2.flat().length;
    expect(params).toBe(8320);
  });
});

describe('on a connection that asks to save data', () => {
  const nav = (connection?: object) => ({ connection }) as unknown as Navigator;

  test('the model loads on a normal connection or when the browser says nothing', () => {
    expect(shouldLoadNca(nav())).toBe(true);
    expect(shouldLoadNca(nav({ effectiveType: '4g', saveData: false }))).toBe(true);
    expect(shouldLoadNca(nav({ effectiveType: '3g' }))).toBe(true);
  });

  test('Save-Data or 2G skips the model entirely', () => {
    expect(shouldLoadNca(nav({ saveData: true, effectiveType: '4g' }))).toBe(false);
    expect(shouldLoadNca(nav({ effectiveType: '2g' }))).toBe(false);
    expect(shouldLoadNca(nav({ effectiveType: 'slow-2g' }))).toBe(false);
  });

  test('the page has a static GR fallback that costs about a kilobyte', () => {
    const fallback = html.match(/<(svg|img)[^>]*class="[^"]*nca-fallback[^"]*"[\s\S]*?(<\/svg>|>)/)?.[0];
    expect(fallback).toBeDefined();
    expect(gz(fallback!)).toBeLessThan(1500);
  });
});
