// Every post has its own creature: a small symmetric pixel organism grown from its slug
// (src/data/creature.ts). The same slug always grows the same one. It sits on the post's card on
// /writing/ and home, grows cell by cell from its middle in the post's header, and is the post's
// share preview (/og/<slug>.png, 1200×630). The GR model is not used: it grows the same GR from any
// seed, so the creatures come from a cellular automaton of their own.
import { beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { BLOG_POSTS } from '../src/data/posts';
import { writingPagePaths } from '../src/data/writing-pages';
import { SIDE, creature } from '../src/data/creature';
import { buildSite } from './fixtures/build';

beforeAll(() => buildSite());

const xy = (i: number) => [i % SIDE, Math.floor(i / SIDE)] as const;

describe('the creature', () => {
  test('the same slug grows the same creature; every post has a different one', () => {
    expect(creature('a-post')).toEqual(creature('a-post'));
    const bodies = BLOG_POSTS.map((p) => creature(p.slug).body.map(Number).join(''));
    expect(new Set(bodies).size).toBe(BLOG_POSTS.length);
  });

  test('a body: symmetric, in one piece, big enough to read as a creature, with a margin', () => {
    for (const p of BLOG_POSTS) {
      const { body } = creature(p.slug);
      for (let i = 0; i < body.length; i++) {
        const [x, y] = xy(i);
        expect(body[i], `${p.slug} mirror`).toBe(body[y * SIDE + (SIDE - 1 - x)]);
        if (y === 0 || y === SIDE - 1 || x === 0 || x === SIDE - 1) expect(body[i], `${p.slug} margin`).toBe(false);
      }
      expect(body.filter(Boolean).length, p.slug).toBeGreaterThanOrEqual(26);
    }
  });

  test('two eyes, mirrored, inside the body; it grows from one cell outward, one ring per step', () => {
    for (const p of BLOG_POSTS) {
      const { body, eyes, order } = creature(p.slug);
      const [a, b] = eyes.map(xy);
      expect(body[eyes[0]] && body[eyes[1]], p.slug).toBe(true);
      expect([b[0], b[1]]).toEqual([SIDE - 1 - a[0], a[1]]);
      expect(order.filter((o) => o === 0).length, p.slug).toBe(1);
      for (let i = 0; i < body.length; i++) {
        expect(order[i] >= 0, `${p.slug} ${i}`).toBe(body[i]);
        if (order[i] > 0) {
          // Every cell after the first touches a cell one step earlier: it grows, it does not appear.
          const [x, y] = xy(i);
          const touches = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => order[(y + dy) * SIDE + x + dx] === order[i] - 1);
          expect(touches, `${p.slug} ${i}`).toBe(true);
        }
      }
    }
  });
});

describe('where it lives', () => {
  const html = (p: string) => readFileSync(`dist/${p}`, 'utf8');
  const marks = (h: string) => [...h.matchAll(/<svg[^>]*data-creature="([^"]+)"/g)].map((m) => m[1]);

  test('on every card on /writing/ and home, in both languages', () => {
    for (const prefix of ['', 'ru/']) {
      // /writing/ comes in pages (src/data/writing-pages.ts): together they hold every post.
      const pages = writingPagePaths('all').flatMap((p) => marks(html(`${prefix}${p.slice(1)}index.html`)));
      expect(pages.sort()).toEqual(BLOG_POSTS.map((p) => p.slug).sort());
      const home = marks(html(`${prefix}index.html`));
      expect(home.length).toBeGreaterThan(0);
      for (const s of home) expect(BLOG_POSTS.some((p) => p.slug === s)).toBe(true);
    }
  });

  test('in the post header, cell by cell, each with its growth step for the animation', () => {
    const p = BLOG_POSTS[0];
    const h = html(`writing/${p.slug}/index.html`);
    const svg = h.match(/<svg[^>]*data-creature-grow="[^"]+"[\s\S]*?<\/svg>/)?.[0] ?? '';
    // Each cell, and its shadow under it, carries its step; the shadow rects are class="shadow".
    const cells = [...svg.matchAll(/<rect(?![^>]*class="shadow")[^>]*style="--step:\s*(\d+)/g)].map((m) => Number(m[1]));
    const c = creature(p.slug);
    expect(cells.length).toBe(c.body.filter(Boolean).length);
    expect(Math.max(...cells)).toBe(Math.max(...c.order));
  });

  test('as the share preview: a 1200×630 PNG per post, named in its page', () => {
    for (const p of BLOG_POSTS) {
      const file = `dist/og/${p.slug}.png`;
      expect(existsSync(file), p.slug).toBe(true);
      const png = readFileSync(file);
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], p.slug).toEqual([1200, 630]);
    }
    const p = BLOG_POSTS[0];
    for (const prefix of ['', 'ru/']) {
      const h = html(`${prefix}writing/${p.slug}/index.html`);
      expect(h).toContain(`<meta property="og:image" content="https://rossev.dev/og/${p.slug}.png"`);
      expect(h).toContain(`<meta name="twitter:image" content="https://rossev.dev/og/${p.slug}.png"`);
    }
    expect(html('index.html')).toContain('<meta property="og:image" content="https://rossev.dev/og-card.png"');
  });
});
