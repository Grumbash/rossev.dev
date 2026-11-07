// Each language is its own static page: EN at /, RU at /ru/, the same paths below. A crawler sees
// one language per URL (no hidden duplicate text), finds the other through hreflang and the
// sitemap; a visitor switches with a link to the same page in the other language, anchor kept.
// UI strings live in typed dictionaries (src/i18n/<locale>.ts), so a missing key fails the build.
// Checks the built output; the dictionary part also runs tsc on deliberately broken fixtures.
import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { PROFILE } from '../src/data/profile';
import { en as enDict } from '../src/i18n/en';
import { ru as ruDict } from '../src/i18n/ru';
import { buildSite } from './fixtures/build';

setDefaultTimeout(120_000);

const SITE = 'https://rossev.dev';
// Home without the hidden RU copy; PR "home diet" left it at ~30.3 KB with it.
const HOME_GZIP_TARGET = 26_000;
const read = (p: string) => readFileSync(p, 'utf8');
const gz = (s: string) => gzipSync(s, { level: 9 }).length;
const htmlLang = (html: string) => html.match(/<html\b[^>]*\slang="([^"]+)"/)?.[1];
const canonical = (html: string) => html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]*)"/)?.[1];
const alternates = (html: string) =>
  Object.fromEntries(
    [...html.matchAll(/<link\b[^>]*rel="alternate"[^>]*>/g)]
      .map((m) => [m[0].match(/hreflang="([^"]+)"/)?.[1], m[0].match(/href="([^"]+)"/)?.[1]])
      .filter(([l]) => l),
  ) as Record<string, string>;
// Every entity Astro may emit: post titles and texts carry quotes, &, < and > (&#34;, &#38;, &lt;).
const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
const bodyText = (html: string) =>
  decode(
    html
      .slice(html.indexOf('<body'))
      .replace(/<script[\s\S]*?<\/script>/g, '')
      .replace(/<style[\s\S]*?<\/style>/g, '')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ');

// Every built page in the default locale, as its URL path: /, /writing/, /writing/<slug>/, ...
function enPages(dir = 'dist'): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      const rel = relative('dist', p);
      if (rel === 'ru' || rel === 'partials' || rel === '_astro') continue;
      out.push(...enPages(p));
    } else if (e.name === 'index.html') {
      out.push('/' + relative('dist', dir).split('\\').join('/') + (dir === 'dist' ? '' : '/'));
    }
  }
  return out.map((p) => p.replace(/^\/\/$/, '/')).sort();
}
const fileOf = (path: string) => `dist${path}index.html`;
const ruPath = (path: string) => `/ru${path}`;

let pages: string[] = [];
let sitemap = '';
let en = '';
let ru = '';

beforeAll(() => {
  buildSite();
  pages = enPages();
  en = read('dist/index.html');
  ru = existsSync('dist/ru/index.html') ? read('dist/ru/index.html') : '';
  sitemap = readdirSync('dist')
    .filter((f) => /^sitemap.*\.xml$/.test(f))
    .map((f) => read(`dist/${f}`))
    .join('\n');
});

