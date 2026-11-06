// The depth dial: on a technical post the reader picks who it is written for. "For engineers" is
// the post as written; "for people" is a plain-language version of the same post, reviewed like
// the translation. The text morphs in place (the same melt as EN↔RU), the paragraph being read
// stays put, the choice survives the language switch and the next visit (localStorage).
// A post opts in: `depth: true` in its src/content/writing/<slug>.md front matter, or, for a post
// with no .md, a `plain` version in its src/data/posts/<slug>.json. No version, no dial.
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import type { BlogPost } from '../src/data/profile';
import { BLOG_POSTS } from '../src/data/posts';
import { bodyHtml } from '../src/data/post-body';
import { EVENTS } from '../src/scripts/analytics';
import { ruStyleProblems } from '../src/i18n/ru-style';
import { en } from '../src/i18n/en';
import { ru } from '../src/i18n/ru';
import { checkEntry } from '../scripts/ci/publora-sync';
import { WRITING_DIR, parseSource } from '../scripts/ci/writing';
import { buildSite } from './fixtures/build';
import { hasChrome, probeServer } from './fixtures/probe';

setDefaultTimeout(120_000);

const TECHNICAL = ['benchmarking-review-models-on-our-own-prs', 'no-threejs-topology', 'self-healing-monogram'];
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const withPlain = () => BLOG_POSTS.filter((p) => p.plain);

beforeAll(() => buildSite());

describe('the plain versions', () => {
  test('the three technical posts have one, in English and Russian; no other post does', () => {
    expect(withPlain().map((p) => p.slug).sort()).toEqual(TECHNICAL);
  });

  test('each is a real plain version: clearly shorter than the post, Russian per the guide', () => {
    for (const p of withPlain()) {
      for (const l of ['en', 'ru'] as const) {
        expect(words(p.plain![l]), `${p.slug} ${l}`).toBeGreaterThan(150);
        expect(words(p.plain![l]), `${p.slug} ${l}`).toBeLessThan(words(p.body![l]) * 0.8);
      }
      expect(ruStyleProblems(p.plain!.ru), p.slug).toEqual([]);
      expect(checkEntry(p), p.slug).toEqual([]);
    }
  });

  test('the entry check knows the field: a plain version needs the post body and both languages', () => {
    const p = withPlain()[0] as BlogPost;
    expect(checkEntry({ ...p, plain: { en: p.plain!.en, ru: 'English, not Russian at all.' } })).toContain('plain: needs English en and Russian ru');
    expect(checkEntry({ ...p, body: undefined, url: 'https://www.linkedin.com/posts/x-activity-7522945597440012345-abcd' })).toContain('plain: only with a body');
  });
});

describe('the opt-in label in the .md front matter', () => {
  test('depth: true is read, depth: false and no field mean no dial, anything else is an error', () => {
    const md = (front: string) => `---\ntitle: A title long enough\ncategory: ai\ndistribute: []\n${front}---\n${'Text. '.repeat(60)}`;
    const ok = (front: string) => {
      const r = parseSource('a-post.md', md(front));
      return r.ok ? r.source.depth : r.errors;
    };
    expect(ok('depth: true\n')).toBe(true);
    expect(ok('depth: false\n')).toBe(false);
    expect(ok('')).toBe(false);
    expect(ok('depth: yes\n')).toEqual(['depth: true or false']);
  });

  test('in the repo, a post asks for depth exactly when it has its plain version', () => {
    for (const f of readdirSync(WRITING_DIR).filter((f) => f.endsWith('.md'))) {
      const r = parseSource(f, readFileSync(`${WRITING_DIR}/${f}`, 'utf8'));
      if (!r.ok) continue;
      const post = BLOG_POSTS.find((p) => p.slug === r.source.slug);
      expect(Boolean(post?.plain), `${f}: depth: ${r.source.depth}`).toBe(r.source.depth);
    }
  });
});

describe('the page', () => {
  const page = (lang: 'en' | 'ru', slug: string) => readFileSync(`dist/${lang === 'ru' ? 'ru/' : ''}writing/${slug}/index.html`, 'utf8');
  const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

  test('a post with a plain version has the dial, hidden until the script shows it, and the version in a <template>', () => {
    for (const p of withPlain())
      for (const lang of ['en', 'ru'] as const) {
        const html = page(lang, p.slug);
        const d = { en, ru }[lang].depth;
        const dial = html.match(/<div[^>]*\bdata-depth-dial\b[^>]*>[\s\S]*?<\/div>/)?.[0] ?? '';
        expect(dial, `${lang} ${p.slug}`).toMatch(/\bhidden\b/);
        expect(dial).toContain(`data-depth-to="plain"`);
        expect(dial).toContain(`data-depth-to="engineers"`);
        expect(dial).toContain(d.plain);
        expect(dial).toContain(d.engineers);
        expect(dial.match(/data-track="depth_switch"/g)?.length).toBe(2);
        const tpl = html.match(/<template data-depth-plain>([\s\S]*?)<\/template>/)?.[1];
        expect(unescape(tpl ?? '')).toBe(unescape(bodyHtml(p.plain![lang])));
      }
  });

  test('a post without one has neither', () => {
    const p = BLOG_POSTS.find((p) => p.body && !p.plain)!;
    const html = page('en', p.slug);
    expect(html).not.toContain('data-depth-dial');
    expect(html).not.toContain('data-depth-plain');
  });

  test('the switch is a funnel event: depth_switch with where it went', () => {
    expect(EVENTS.depth_switch).toEqual(['to']);
  });
});

