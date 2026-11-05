// Home must stay well under its byte budget as posts keep coming, without losing anything a
// visitor or a crawler gets today. Home carries the 6 latest posts and links the rest; page
// scripts ship as bundled modules, not inline; each architecture case gets its own indexable
// page, and home's <details> loads the breakdown only when opened (?case= deep links included).
// Checks the built output; the loader part runs src/scripts/case-loader.ts on a fake DOM.
import { afterEach, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { BLOG_POSTS, CASE_STUDIES, EXPERIENCE } from '../src/data/profile';
import { buildSite } from './fixtures/build';

setDefaultTimeout(120_000);

const SITE = 'https://rossev.dev';
// Real headroom under perf-budgets.json's 36,000 B, so a few more posts or a hero line don't tip it.
const HOME_GZIP_TARGET = 32_000;
// The theme no-flash snippet must run before first paint, so it stays inline; nothing else may.
const INLINE_SCRIPT_GZIP_MAX = 400;

const read = (p: string) => readFileSync(p, 'utf8');
const gz = (s: string) => gzipSync(s, { level: 9 }).length;
const canonical = (html: string) => html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]*)"/)?.[1];
const title = (html: string) => html.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? '';
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
const casesOnHome = CASE_STUDIES.filter((c) => EXPERIENCE.some((e) => e.caseId === c.id));

let home = '';
let sitemap = '';

beforeAll(() => {
  buildSite();
  home = read('dist/index.html');
  sitemap = readdirSync('dist')
    .filter((f) => /^sitemap.*\.xml$/.test(f))
    .map((f) => read(`dist/${f}`))
    .join('\n');
});

