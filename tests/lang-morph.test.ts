// EN↔RU without a reload: the language link fetches the same page in the other language and morphs
// this one into it in place. Text and links change where they stand, the post body and the
// language switch are swapped whole, and the paragraph being read stays where it was on the screen.
// Anything unexpected (a page whose structure no longer matches, a failed fetch, no JS, a modifier
// click) is an ordinary navigation, as before.
// Markup part: every EN page and its RU twin have the same structure outside the swapped regions,
// which is what lets the morph work. Behaviour part: headless Chrome when it is installed.
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSite } from './fixtures/build';
import { hasChrome, probeServer } from './fixtures/probe';

setDefaultTimeout(120_000);

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
// Swapped whole by the morph, so their insides may differ between the languages.
const SWAP = /\b(nav-controls|post-body)\b/;

// The element skeleton of <body>: tag names with their depth, scripts and styles left out, a swapped
// region as one token. Astro's static output is regular enough for a tokenizer.
function skeleton(html: string): string[] {
  const body = html.slice(html.indexOf('<body'), html.lastIndexOf('</body>'));
  const clean = body.replace(/<(script|style|template|noscript)\b[\s\S]*?<\/\1>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const out: string[] = [];
  let depth = 0;
  let skip = 0; // >0: inside a swapped region, counting its own depth
  for (const m of clean.matchAll(/<(\/?)([a-zA-Z][\w-]*)\b([^>]*?)(\/?)>/g)) {
    const [, close, rawTag, attrs, selfClose] = m;
    const tag = rawTag.toLowerCase();
    const leaf = VOID.has(tag) || selfClose === '/';
    if (skip) {
      if (close) skip--;
      else if (!leaf) skip++;
      if (!skip) depth--;
      continue;
    }
    if (close) {
      depth--;
      continue;
    }
    const cls = attrs.match(/\bclass="([^"]*)"/)?.[1] ?? '';
    if (SWAP.test(cls)) {
      out.push(`${depth}:swap`);
      if (!leaf) {
        skip = 1;
        depth++;
      }
      continue;
    }
    out.push(`${depth}:${tag}`);
    if (!leaf) depth++;
  }
  return out;
}

const twins = () =>
  [...new Bun.Glob('**/index.html').scanSync('dist')]
    .filter((f) => !f.startsWith('ru/') && existsSync(join('dist/ru', f)))
    .sort();

beforeAll(() => buildSite());

describe('every page and its other-language twin', () => {
  test('there are twins to compare: home, /writing/, every post, /hire/', () => {
    const t = twins();
    expect(t).toContain('index.html');
    expect(t).toContain('writing/index.html');
    expect(t).toContain('hire/index.html');
    expect(t.filter((f) => f.startsWith('writing/') && f !== 'writing/index.html').length).toBeGreaterThan(40);
  });

  test('have the same structure outside the swapped regions, so the morph never has to reload', () => {
    const differ = twins().filter((f) => skeleton(readFileSync(join('dist', f), 'utf8')).join() !== skeleton(readFileSync(join('dist/ru', f), 'utf8')).join());
    expect(differ).toEqual([]);
  });

  test('the skeleton sees a structural difference outside a swapped region (the check above can fail)', () => {
    const page = (inner: string) => `<html><body><nav class="nav-controls"><a>EN</a></nav><main>${inner}</main></body></html>`;
    expect(skeleton(page('<p>a</p><div class="post-body"><p>1</p><p>2</p></div>')).join()).toBe(skeleton(page('<p>б</p><div class="post-body"><p>1</p></div>')).join());
    expect(skeleton(page('<p>a</p>')).join()).not.toBe(skeleton(page('<p>а</p><p>б</p>')).join());
  });
});

// --- behaviour in headless Chrome ---------------------------------------------------------------