describe.skipIf(!hasChrome())('in the browser', () => {
  const POST = 'self-healing-monogram';
  const post = () => BLOG_POSTS.find((p) => p.slug === POST)!;
  const plainStart = (l: 'en' | 'ru') => (bodyHtml(post().plain![l]).replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 40);
  const bodyStart = (l: 'en' | 'ru') => (bodyHtml(post().body![l]).replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 40);

  const PROBE = (mode: string) => `<script>(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const until = async (f, ms = 8000) => { for (let t = 0; t < ms && !f(); t += 50) await wait(50); return f(); };
    const clean = (s) => s.replace(/\\s+/g, ' ').trim().slice(0, 40);
    const snap = () => ({
      lang: document.documentElement.lang, path: location.pathname, marker: window.__marker === 1,
      body: clean(document.querySelector('.post-body').textContent),
      shown: !document.querySelector('[data-depth-dial]').hidden,
      pressed: document.querySelector('[data-depth-to][aria-pressed="true"]')?.dataset.depthTo,
    });
    // A melt is over when no block carries a view-transition name any more (scripts/lang-morph.ts).
    const settled = () => !document.querySelector('[style*="view-transition"]');
    const report = (o) => { const pre = document.createElement('pre'); pre.id = '__probe'; pre.textContent = JSON.stringify(o); document.body.appendChild(pre); };
    // Waits on what the page shows, never on a fixed time: a slow chunk load cannot race the check.
    await until(() => !document.querySelector('[data-depth-dial]').hidden);
    // A link to a passage of the plain version: ?depth=plain opens it, the stored choice untouched.
    if ('${mode}' === 'asked') return report({ load: snap(), stored: localStorage.getItem('rosev_depth') });
    // A visitor who picked "for people" before: stored, then a fresh load of a post page.
    if ('${mode}' === 'remembered') {
      if (!sessionStorage.getItem('reloaded')) { sessionStorage.setItem('reloaded', '1'); localStorage.setItem('rosev_depth', 'plain'); return location.reload(); }
      sessionStorage.removeItem('reloaded');
      return report({ load: snap() });
    }
    localStorage.removeItem('rosev_depth');
    window.__marker = 1;
    const out = { load: snap() };
    const ps = [...document.querySelectorAll('.post-body > *')];
    const anchor = ps[Math.floor(ps.length / 2)];
    anchor.scrollIntoView({ block: 'start', behavior: 'instant' }); scrollBy({ top: -(innerHeight * 0.25 - 8), behavior: 'instant' }); await wait(300);
    const before = anchor.getBoundingClientRect().top, fraction = ps.indexOf(anchor) / ps.length;
    const asWritten = snap().body;
    document.querySelector('[data-depth-to="plain"]').click();
    await until(() => snap().body !== asWritten && settled());
    out.plain = snap();
    const now = [...document.querySelectorAll('.post-body > *')];
    out.drift = now[Math.min(now.length - 1, Math.round(fraction * now.length))].getBoundingClientRect().top - before;
    out.stored = localStorage.getItem('rosev_depth');
    document.querySelector('a[data-lang-switch]').click();
    await until(() => document.documentElement.lang === 'ru' && settled());
    out.ru = snap();
    const plainRu = snap().body;
    document.querySelector('[data-depth-to="engineers"]').click();
    await until(() => snap().body !== plainRu && settled());
    out.back = snap();
    report(out);
  })();</script>`;

  let srv: ReturnType<typeof probeServer>;
  beforeAll(() => (srv = probeServer(PROBE)));
  afterAll(() => srv?.stop());

  test('for people: the post melts into its plain version in place, follows the language switch, and back', async () => {
    const r = await srv.run(`/writing/${POST}/`, 'switch');
    expect(r.load).toMatchObject({ shown: true, pressed: 'engineers', body: bodyStart('en') });
    expect(r.plain).toMatchObject({ pressed: 'plain', body: plainStart('en'), marker: true, path: `/writing/${POST}/` });
    expect(Math.abs(r.drift)).toBeLessThanOrEqual(48);
    expect(r.stored).toBe('plain');
    expect(r.ru).toMatchObject({ lang: 'ru', pressed: 'plain', body: plainStart('ru'), marker: true });
    expect(r.back).toMatchObject({ pressed: 'engineers', body: bodyStart('ru'), marker: true });
  });

  test('a shared link to the plain version opens it, and does not change the visitor\'s choice', async () => {
    const r = await srv.run(`/writing/${POST}/?depth=plain`, 'asked');
    expect(r.load).toMatchObject({ pressed: 'plain', body: plainStart('en') });
    expect(r.stored).toBeNull();
  });

  test('the choice is remembered: a visitor who picked "for people" gets it on the next post page', async () => {
    const r = await srv.run(`/writing/no-threejs-topology/`, 'remembered');
    expect(r.load.pressed).toBe('plain');
  });
});

// The .md files are the source of the posts written here; they must stay parseable.
test('every source file still parses with the new field', () => {
  for (const f of existsSync(WRITING_DIR) ? readdirSync(WRITING_DIR).filter((f) => f.endsWith('.md')) : []) {
    const r = parseSource(f, readFileSync(`${WRITING_DIR}/${f}`, 'utf8'));
    expect(r.ok ? [] : r.errors, f).toEqual([]);
  }
});
