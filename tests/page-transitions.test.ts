// No page loads between pages. Every page opts into cross-document View Transitions, so a click to
// another page crossfades instead of blanking, the top bar stays still, and a post's title flies
// from its card on /writing/ (or from the inline brief on home) into the post page's heading.
// Hovering a link prefetches the page (Speculation Rules), so the next page is already here.
// Prefetch, not prerender: a prerendered page runs its scripts, and Umami would count a page view
// for a page nobody opened. Reduced motion gets the plain navigation.
import { beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BLOG_POSTS } from '../src/data/posts';
import { buildSite } from './fixtures/build';

beforeAll(() => buildSite());

const html = (path: string) => readFileSync(join('dist', path), 'utf8');
const pages = () => [...new Bun.Glob('**/index.html').scanSync('dist')].filter((f) => !f.includes('partials/'));
const css = () => readFileSync('src/styles/brutalism.css', 'utf8').replace(/\s+/g, ' ');
// The shared-element names on a page: --vt on .vt-title elements.
const names = (h: string) => [...h.matchAll(/class="[^"]*\bvt-title\b[^"]*"[^>]*style="[^"]*--vt:\s*([\w-]+)/g)].map((m) => m[1]);

describe('the transition', () => {
  test('every page opts in, unless the visitor asked for less motion', () => {
    expect(css()).toMatch(/@media \(prefers-reduced-motion: ?no-preference\) ?\{ ?@view-transition ?\{ ?navigation: ?auto;? ?\} ?\}/);
  });

  test('the top bar is one named element, so it stays put while the page changes under it', () => {
    expect(css()).toMatch(/\.top-nav ?\{[^}]*view-transition-name: ?site-nav/);
  });

  test('a title carries its name in --vt, so the language morph can borrow view-transition-name and give it back', () => {
    expect(css()).toMatch(/\.vt-title ?\{ ?view-transition-name: ?var\(--vt\);? ?\}/);
  });
});

describe('the title that flies', () => {
  const name = (slug: string) => `post-${slug}`;

  test('on /writing/ every card title is named after its post, in both languages', () => {
    for (const prefix of ['', 'ru/']) {
      const n = names(html(`${prefix}writing/index.html`));
      expect(n.sort()).toEqual(BLOG_POSTS.map((p) => name(p.slug)).sort());
    }
  });

  test('the post page heading has the same name, so the card title lands in it', () => {
    for (const p of BLOG_POSTS)
      for (const prefix of ['', 'ru/']) {
        const h = html(`${prefix}writing/${p.slug}/index.html`);
        expect(h.match(/<h1\b[^>]*>/)?.[0], `${prefix}${p.slug}`).toContain(`--vt: ${name(p.slug)}`);
      }
  });

  test('the inline brief on home names its heading too: "read the full post" lands the same way', () => {
    const p = BLOG_POSTS[0];
    const partial = html(`partials/post-${p.id}/index.html`);
    expect(names(partial)).toEqual([name(p.slug)]);
  });

  test('home cards are not named: the brief of the same post may sit next to them, and a name must be unique', () => {
    expect(names(html('index.html'))).toEqual([]);
  });

  test('no page names two elements alike (a duplicate makes the browser skip the transition)', () => {
    for (const f of pages()) {
      const n = names(html(f));
      expect(new Set(n).size, f).toBe(n.length);
    }
  });
});

describe('the next page is already here', () => {
  const rules = (h: string) => {
    const m = h.match(/<script type="speculationrules">([\s\S]*?)<\/script>/);
    return m ? JSON.parse(m[1]) : null;
  };

  test('every page carries the same speculation rules: prefetch site links on hover, never prerender', () => {
    const all = pages().map((f) => [f, rules(html(f))] as const);
    for (const [f, r] of all) {
      if (f === 'c/index.html' || f === 'ru/c/index.html') continue; // the QR card has its own small head
      expect(r, f).not.toBeNull();
      expect(r.prerender, f).toBeUndefined();
      expect(r.prefetch?.[0]?.eagerness, f).toBe('moderate');
    }
    expect(new Set(all.filter(([, r]) => r).map(([, r]) => JSON.stringify(r))).size).toBe(1);
  });

  test('only pages: no partials, files to download, new tabs or links that leave the site', () => {
    const where = JSON.stringify(rules(html('index.html')).prefetch[0].where);
    for (const s of ['/partials/*', '/ru/partials/*', '*.pdf', '*.vcf', '*.txt', '[download]', '[target=_blank]']) expect(where).toContain(s);
    expect(where).toContain('"href_matches":"/*"');
  });
});