const text = (html: string, re: RegExp) =>
  (html.match(re)?.[1] ?? '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const titleOf = (html: string) => text(html, /<title>([\s\S]*?)<\/title>/);
const h1Of = (html: string) => text(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/);

describe.skipIf(!hasChrome())('in the browser', () => {
  const POST = 'self-healing-monogram';

  // Runs in the page under test. The phase lives in sessionStorage, so a reload (the fallback) is
  // seen as one: the probe on the new page reports `navigated` instead of starting over.
  const PROBE = (mode: string) => `<script>(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const until = async (f, ms = 8000) => { for (let t = 0; t < ms && !f(); t += 50) await wait(50); return f(); };
    // A melt is over when no block carries a view-transition name any more (scripts/lang-morph.ts).
    const settled = () => !document.querySelector('[style*="view-transition"]');
    const report = (o) => { const pre = document.createElement('pre'); pre.id = '__probe'; pre.textContent = JSON.stringify(o); document.body.appendChild(pre); };
    const snap = () => ({
      path: location.pathname, lang: document.documentElement.lang, title: document.title,
      h1: (document.querySelector('h1')?.textContent ?? '').replace(/\\s+/g, ' ').trim(),
      body: (document.querySelector('.post-body')?.textContent ?? '').replace(/\\s+/g, ' ').trim().slice(0, 80),
      active: document.querySelector('.active-lang')?.textContent?.trim(),
      switchTo: document.querySelector('a[data-lang-switch]')?.getAttribute('hreflang'),
      marker: window.__marker === 1,
    });
    if (sessionStorage.getItem('probe')) { sessionStorage.removeItem('probe'); return report({ navigated: true, after: snap() }); }
    sessionStorage.setItem('probe', '1');
    window.__marker = 1;
    // Waits on what the page shows, never on a fixed time: a slow chunk load cannot race the check.
    await until(() => document.readyState === 'complete');
    const out = { before: snap() };
    if ('${mode}' === 'fallback') document.querySelector('main, body').prepend(document.createElement('section'));
    let anchor = null;
    if ('${mode}' === 'post') {
      const ps = [...document.querySelectorAll('.post-body > *')];
      anchor = ps[Math.floor(ps.length / 2)];
      // On the reading line the morph keeps still: a quarter down the screen.
      anchor.scrollIntoView({ block: 'start', behavior: 'instant' }); scrollBy({ top: -(innerHeight * 0.25 - 8), behavior: 'instant' }); await wait(300);
      out.anchorBefore = anchor.getBoundingClientRect().top;
      out.anchorFraction = ps.indexOf(anchor) / ps.length;
    }
    document.querySelector('a[data-lang-switch]').click();
    await until(() => document.documentElement.lang === 'ru' && settled());
    sessionStorage.removeItem('probe');
    out.after = snap();
    if ('${mode}' === 'post') {
      const ps = [...document.querySelectorAll('.post-body > *')];
      const twin = ps[Math.min(ps.length - 1, Math.round(out.anchorFraction * ps.length))];
      out.anchorAfter = twin.getBoundingClientRect().top;
    }
    history.back();
    await until(() => document.documentElement.lang === 'en' && settled());
    out.back = snap();
    report(out);
  })();</script>`;

  let srv: ReturnType<typeof probeServer>;
  beforeAll(() => (srv = probeServer(PROBE)));
  afterAll(() => srv?.stop());
  const probe = (path: string, mode: string) => srv.run(path, mode);

  test('a post: the page becomes the Russian one in place, the paragraph being read stays put, Back morphs it back', async () => {
    const en = readFileSync(`dist/writing/${POST}/index.html`, 'utf8');
    const ru = readFileSync(`dist/ru/writing/${POST}/index.html`, 'utf8');
    const r = await probe(`/writing/${POST}/`, 'post');
    expect(r.navigated).toBeUndefined();
    expect(r.after).toMatchObject({ path: `/ru/writing/${POST}/`, lang: 'ru', title: titleOf(ru), h1: h1Of(ru), active: 'RU', switchTo: 'en', marker: true });
    expect(r.after.body).toBe(text(ru, /<div class="post-body"[^>]*>([\s\S]*?)<\/div>\s*<\/(?:div|section|article)>/).slice(0, 80));
    expect(Math.abs(r.anchorAfter - r.anchorBefore)).toBeLessThanOrEqual(48);
    expect(r.back).toMatchObject({ path: `/writing/${POST}/`, lang: 'en', title: titleOf(en), h1: h1Of(en), active: 'EN', switchTo: 'ru', marker: true });
  });

  test('home morphs in place too', async () => {
    const ru = readFileSync('dist/ru/index.html', 'utf8');
    const r = await probe('/', 'home');
    expect(r.navigated).toBeUndefined();
    expect(r.after).toMatchObject({ path: '/ru/', lang: 'ru', title: titleOf(ru), h1: h1Of(ru), active: 'RU', marker: true });
    expect(r.back).toMatchObject({ path: '/', lang: 'en', active: 'EN', marker: true });
  });

  test('a page whose structure changed under the morph falls back to an ordinary navigation', async () => {
    const ru = readFileSync('dist/ru/hire/index.html', 'utf8');
    const r = await probe('/hire/', 'fallback');
    expect(r.navigated).toBe(true);
    expect(r.after).toMatchObject({ path: '/ru/hire/', lang: 'ru', title: titleOf(ru), marker: false });
  });
});
