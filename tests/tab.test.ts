// The tab misses you. While the page is hidden, its favicon (the lime GR square) wilts, a stage at a
// time over a few minutes: the lime fades toward grey and the square sags, its columns sliding down,
// more at the edges. The tab title whispers "I'll wait…". Come back and the icon grows back
// through the same stages in a second (at once under reduced motion), and the title returns.
// Background tabs get their timers throttled: a stage that comes late only wilts it slower.
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { STAGES_MS, wilt } from '../src/scripts/tab';
import { en } from '../src/i18n/en';
import { ru } from '../src/i18n/ru';
import { buildSite } from './fixtures/build';
import { hasChrome, probeServer } from './fixtures/probe';

setDefaultTimeout(120_000);

beforeAll(() => buildSite());

// A 16×16 lime square with a black border, as RGBA.
const W = 16;
const icon = () => {
  const px = new Uint8ClampedArray(W * W * 4);
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const edge = x < 1 || y < 1 || x > W - 2 || y > W - 2;
      px.set(edge ? [10, 10, 10, 255] : [200, 255, 0, 255], i);
    }
  return px;
};
// Mean height of the opaque pixels (bigger: lower) and mean saturation, max − min over max.
const meanY = (px: Uint8ClampedArray) => {
  let s = 0, n = 0;
  for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 128) (s += Math.floor(i / 4 / W)), n++;
  return s / n;
};
const saturation = (px: Uint8ClampedArray) => {
  let s = 0, n = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) continue;
    const hi = Math.max(px[i], px[i + 1], px[i + 2]);
    const lo = Math.min(px[i], px[i + 1], px[i + 2]);
    if (hi > 0) (s += (hi - lo) / hi), n++;
  }
  return s / n;
};

describe('wilting', () => {
  test('stage 0 is the icon itself', () => {
    expect([...wilt(icon(), W, W, 0)]).toEqual([...icon()]);
  });

  test('each stage sags lower and fades greyer than the one before; the same stage is always the same', () => {
    const stages = [0, 1, 2, 3, 4, 5, 6].map((k) => wilt(icon(), W, W, k / 6));
    for (let k = 1; k < stages.length; k++) {
      expect(meanY(stages[k])).toBeGreaterThan(meanY(stages[k - 1]));
      expect(saturation(stages[k])).toBeLessThan(saturation(stages[k - 1]));
    }
    expect([...wilt(icon(), W, W, 0.5)]).toEqual([...wilt(icon(), W, W, 0.5)]);
  });

  test('six stages over a few minutes, in order', () => {
    expect(STAGES_MS.length).toBe(6);
    expect([...STAGES_MS].sort((a, b) => a - b)).toEqual([...STAGES_MS]);
    expect(STAGES_MS.at(-1)).toBeGreaterThanOrEqual(3 * 60_000);
    expect(STAGES_MS.at(-1)).toBeLessThanOrEqual(10 * 60_000);
  });

  test('the whisper is in the page language', () => {
    for (const [prefix, d] of [['', en], ['ru/', ru]] as const) {
      const toast = readFileSync(`dist/${prefix}index.html`, 'utf8').match(/<div[^>]*id="brutal-toast"[^>]*>/)![0];
      expect(toast).toContain(`data-tab-wait="${d.tab.wait}"`);
    }
  });
});

describe.skipIf(!hasChrome())('in the browser', () => {
  const PROBE = () => `<script>(async () => { try {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const report = (o) => { const pre = document.createElement('pre'); pre.id = '__probe'; pre.textContent = JSON.stringify(o); document.body.appendChild(pre); };
    let state = 'visible';
    Object.defineProperty(document, 'visibilityState', { get: () => state, configurable: true });
    Object.defineProperty(document, 'hidden', { get: () => state === 'hidden', configurable: true });
    const turn = (s) => { state = s; document.dispatchEvent(new Event('visibilitychange')); };
    await wait(800);
    const icon = () => document.querySelector('link[rel="icon"]');
    const snap = () => ({ title: document.title, href: icon().getAttribute('href').slice(0, 22), stage: icon().dataset.wilt ?? null });
    const out = { before: snap() };
    turn('hidden');
    await wait(1000); out.soon = snap();
    await wait(${STAGES_MS.at(-1)! + 5000}); out.later = snap();
    turn('visible');
    await wait(3000); out.back = snap();
    report(out);
  } catch (e) { const pre = document.createElement('pre'); pre.id = '__probe'; pre.textContent = JSON.stringify({ error: String(e && e.stack || e) }); document.body.appendChild(pre); } })();</script>`;

  let srv: ReturnType<typeof probeServer>;
  beforeAll(() => (srv = probeServer(PROBE)));
  afterAll(() => srv?.stop());

  test('hidden, the title whispers and the icon wilts through every stage; back, both come back', async () => {
    const r = await srv.run('/ru/', 'tab');
    expect(r.error).toBeUndefined();
    expect(r.before.href).toBe('/favicon.svg');
    expect(r.soon.title.startsWith(ru.tab.wait)).toBe(true);
    expect(r.soon.title).toContain(r.before.title);
    expect(r.later).toMatchObject({ href: 'data:image/png;base64', stage: String(STAGES_MS.length) });
    expect(r.back).toEqual(r.before);
  });
});