describe('home bytes', () => {
  test(`index.html is at most ${HOME_GZIP_TARGET} B gzipped`, () => {
    expect(gz(home)).toBeLessThanOrEqual(HOME_GZIP_TARGET);
  });

  test(`inline scripts (not JSON-LD) total at most ${INLINE_SCRIPT_GZIP_MAX} B gzipped`, () => {
    const inline = [...home.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
      .filter(([, attrs, body]) => body.trim() && !/application\/ld\+json/.test(attrs) && !/src=/.test(attrs))
      .map(([, , body]) => body);
    const total = inline.reduce((sum, s) => sum + gz(s), 0);
    expect(total, `inline: ${inline.map((s) => s.trim().slice(0, 60)).join(' | ')}`).toBeLessThanOrEqual(INLINE_SCRIPT_GZIP_MAX);
    // The no-flash theme snippet is still there, in <head>.
    const head = home.slice(0, home.indexOf('</head>'));
    expect(head).toMatch(/<script>[\s\S]*rosev_theme[\s\S]*?<\/script>/);
  });
});

describe('home shows the latest posts and links the rest', () => {
  const latest = [...BLOG_POSTS].sort((a, b) => b.published.localeCompare(a.published)).slice(0, 6);

  test('at most 6 post cards, and they are the 6 latest', () => {
    const cards = [...home.matchAll(/<article class="brutal-box post-card"/g)];
    expect(cards.length).toBeLessThanOrEqual(6);
    const ids = [...home.matchAll(/data-track="post_open"[^>]*data-track-id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(latest.map((p) => p.id));
  });

  test('the writing section links to /writing/ for all posts', () => {
    const at = home.indexOf('id="writing"');
    const writing = home.slice(at, home.indexOf('</section>', at));
    expect(writing).toMatch(/<a\b[^>]*href="\/writing\/"/);
  });
});

describe('every architecture case has its own page', () => {
  for (const c of casesOnHome) {
    describe(c.id, () => {
      const file = `dist/cases/${c.id}/index.html`;
      const url = `${SITE}/cases/${c.id}/`;
      const html = () => (existsSync(file) ? read(file) : '');

      test('exists, with its own title and a self canonical', () => {
        expect(existsSync(file)).toBe(true);
        expect(decode(title(html()))).toContain(c.title.en);
        expect(canonical(html())).toBe(url);
        expect(html()).toMatch(new RegExp(`<meta[^>]*property="og:url"[^>]*content="${url}"`));
      });

      test('carries the whole breakdown, outcomes included', () => {
        const page = decode(html());
        expect(page).toContain(c.architecture.en.challenge);
        expect(page).toContain(c.architecture.en.outcomes[0]);
      });

      test('is in the sitemap', () => {
        expect(sitemap).toContain(`<loc>${url}</loc>`);
      });
    });
  }
});

describe("home's case <details> load the breakdown on open", () => {
  for (const c of casesOnHome) {
    test(c.id, () => {
      const at = home.indexOf(`id="case-${c.id}"`);
      expect(at).toBeGreaterThan(-1);
      const open = home.lastIndexOf('<details', at);
      const details = home.slice(open, home.indexOf('</details>', at));
      expect(decode(details)).not.toContain(c.architecture.en.challenge);
      expect(details).not.toContain('blueprint-inspector');
      // Where to load it from, and a plain link to the page for no-JS and crawlers.
      expect(details).toContain(`data-case-src="/partials/case-${c.id}"`);
      expect(details).toMatch(new RegExp(`<a\\b[^>]*href="/cases/${c.id}/"`));
      const partial = `dist/partials/case-${c.id}/index.html`;
      expect(existsSync(partial)).toBe(true);
      expect(decode(read(partial))).toContain(c.architecture.en.challenge);
    });
  }
});

// A minimal fake DOM: details elements with a body slot, a fetch that records urls.
describe('case loader (src/scripts/case-loader.ts)', () => {
  const g = globalThis as any;
  afterEach(() => {
    for (const k of ['window', 'document', 'location']) delete g[k];
  });

  function setup(search: string, respond: (url: string) => Promise<{ ok: boolean; text: () => Promise<string> }>) {
    const fetched: string[] = [];
    const docListeners: Record<string, ((e: any) => void)[]> = {};
    const all: Record<string, any> = {};
    for (const c of casesOnHome) {
      const body = { innerHTML: `<a href="/cases/${c.id}/">Open</a>` };
      all[`case-${c.id}`] = {
        id: `case-${c.id}`,
        open: false,
        dataset: { caseSrc: `/partials/case-${c.id}` },
        classList: { contains: (k: string) => k === 'job-case' },
        querySelector: (sel: string) => (sel === '[data-case-body]' ? body : null),
        scrollIntoView: () => {},
        body,
      };
    }
    g.location = { search };
    g.window = { location: g.location };
    g.document = {
      readyState: 'complete',
      getElementById: (id: string) => all[id] ?? null,
      querySelectorAll: (sel: string) => (sel === '.job-case' ? Object.values(all) : []),
      addEventListener: (type: string, fn: any) => (docListeners[type] ??= []).push(fn),
    };
    g.fetch = undefined;
    const fetchFn = (url: string) => {
      fetched.push(url);
      return respond(url);
    };
    return { all, fetched, fetchFn, docListeners };
  }
  const ok = (html: string) => async () => ({ ok: true, text: async () => html });
  const flush = () => new Promise((r) => setTimeout(r, 0));

  test('?case=yagni opens the YAGNI breakdown and fills it from its partial', async () => {
    const { all, fetched, fetchFn } = setup('?case=yagni', ok('<div class="blueprint-inspector">YAGNI</div>'));
    const mod = await import(`../src/scripts/case-loader.ts?t=${Math.random()}`);
    mod.initCaseLoader(fetchFn);
    await flush();
    expect(all['case-yagni'].open).toBe(true);
    expect(fetched).toEqual(['/partials/case-yagni']);
    expect(all['case-yagni'].body.innerHTML).toContain('blueprint-inspector');
    expect(typeof g.window.openCaseBreakdown).toBe('function');
  });

  test('openCaseBreakdown and a visitor toggle load each case once', async () => {
    const { all, fetched, fetchFn, docListeners } = setup('', ok('<div class="blueprint-inspector">x</div>'));
    const mod = await import(`../src/scripts/case-loader.ts?t=${Math.random()}`);
    mod.initCaseLoader(fetchFn);
    expect(fetched).toEqual([]);
    g.window.openCaseBreakdown('sully');
    await flush();
    const d = all['case-kingpin'];
    d.open = true;
    for (const fn of docListeners.toggle ?? []) fn({ target: d });
    d.open = false;
    for (const fn of docListeners.toggle ?? []) fn({ target: d });
    d.open = true;
    for (const fn of docListeners.toggle ?? []) fn({ target: d });
    g.window.openCaseBreakdown('sully');
    await flush();
    expect(fetched).toEqual(['/partials/case-sully', '/partials/case-kingpin']);
    expect(d.body.innerHTML).toContain('blueprint-inspector');
  });

  test('a failed load keeps the link to the case page', async () => {
    const { all, fetchFn } = setup('?case=battlepro', async () => ({ ok: false, text: async () => '' }));
    const mod = await import(`../src/scripts/case-loader.ts?t=${Math.random()}`);
    mod.initCaseLoader(fetchFn);
    await flush();
    expect(all['case-battlepro'].open).toBe(true);
    expect(all['case-battlepro'].body.innerHTML).toContain('href="/cases/battlepro/"');
  });

  test('a failed load is retried on the next open', async () => {
    let calls = 0;
    const { all, fetched, fetchFn } = setup('', async () =>
      ++calls === 1 ? { ok: false, text: async () => '' } : { ok: true, text: async () => '<div class="blueprint-inspector">x</div>' },
    );
    const mod = await import(`../src/scripts/case-loader.ts?t=${Math.random()}`);
    mod.initCaseLoader(fetchFn);
    g.window.openCaseBreakdown('sully');
    await flush();
    expect(all['case-sully'].body.innerHTML).toContain('href="/cases/sully/"');
    g.window.openCaseBreakdown('sully');
    await flush();
    expect(fetched).toEqual(['/partials/case-sully', '/partials/case-sully']);
    expect(all['case-sully'].body.innerHTML).toContain('blueprint-inspector');
  });

  test('an unknown or malformed ?case= does nothing', async () => {
    const { all, fetched, fetchFn } = setup('?case=../etc', ok('x'));
    const mod = await import(`../src/scripts/case-loader.ts?t=${Math.random()}`);
    mod.initCaseLoader(fetchFn);
    await flush();
    expect(fetched).toEqual([]);
    expect(Object.values(all).some((d: any) => d.open)).toBe(false);
  });
});
