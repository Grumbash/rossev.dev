// A missing page gets the site's own 404, not Astro's default: the same look, a joke in the site's
// voice (the page is a test that failed and never got a writer) and the ways back. Vercel serves one
// /404.html for every locale, so it carries both languages and a script shows the visitor's one.
// The script also fixes the commonest miss: a path typed in the Russian keyboard layout (/с for /c,
// /ршку/ for /hire/) is sent to the path those same keys spell in the Latin layout.
import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { latinLayoutPath, suggestPath } from '../src/scripts/not-found';
import { t } from '../src/i18n';
import { buildSite } from './fixtures/build';

setDefaultTimeout(120_000);

let html = '';
beforeAll(() => {
  buildSite();
  html = existsSync('dist/404.html') ? readFileSync('dist/404.html', 'utf8') : '';
});

const hrefs = (page: string) => [...page.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)].map((m) => m[1]);

describe('Russian keyboard layout', () => {
  test('a path typed in the Russian layout becomes the one the same keys spell in Latin', () => {
    expect(latinLayoutPath('/с')).toBe('/c');
    expect(latinLayoutPath('/С/')).toBe('/C/');
    expect(latinLayoutPath('/ршку/')).toBe('/hire/');
    expect(latinLayoutPath('/ru/ршку/')).toBe('/ru/hire/');
    expect(latinLayoutPath('/цкшештп/')).toBe('/writing/');
  });

  test('a path with nothing to fix is left alone, so the 404 can never redirect in a loop', () => {
    for (const p of ['/', '/hire/', '/nope', '/ru/writing/x/', '/c/']) expect(latinLayoutPath(p)).toBeNull();
  });
});

describe('404 page', () => {
  test('is built, kept out of search, and has no canonical of its own', () => {
    expect(html).not.toBe('');
    expect(html).toMatch(/<meta name="robots" content="noindex/);
    expect(html).not.toContain('rel="canonical"');
  });

  test('carries the copy in both languages', () => {
    for (const l of ['en', 'ru'] as const) {
      expect(html).toContain(t(l).notFound.title);
      expect(html).toContain(t(l).notFound.lead);
    }
  });

  test('links the way back in both languages: home, work with me, writing, how it is built', () => {
    const links = hrefs(html);
    for (const p of ['/', '/hire/', '/writing/', '/how-its-built/']) {
      expect(links).toContain(p);
      expect(links).toContain(p === '/' ? '/ru/' : `/ru${p}`);
    }
  });

  test('uses the site stylesheet and loads its script from the site, not inline', () => {
    expect(html).toContain('brutal-box');
    expect(html).toMatch(/<script[^>]+type="module"[^>]+src="\/_astro\/[^"]+\.js"/);
  });
});

// The page also says where the visitor probably meant to go: the closest real page to the missed path,
// from /routes.json, which the build writes from the pages it actually emitted.
const ROUTES = ['/', '/hire/', '/writing/', '/how-its-built/', '/writing/the-new-ai-bottleneck/', '/c/', '/ru/', '/ru/hire/', '/ru/writing/'];

describe('suggested page', () => {
  test('a typo, a missing slash or capitals lead to the page that was meant', () => {
    expect(suggestPath('/hier', ROUTES)).toBe('/hire/');
    expect(suggestPath('/hire', ROUTES)).toBe('/hire/');
    expect(suggestPath('/HIRE/', ROUTES)).toBe('/hire/');
    expect(suggestPath('/writng/', ROUTES)).toBe('/writing/');
    expect(suggestPath('/how-its-buit', ROUTES)).toBe('/how-its-built/');
    expect(suggestPath('/writing/the-new-ai-botleneck', ROUTES)).toBe('/writing/the-new-ai-bottleneck/');
  });

  test('stays in the language of the missed path', () => {
    expect(suggestPath('/ru/hier/', ROUTES)).toBe('/ru/hire/');
    expect(suggestPath('/ru/writng', ROUTES)).toBe('/ru/writing/');
  });

  test('suggests nothing when no page is close', () => {
    for (const p of ['/completely-unrelated-thing', '/wp-admin/setup.php', '/x/y/z/q']) expect(suggestPath(p, ROUTES)).toBeNull();
  });

  test('/routes.json lists exactly the pages the build emitted, except fragments, /booked, the /c card and the offline page', () => {
    const pages: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name === 'index.html') pages.push(`/${p.slice('dist/'.length, -'index.html'.length)}`);
      }
    };
    walk('dist');
    const want = pages.filter((p) => !/\/partials\/|^(\/ru)?\/(booked|c|offline)\/$/.test(p)).sort();
    const routes: string[] = JSON.parse(readFileSync('dist/routes.json', 'utf8'));
    expect([...routes].sort()).toEqual(want);
    expect(routes).toContain('/hire/');
    expect(routes).toContain('/ru/hire/');
  });
});

// The joke is the site's own self-healing GR: the 404 shows it broken, and it grows back.
describe('healing monogram', () => {
  test('the 404 carries the monogram canvas, its static stand-in and a caption in both languages', () => {
    expect(html).toContain('id="nca-canvas"');
    expect(html).toMatch(/<svg[^>]*class="[^"]*nca-fallback/);
    for (const l of ['en', 'ru'] as const) expect(html).toContain(t(l).notFound.healCaption);
  });
});
