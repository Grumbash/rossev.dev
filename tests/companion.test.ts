// The GR companion on a post page: the home page's self-healing monogram (src/scripts/nca), small,
// in the bottom right corner, growing from one cell as the post is read. It grows as far as the
// share read (the reading memory's share, src/scripts/reading.ts, so a post started earlier starts
// it that far) and waits there; read on and it grows on. Fully grown, a cursor passing over it
// wounds it and it heals. At night by the reader's clock it sleeps: dim, breathing slowly.
// It loads only on post pages, only once the post is reached, never on Save-Data or 2G.
// Real Chrome over CDP: the model runs in a worker on real time, which --dump-dom's virtual time
// does not give it.
import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { buildSite } from './fixtures/build';
import { withChrome, type Cdp } from './fixtures/cdp';
import { hasChrome } from './fixtures/probe';
import { stepsFor } from '../src/scripts/nca/companion';

setDefaultTimeout(180_000);

beforeAll(() => buildSite());

const POST = 'self-healing-monogram';

describe('how far it grows', () => {
  test('nothing read, a seed; half read, about half the GR; done, the whole 300 steps; never backwards', () => {
    expect(stepsFor(0)).toBe(0);
    expect(stepsFor(0.5)).toBeGreaterThan(35);
    expect(stepsFor(0.5)).toBeLessThan(55);
    expect(stepsFor(1)).toBe(300);
    const s = Array.from({ length: 21 }, (_, i) => stepsFor(i / 20));
    expect(s).toEqual([...s].sort((a, b) => a - b));
  });
});

describe('where it is', () => {
  test('post pages load it; home, /writing/ and the other pages do not', () => {
    // Vercel serves /_vercel/* itself; those are not in dist/.
    const scripts = (path: string) => [...readFileSync(`dist/${path}`, 'utf8').matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => `dist${m[1]}`).filter((f) => existsSync(f)).map((f) => readFileSync(f, 'utf8')).join('\n');
    // The lazy chunk is named after src/scripts/nca/companion.ts; only a post page's eager script points at it.
    const lazy = /companion\.[\w-]+\.js/;
    expect(scripts(`writing/${POST}/index.html`)).toMatch(lazy);
    for (const p of ['index.html', 'writing/index.html', 'hire/index.html']) expect(scripts(p), p).not.toMatch(lazy);
  });
});

describe.skipIf(!hasChrome())('in the browser', () => {
  // Opaque pixels on the companion's canvas: how much of the GR has grown.
  const ALIVE = `(() => { const c = document.querySelector('[data-nca-companion] canvas'); if (!c) return -1; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 128) n++; return n; })()`;
  const readTo = (share: number) =>
    `(() => { const ps = [...document.querySelectorAll('.post-body > *')]; const b = ps[Math.min(ps.length - 1, Math.floor(${share} * ps.length))]; b.scrollIntoView({ block: 'start', behavior: 'instant' }); scrollBy({ top: -(innerHeight * 0.25 - 4), behavior: 'instant' }); })()`;
  const open = async ({ origin, send }: Cdp, path: string) => {
    await send('Page.enable');
    await send('Page.navigate', { url: `${origin}${path}` });
    await Bun.sleep(1200);
  };

  test('it grows with the reading, waits where the reader is, and grows on', async () => {
    const r = await withChrome(async (cdp) => {
      await open(cdp, `/writing/${POST}/`);
      await cdp.evaluate(`localStorage.clear()`);
      await open(cdp, `/writing/${POST}/`);
      await cdp.evaluate(readTo(0.02));
      await Bun.sleep(3000);
      const start = await cdp.evaluate(ALIVE);
      await cdp.evaluate(readTo(0.5));
      await Bun.sleep(6000);
      const half = await cdp.evaluate(ALIVE);
      await Bun.sleep(3000);
      const halfLater = await cdp.evaluate(ALIVE);
      await cdp.evaluate(`scrollTo({ top: document.body.scrollHeight, behavior: 'instant' })`);
      await Bun.sleep(9000);
      const full = await cdp.evaluate(ALIVE);
      const grown = await cdp.evaluate(`document.querySelector('[data-nca-companion]')?.dataset.grown`);
      return { start, half, halfLater, full, grown };
    });
    expect(r.start).toBeGreaterThanOrEqual(0);
    // Half the post read, roughly half the GR: not a seed, not the whole thing.
    expect(r.half).toBeGreaterThan(r.full * 0.3);
    expect(r.half).toBeLessThan(r.full * 0.8);
    // It waits where the reader is: no growing past the share read.
    expect(Math.abs(r.halfLater - r.half)).toBeLessThan(r.half * 0.1 + 20);
    expect(r.full).toBeGreaterThan(900);
    expect(r.grown).toBe('true');
  });

  test('a post started earlier starts it that far along', async () => {
    const r = await withChrome(async (cdp) => {
      // Stored before the page's own scripts run: seeding an open page would be overwritten by its pagehide.
      await cdp.send('Page.enable');
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('rosev_reading', JSON.stringify({ '${POST}': { f: 0.7, t: 1 } })); }` });
      await open(cdp, `/writing/${POST}/`);
      await cdp.evaluate(readTo(0.02));
      await Bun.sleep(8000);
      return cdp.evaluate(ALIVE);
    });
    expect(r).toBeGreaterThan(300);
  });

  test('grown, a cursor wounds it and it heals', async () => {
    const r = await withChrome(async (cdp) => {
      // Stored before the page's own scripts run: seeding an open page would be overwritten by its pagehide.
      await cdp.send('Page.enable');
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('rosev_reading', JSON.stringify({ '${POST}': { f: 1, t: 1, d: 1 } })); }` });
      await open(cdp, `/writing/${POST}/`);
      await cdp.evaluate(readTo(0.02));
      await Bun.sleep(9000);
      const before = await cdp.evaluate(ALIVE);
      const box = await cdp.evaluate(`(() => { const r = document.querySelector('[data-nca-companion] canvas').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
      for (let i = 0; i <= 10; i++) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x + (box.w * i) / 10, y: box.y + box.h / 2 });
      await Bun.sleep(300);
      const hurt = await cdp.evaluate(ALIVE);
      await Bun.sleep(10000);
      const healed = await cdp.evaluate(ALIVE);
      return { before, hurt, healed };
    });
    expect(r.hurt).toBeLessThan(r.before * 0.92);
    expect(r.healed).toBeGreaterThan(r.before * 0.85);
  });

  test('at night by the reader\'s clock it sleeps', async () => {
    const r = await withChrome(async (cdp) => {
      await cdp.send('Page.enable');
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `Date.prototype.getHours = () => 2;` });
      await open(cdp, `/writing/${POST}/`);
      await cdp.evaluate(readTo(0.1));
      await Bun.sleep(3000);
      return cdp.evaluate(`document.querySelector('[data-nca-companion]')?.classList.contains('is-asleep')`);
    });
    expect(r).toBe(true);
  });
});
