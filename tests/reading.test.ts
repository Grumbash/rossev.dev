// The site remembers what you read, and nothing leaves the browser. A post page records how far the
// reader got (the share of the post above the reading line, a quarter down the screen); coming
// back to a post started but not finished offers YOU STOPPED AT 42% ↓, which takes the reader to
// that paragraph and marks it for a moment. The page never jumps by itself. Lists (/writing/, home)
// tag the cards: READ ✓ or 42% READ. /writing/ says where this lives and offers to forget it.
// Stored in localStorage (rosev_reading) only: no analytics event, no server.
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { BLOG_POSTS } from '../src/data/posts';
import { EVENTS } from '../src/scripts/analytics';
import { CAP, DONE, MIN, badge, offer, record } from '../src/scripts/reading';
import { en } from '../src/i18n/en';
import { ru } from '../src/i18n/ru';
import { buildSite } from './fixtures/build';
import { hasChrome, probeServer } from './fixtures/probe';

setDefaultTimeout(120_000);

beforeAll(() => buildSite());

describe('what is kept', () => {
  test('how far, when, and once finished it stays finished', () => {
    let s = record({}, 'a', 0.42, 100);
    expect(s).toEqual({ a: { f: 0.42, t: 100 } });
    s = record(s, 'a', DONE, 200);
    expect(s.a).toEqual({ f: DONE, t: 200, d: 1 });
    s = record(s, 'a', 0.1, 300); // scrolled back up to reread: still read
    expect(s.a).toEqual({ f: 0.1, t: 300, d: 1 });
  });

  test('a share is between 0 and 1, and the store keeps only the newest posts', () => {
    expect(record({}, 'a', 7, 1).a.f).toBe(1);
    expect(record({}, 'a', -1, 1).a.f).toBe(0);
    let s = {};
    for (let i = 0; i < CAP + 20; i++) s = record(s, `p${i}`, 0.5, i);
    expect(Object.keys(s).length).toBe(CAP);
    expect(s).not.toHaveProperty('p0');
    expect(s).toHaveProperty(`p${CAP + 19}`);
  });

  test('a card says READ once finished, a share once started, nothing for a glance', () => {
    expect(badge(undefined)).toBeNull();
    expect(badge({ f: MIN / 2, t: 1 })).toBeNull();
    expect(badge({ f: 0.424, t: 1 })).toBe(42);
    expect(badge({ f: 0.2, t: 1, d: 1 })).toBe('read');
  });

  test('the post offers to continue only between a glance and the end', () => {
    expect(offer({ f: 0.42, t: 1 })).toBe(42);
    expect(offer({ f: MIN / 2, t: 1 })).toBeNull();
    expect(offer({ f: DONE, t: 1 })).toBeNull();
    expect(offer({ f: 0.42, t: 1, d: 1 })).toBeNull();
  });

  test('it is not tracked: no analytics event knows about reading', () => {
    expect(Object.keys(EVENTS).filter((k) => /read|progress|continue/.test(k))).toEqual([]);
  });
});

describe('the pages', () => {
  const page = (p: string) => readFileSync(`dist/${p}`, 'utf8');
  const attr = (h: string, el: string, name: string) => h.match(new RegExp(`<${el}[^>]*\\b${name}="([^"]*)"`))?.[1];

  test('a post page carries the words for continuing, in its language', () => {
    for (const [prefix, d] of [['', en], ['ru/', ru]] as const) {
      const h = page(`${prefix}writing/${BLOG_POSTS[0].slug}/index.html`);
      expect(attr(h, 'article', 'data-reading-continue')).toBe(d.reading.continue);
      expect(attr(h, 'article', 'data-reading-here')).toBe(d.reading.here);
    }
  });

  test('lists carry the card words and every card its slug', () => {
    for (const [prefix, d] of [['', en], ['ru/', ru]] as const)
      for (const list of [`${prefix}writing/index.html`, `${prefix}index.html`]) {
        const h = page(list);
        expect(attr(h, 'div', 'data-reading-read'), list).toBe(d.reading.read);
        expect(attr(h, 'div', 'data-reading-part'), list).toBe(d.reading.part);
        const cards = [...h.matchAll(/<article class="brutal-box post-card"[^>]*data-slug="([^"]+)"/g)].map((m) => m[1]);
        expect(cards.length, list).toBeGreaterThan(0);
        for (const c of cards) expect(BLOG_POSTS.some((p) => p.slug === c), c).toBe(true);
      }
  });

  test('/writing/ says where the progress lives and offers to forget it, hidden until there is some', () => {
    for (const [prefix, d] of [['', en], ['ru/', ru]] as const) {
      const note = page(`${prefix}writing/index.html`).match(/<p[^>]*data-reading-note[^>]*>[\s\S]*?<\/p>/)?.[0] ?? '';
      expect(note).toMatch(/\bhidden\b/);
      expect(note).toContain(d.reading.note);
      expect(note).toContain(`data-reading-forget`);
      expect(note).toContain(d.reading.forget);
    }
  });
});

