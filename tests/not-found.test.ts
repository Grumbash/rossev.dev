// A missing page gets the site's own 404, not Astro's default: the same look, a joke in the site's
// voice (the page is a test that failed and never got a writer) and the ways back. Vercel serves one
// /404.html for every locale, so it carries both languages and a script shows the visitor's one.
// The script also fixes the commonest miss: a path typed in the Russian keyboard layout (/с for /c,
// /ршку/ for /hire/) is sent to the path those same keys spell in the Latin layout.
import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { latinLayoutPath } from '../src/scripts/not-found';
import { t } from '../src/i18n';

setDefaultTimeout(120_000);

let html = '';
beforeAll(() => {
  execSync('bun run build', { stdio: 'ignore' });
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
