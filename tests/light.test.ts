// Shadows from real light. The hard brutalist shadows (--shadow-sm/md/lg) are offset by two numbers,
// --lx and --ly, 1 and 1 without JS: the same down-right shadows as always. The cursor is the light:
// shadows fall away from it, always the same length; with the cursor in the middle of the screen they
// fall down-right as before. On a phone the tilt is the light (where the browser gives it without a
// permission prompt). Loaded on the first pointer move; still under reduced motion.
import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { light, tilt } from '../src/scripts/light';
import { buildSite } from './fixtures/build';
import { hasChrome } from './fixtures/probe';
import { withChrome, type Cdp } from './fixtures/cdp';

setDefaultTimeout(120_000);

beforeAll(() => buildSite());

const len = (v: { x: number; y: number }) => Math.hypot(v.x, v.y);

describe('where the light is', () => {
  test('cursor in the middle: down-right, as without JS', () => {
    const v = light(640, 450, 1280, 900);
    expect(v.x).toBeCloseTo(1, 1);
    expect(v.y).toBeCloseTo(1, 1);
  });

  test('shadows fall away from the cursor, always the same length', () => {
    const tl = light(0, 0, 1280, 900);
    const br = light(1280, 900, 1280, 900);
    const right = light(1280, 450, 1280, 900);
    expect(tl.x).toBeGreaterThan(0.9);
    expect(tl.y).toBeGreaterThan(0.9);
    expect(br.x).toBeLessThan(0);
    expect(br.y).toBeLessThan(0);
    expect(right.x).toBeLessThan(0);
    for (const v of [tl, br, right, light(100, 800, 1280, 900)]) expect(len(v)).toBeCloseTo(Math.SQRT2, 5);
  });

  test('a phone held up as usual (tilted 45° toward you) is the middle; tilting it moves the light', () => {
    const still = tilt(45, 0);
    expect(still.x).toBeCloseTo(1, 1);
    expect(still.y).toBeCloseTo(1, 1);
    expect(tilt(45, 40).x).toBeLessThan(0);
    expect(tilt(90, 0).y).toBeLessThan(still.y);
  });
});

describe('the build', () => {
  test('the shadow sizes scale by --lx and --ly, 1 without JS', () => {
    const css = [...readFileSync('dist/index.html', 'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('');
    for (const [name, px] of [['sm', 4], ['md', 6], ['lg', 10]] as const)
      expect(css.replace(/\s+/g, '')).toContain(`--shadow-${name}:calc(${px}px*var(--lx,1))calc(${px}px*var(--ly,1))0`);
  });
});

describe.skipIf(!hasChrome())('in the browser', () => {
  const shadow = `getComputedStyle(document.querySelector('.brutal-btn:not(.brutal-btn-sm)')).boxShadow`;
  // fx, fy: where on the viewport, as a share of it (the headless window's viewport is smaller than the window).
  const move = async ({ send, evaluate }: Cdp, fx: number, fy: number) => {
    const [w, h] = await evaluate('[innerWidth, innerHeight]');
    for (let i = 0; i < 3; i++) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(fx * w) - 3 + i, y: Math.round(fy * h) - 2 });
    await Bun.sleep(600);
  };
  const offsets = (s: string) => s.match(/(-?[\d.]+)px (-?[\d.]+)px 0px/)!.slice(1).map(Number);

  test('the cursor bottom-right throws the shadows up-left; back in the middle, down-right', async () => {
    const r = await withChrome(async (cdp) => {
      await cdp.send('Page.enable');
      await cdp.send('Page.navigate', { url: `${cdp.origin}/` });
      await Bun.sleep(1500);
      const before = await cdp.evaluate(shadow);
      await move(cdp, 1, 1);
      const corner = await cdp.evaluate(shadow);
      await move(cdp, 0.5, 0.5);
      return { before, corner, middle: await cdp.evaluate(shadow) };
    });
    expect(offsets(r.before)).toEqual([4, 4]);
    const [cx, cy] = offsets(r.corner);
    expect(cx).toBeLessThan(0);
    expect(cy).toBeLessThan(0);
    const [mx, my] = offsets(r.middle);
    expect(mx).toBeGreaterThan(3);
    expect(my).toBeGreaterThan(3);
  });

  test('under reduced motion the light stays where it was', async () => {
    const r = await withChrome(async (cdp) => {
      await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await cdp.send('Page.enable');
      await cdp.send('Page.navigate', { url: `${cdp.origin}/` });
      await Bun.sleep(1500);
      await move(cdp, 1, 1);
      return cdp.evaluate(shadow);
    });
    expect(offsets(r)).toEqual([4, 4]);
  });
});