describe.skipIf(!hasChrome())('in the browser', () => {
  const POST = 'self-healing-monogram';
  // Phases across page loads in sessionStorage: read half of a post, come back, then the list.
  const PROBE = () => `<script>(async () => { try {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const until = async (f, ms = 8000) => { for (let t = 0; t < ms && !f(); t += 50) await wait(50); return f(); };
    const report = (o) => { const pre = document.createElement('pre'); pre.id = '__probe'; pre.textContent = JSON.stringify(o); document.body.appendChild(pre); };
    const phase = sessionStorage.getItem('phase') || 'read';
    const out = JSON.parse(sessionStorage.getItem('out') || '{}');
    const go = (next, url) => { sessionStorage.setItem('phase', next); sessionStorage.setItem('out', JSON.stringify(out)); location.href = url; };
    await until(() => document.readyState === 'complete'); await wait(300);
    const pill = () => document.querySelector('[data-reading-pill]');
    if (phase === 'read') {
      localStorage.removeItem('rosev_reading');
      out.firstPill = !!pill() && !pill().hidden;
      const ps = [...document.querySelectorAll('.post-body > *')];
      const half = ps[Math.floor(ps.length / 2)];
      half.scrollIntoView({ block: 'start', behavior: 'instant' }); scrollBy({ top: -(innerHeight * 0.25 - 4), behavior: 'instant' });
      await wait(1200);
      dispatchEvent(new Event('pagehide'));
      out.stored = JSON.parse(localStorage.getItem('rosev_reading') || '{}')['${POST}'];
      out.halfIndex = ps.indexOf(half); out.count = ps.length;
      return go('back', location.pathname + '?probe=reading');
    }
    if (phase === 'back') {
      out.scrollOnReturn = Math.round(scrollY);
      out.pill = pill() && !pill().hidden ? pill().textContent.trim() : null;
      pill().click();
      await wait(1500);
      const marked = document.querySelector('.post-body > [data-reading-mark]');
      const ps = [...document.querySelectorAll('.post-body > *')];
      out.markedIndex = ps.indexOf(marked);
      out.markedTop = marked ? Math.round(marked.getBoundingClientRect().top - innerHeight * 0.25) : null;
      out.pillAfter = !!pill() && !pill().hidden;
      return go('list', '/writing/?probe=reading');
    }
    if (phase === 'list') {
      sessionStorage.clear();
      const card = document.querySelector('article.post-card[data-slug="${POST}"]');
      out.badge = card.querySelector('[data-reading-badge]')?.textContent.trim() ?? null;
      out.others = document.querySelectorAll('[data-reading-badge]').length;
      out.note = !document.querySelector('[data-reading-note]').hidden;
      document.querySelector('[data-reading-forget]').click();
      await wait(200);
      out.afterForget = { stored: localStorage.getItem('rosev_reading'), badges: document.querySelectorAll('[data-reading-badge]').length, note: !document.querySelector('[data-reading-note]').hidden };
      return report(out);
    }
  } catch (e) { const pre = document.createElement('pre'); pre.id = '__probe'; pre.textContent = JSON.stringify({ error: String(e && e.stack || e) }); document.body.appendChild(pre); } })();</script>`;

  let srv: ReturnType<typeof probeServer>;
  beforeAll(() => (srv = probeServer(PROBE)));
  afterAll(() => srv?.stop());

  test('read half, leave, come back: the post offers to continue and takes you there; the list says how far; forget forgets', async () => {
    // Reduced motion: the jump to the paragraph is instant. A smooth scroll needs rendered frames,
    // which --dump-dom's virtual time never draws.
    const r = await srv.run(`/writing/${POST}/`, 'reading', ['--force-prefers-reduced-motion']);
    expect(r.error).toBeUndefined();
    expect(r.firstPill).toBe(false);
    expect(r.stored.f).toBeGreaterThan(0.4);
    expect(r.stored.f).toBeLessThan(0.6);
    const pct = Math.round(r.stored.f * 100);
    // Coming back does not move the page: it offers.
    expect(r.scrollOnReturn).toBe(0);
    expect(r.pill).toBe(en.reading.continue.replace('{n}', String(pct)));
    expect(r.markedIndex).toBe(r.halfIndex);
    expect(Math.abs(r.markedTop)).toBeLessThanOrEqual(48);
    expect(r.pillAfter).toBe(false);
    expect(r.badge).toBe(en.reading.part.replace('{n}', String(pct)));
    expect(r.others).toBe(1);
    expect(r.note).toBe(true);
    expect(r.afterForget).toEqual({ stored: null, badges: 0, note: false });
  });
});