describe('one language per URL', () => {
  test('/ru/ is Russian: lang="ru", RU copy, none of the EN-only body copy', () => {
    expect(htmlLang(ru)).toBe('ru');
    const text = bodyText(ru);
    for (const s of [PROFILE.valueLine.ru, PROFILE.summaryThirdPerson.ru, PROFILE.bioShort.ru]) expect(text).toContain(s);
    for (const s of [PROFILE.valueLine.en, PROFILE.summaryThirdPerson.en, PROFILE.bioShort.en]) expect(text).not.toContain(s);
  });

  test('/ is English: lang="en", no .lang-ru spans, no RU copy, no data-lang switch', () => {
    expect(htmlLang(en)).toBe('en');
    expect(en).not.toMatch(/class="[^"]*\blang-(ru|en)\b/);
    expect(en).not.toMatch(/\sdata-lang=/);
    expect(bodyText(en)).not.toContain(PROFILE.valueLine.ru);
  });

  test('every page exists in both locales with its own <html lang>', () => {
    expect(pages.length).toBeGreaterThan(5);
    for (const p of pages) {
      expect(existsSync(fileOf(ruPath(p))), `${ruPath(p)}`).toBe(true);
      expect(htmlLang(read(fileOf(p))), p).toBe('en');
      expect(htmlLang(read(fileOf(ruPath(p)))), ruPath(p)).toBe('ru');
    }
  });

  test('no page or script keeps the old client-side language state', () => {
    const files = [...pages.map(fileOf), ...pages.map((p) => fileOf(ruPath(p))).filter(existsSync)];
    for (const f of readdirSync('dist/_astro').filter((x) => x.endsWith('.js'))) files.push(`dist/_astro/${f}`);
    for (const f of files) {
      const s = read(f);
      expect(s, f).not.toContain('rosev_lang');
      expect(s, f).not.toContain('setSiteLang');
    }
  });

  test(`home is at most ${HOME_GZIP_TARGET} B gzipped in each locale`, () => {
    expect(gz(en)).toBeLessThanOrEqual(HOME_GZIP_TARGET);
    expect(gz(ru)).toBeLessThanOrEqual(HOME_GZIP_TARGET);
  });
});

describe('crawlers find the other language', () => {
  test('every page has reciprocal hreflang en / ru / x-default and a self canonical', () => {
    for (const p of pages) {
      const enUrl = `${SITE}${p}`;
      const ruUrl = `${SITE}${ruPath(p)}`;
      for (const [file, self] of [[fileOf(p), enUrl], [fileOf(ruPath(p)), ruUrl]] as const) {
        const html = existsSync(file) ? read(file) : '';
        const alt = alternates(html);
        expect(alt.en, `${file} hreflang=en`).toBe(enUrl);
        expect(alt.ru, `${file} hreflang=ru`).toBe(ruUrl);
        expect(alt['x-default'], `${file} x-default`).toBe(enUrl);
        expect(canonical(html), `${file} canonical`).toBe(self);
      }
    }
  });

  test('the sitemap lists every indexable page in both locales', () => {
    for (const p of pages) {
      if (/noindex/.test(read(fileOf(p)))) continue;
      expect(sitemap, p).toContain(`<loc>${SITE}${p}</loc>`);
      expect(sitemap, ruPath(p)).toContain(`<loc>${SITE}${ruPath(p)}</loc>`);
    }
    expect(sitemap).not.toContain('/booked');
    expect(sitemap).not.toContain('/partials/');
  });

  test('RU fragments exist and RU home loads them, not the EN ones', () => {
    expect(existsSync('dist/ru/partials/posts-all/index.html')).toBe(true);
    expect(existsSync('dist/ru/partials/case-yagni/index.html')).toBe(true);
    expect(ru).toContain('hx-get="/ru/partials/posts-all/"');
    expect(ru).toContain('data-case-src="/ru/partials/case-yagni"');
    expect(ru).not.toMatch(/(hx-get|data-case-src)="\/partials\//);
    const cfg = JSON.parse(read('vercel.json'));
    const sources = (cfg.headers ?? []).filter((h: any) => h.headers?.some((x: any) => /noindex/.test(x.value))).map((h: any) => h.source);
    expect(sources).toContain('/ru/partials/(.*)');
  });
});

describe('the language control is a link to the same page in the other language', () => {
  const switches = (html: string) =>
    [...html.matchAll(/<a\b[^>]*data-track="lang_switch"[^>]*>/g)].map((m) => ({
      href: m[0].match(/href="([^"]+)"/)?.[1],
      to: m[0].match(/data-track-to="([^"]+)"/)?.[1],
    }));

  test('on every page, EN links to RU and RU links back, still tracked as lang_switch', () => {
    for (const p of pages) {
      expect(switches(read(fileOf(p))), p).toEqual([{ href: ruPath(p), to: 'ru' }]);
      const ruFile = fileOf(ruPath(p));
      expect(switches(existsSync(ruFile) ? read(ruFile) : ''), ruPath(p)).toEqual([{ href: p, to: 'en' }]);
    }
  });

  test('the accessible name starts with the visible language code and describes the destination', () => {
    for (const [path, name] of [['/', ruDict.nav.readIn], ['/ru/', enDict.nav.readIn]]) {
      const link = read(fileOf(path)).match(/<a\b([^>]*data-lang-switch[^>]*)>\s*(EN|RU)\s*<\/a>/)!;
      expect(link[1]).toContain(`aria-label="${link[2]} — ${name}"`);
    }
  });

  test('switching keeps the query and the anchor', async () => {
    const { langSwitchHref } = await import('../src/scripts/site');
    expect(langSwitchHref('/ru/', '?case=yagni', '#case-yagni')).toBe('/ru/?case=yagni#case-yagni');
    expect(langSwitchHref('/writing/', '', '#experience')).toBe('/writing/#experience');
    expect(langSwitchHref('/ru/how-its-built/', '', '')).toBe('/ru/how-its-built/');
  });
});

describe('UI dictionaries', () => {
  const flatKeys = (o: Record<string, unknown>, prefix = ''): string[] =>
    Object.entries(o).flatMap(([k, v]) =>
      v && typeof v === 'object' ? flatKeys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
    );

  test('en and ru have identical key sets, and every value is filled', async () => {
    const { en: EN } = await import('../src/i18n/en');
    const { ru: RU } = await import('../src/i18n/ru');
    expect(flatKeys(RU).sort()).toEqual(flatKeys(EN).sort());
    for (const dict of [EN, RU]) {
      for (const k of flatKeys(dict)) {
        const v = k.split('.').reduce<any>((o, part) => o[part], dict);
        expect(typeof v === 'function' || (typeof v === 'string' && v.trim().length > 0), k).toBe(true);
      }
    }
  });

  // tsc on a fixture next to src/i18n: the Dict type must reject a missing and an extra key.
  const tsc = (body: string) => {
    const dir = mkdtempSync(join(resolve('src/i18n'), '.fixture-'));
    const file = join(dir, 'fixture.ts');
    writeFileSync(file, body);
    const r = spawnSync(resolve('node_modules/.bin/tsc'), ['--noEmit', '--strict', '--skipLibCheck', '--target', 'es2022', '--moduleResolution', 'bundler', '--module', 'esnext', file], { encoding: 'utf8' });
    execSync(`rm -rf "${dir}"`);
    return r;
  };

  test('the type layer accepts ru as is', () => {
    const r = tsc(`import type { Dict } from '../index';\nimport { ru } from '../ru';\nexport const ok: Dict = ru;\n`);
    expect(r.status, r.stdout).toBe(0);
  });

  test('a dictionary missing a key does not compile', () => {
    const r = tsc(`import type { Dict } from '../index';\nimport { en } from '../en';\nconst { nav, ...rest } = en;\nexport const bad: Dict = rest;\n`);
    expect(r.status).not.toBe(0);
    expect(r.stdout).toMatch(/nav/);
  });

  test('a dictionary with an unknown key does not compile', () => {
    const r = tsc(`import type { Dict } from '../index';\nimport { en } from '../en';\nexport const bad: Dict = { ...en, bogusKey: 'x' };\n`);
    expect(r.status).not.toBe(0);
    expect(r.stdout).toMatch(/bogusKey/);
  });
});

// Moved from nca-regrow.test.ts, which now runs only when the automaton changes: the caption a
// visitor sees when the GR monogram regrows is copy, and copy changes on its own.
describe('the visitor is told what happened when GR regrows', () => {
  test('both locales say the monogram is regrowing from a single cell', () => {
    expect(enDict.nca.regrowing).toMatch(/regrow/i);
    expect(enDict.nca.regrowing).toMatch(/single cell|one cell/i);
    expect(ruDict.nca.regrowing.length).toBeGreaterThan(10);
    expect(ruDict.nca.regrowing).toMatch(/[а-яё]/i);
  });
});
