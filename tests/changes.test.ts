// What changed since your last visit. The build writes /changes.json: every post, newest first, and a
// fingerprint of the text of the pages worth coming back to (/hire/ and the case pages; home and
// /writing/ change with every post, /how-its-built/ with every PR). The browser keeps what it saw
// (localStorage rosev_seen). A visit starts after 30 minutes of quiet; a returning visit with new
// posts or changed pages gets a card, WHILE YOU WERE AWAY: 2 new posts · updated: Work with me, and
// new cards on lists carry NEW for the whole visit. The first visit shows nothing: there is nothing
// to compare with. Local only, like the reading memory: no analytics, no server.
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { BLOG_POSTS } from '../src/data/posts';
import { EVENTS } from '../src/scripts/analytics';
import { QUIET_MS, diff, isNewVisit, plural } from '../src/scripts/changes';
import { en } from '../src/i18n/en';
import { ru } from '../src/i18n/ru';
import { buildSite } from './fixtures/build';
import { hasChrome, probeServer } from './fixtures/probe';

setDefaultTimeout(120_000);

beforeAll(() => buildSite());

const manifest = { posts: [{ slug: 'c' }, { slug: 'b' }, { slug: 'a' }], pages: { '/hire/': { h: '22222222' }, '/cases/yagni/': { h: '33333333' } } };

describe('what counts as new', () => {
  test('posts not seen before, newest first, and pages whose text changed', () => {
    const seen = { t: 0, posts: ['a'], pages: { '/hire/': '11111111', '/cases/yagni/': '33333333' } };
    expect(diff(seen, manifest as any)).toEqual({ posts: ['c', 'b'], pages: ['/hire/'] });
  });

  test('a page that was not tracked last time is not "updated"; a post that is gone is not missed', () => {
    const seen = { t: 0, posts: ['a', 'b', 'c', 'gone'], pages: { '/hire/': '22222222' } };
    expect(diff(seen, manifest as any)).toEqual({ posts: [], pages: [] });
  });

  test('a visit starts after half an hour of quiet; the first visit ever is one too', () => {
    expect(isNewVisit(undefined, 1000)).toBe(true);
    expect(isNewVisit({ t: 0, posts: [], pages: {} }, QUIET_MS + 1)).toBe(true);
    expect(isNewVisit({ t: 0, posts: [], pages: {} }, QUIET_MS - 1)).toBe(false);
  });

  test('counts read naturally: 1 new post, 2 new posts; in Russian 1 новый пост, 3 новых поста, 5 новых постов', () => {
    const e = { one: en.changes.postOne, other: en.changes.postOther };
    expect([plural('en', 1, e), plural('en', 2, e)]).toEqual(['1 new post', '2 new posts']);
    const r = { one: ru.changes.postOne, few: ru.changes.postFew, many: ru.changes.postMany, other: ru.changes.postFew };
    expect([1, 3, 5, 21, 22, 25].map((n) => plural('ru', n, r))).toEqual(['1 новый пост', '3 новых поста', '5 новых постов', '21 новый пост', '22 новых поста', '25 новых постов']);
  });

  test('not tracked: no analytics event knows about it', () => {
    expect(Object.keys(EVENTS).filter((k) => /new|change|seen|visit/.test(k))).toEqual([]);
  });
});

describe('the build', () => {
  const changes = () => JSON.parse(readFileSync('dist/changes.json', 'utf8'));

  test('lists every post newest first, with its title in both languages', () => {
    expect(changes().posts.map((p: { slug: string }) => p.slug)).toEqual(BLOG_POSTS.map((p) => p.slug));
    expect(changes().posts[0].title).toEqual(BLOG_POSTS[0].title);
  });

  test('fingerprints /hire/ and the case pages, not home, /writing/ or /how-its-built/', () => {
    const pages = changes().pages;
    expect(Object.keys(pages).sort()).toEqual(['/cases/battlepro/', '/cases/kingpin/', '/cases/sully/', '/cases/yagni/', '/hire/']);
    for (const [path, p] of Object.entries(pages) as [string, { h: string; title: { en: string; ru: string } }][]) {
      expect(p.h, path).toMatch(/^[0-9a-f]{8}$/);
      expect(p.title.en, path).toBeTruthy();
      expect(p.title.ru, path).toBeTruthy();
      expect(p.title.en).not.toContain(' — ');
    }
  });

  test('the words live on the toast element, in the page language', () => {
    for (const [prefix, d] of [['', en], ['ru/', ru]] as const) {
      const toast = readFileSync(`dist/${prefix}writing/index.html`, 'utf8').match(/<div[^>]*id="brutal-toast"[^>]*>/)![0];
      expect(toast).toContain(`data-changes-title="${d.changes.title}"`);
      expect(toast).toContain(`data-changes-tag="${d.changes.tag}"`);
    }
  });
});

describe.skipIf(!hasChrome())('in the browser', () => {
  // A visitor who last came two hours ago, before the two newest posts and an edit to /hire/.
  const PROBE = () => `<script>(async () => { try {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const until = async (f, ms = 8000) => { for (let t = 0; t < ms && !f(); t += 50) await wait(50); return f(); };
    const report = (o) => { const pre = document.createElement('pre'); pre.id = '__probe'; pre.textContent = JSON.stringify(o); document.body.appendChild(pre); };
    const phase = sessionStorage.getItem('phase') || 'seed';
    const out = JSON.parse(sessionStorage.getItem('out') || '{}');
    const reload = (next) => { sessionStorage.setItem('phase', next); sessionStorage.setItem('out', JSON.stringify(out)); location.reload(); };
    const card = () => document.querySelector('[data-changes-card]');
    const tags = () => [...document.querySelectorAll('[data-changes-new]')].map((t) => t.closest('article').dataset.slug);
    const tagWords = () => [...new Set([...document.querySelectorAll('[data-changes-new]')].map((t) => t.textContent.trim()))];
    if (phase === 'seed') {
      const m = await (await fetch('/changes.json')).json();
      const pages = Object.fromEntries(Object.entries(m.pages).map(([p, v]) => [p, p === '/hire/' ? 'stale000' : v.h]));
      localStorage.setItem('rosev_seen', JSON.stringify({ t: Date.now() - 2 * 3600e3, posts: m.posts.slice(2).map((p) => p.slug), pages }));
      out.newest = m.posts.slice(0, 2).map((p) => p.slug);
      return reload('back');
    }
    if (phase === 'back') {
      await until(() => card());
      out.card = card() ? { text: card().textContent.replace(/\\s+/g, ' ').trim(), links: [...card().querySelectorAll('a')].map((a) => a.getAttribute('href')) } : null;
      out.tags = tags();
      out.tagWords = tagWords();
      out.toast = !!document.getElementById('brutal-toast');
      return reload('same');
    }
    if (phase === 'same') {
      await wait(1200);
      out.sameCard = !!card();
      out.sameTags = tags();
      const seen = JSON.parse(localStorage.getItem('rosev_seen'));
      out.seenAll = seen.posts.length; out.seenRecent = Date.now() - seen.t < 60e3;
      sessionStorage.clear();
      return report(out);
    }
  } catch (e) { const pre = document.createElement('pre'); pre.id = '__probe'; pre.textContent = JSON.stringify({ error: String(e && e.stack || e) }); document.body.appendChild(pre); } })();</script>`;

  let srv: ReturnType<typeof probeServer>;
  beforeAll(() => (srv = probeServer(PROBE)));
  afterAll(() => srv?.stop());

  test('back after two hours: the card names what is new and links to it, the cards say NEW all visit, then it is seen', async () => {
    const r = await srv.run('/writing/', 'changes');
    expect(r.error).toBeUndefined();
    expect(r.card.text).toContain(en.changes.title);
    expect(r.card.text).toContain('2 new posts');
    expect(r.card.text).toContain(en.changes.updated);
    expect(r.card.links).toEqual([...r.newest.map((s: string) => `/writing/${s}/`), '/hire/']);
    expect(r.tags.sort()).toEqual([...r.newest].sort());
    expect(r.tagWords).toEqual([en.changes.tag]);
    // Tagging must leave the toast (which carries the words) in place.
    expect(r.toast).toBe(true);
    // Same visit, next page: no card again, the tags stay; the visit is now what the browser has seen.
    expect(r.sameCard).toBe(false);
    expect(r.sameTags.sort()).toEqual([...r.newest].sort());
    expect(r.seenAll).toBe(BLOG_POSTS.length);
    expect(r.seenRecent).toBe(true);
  });

  test('the very first visit shows nothing, and remembers what it saw', async () => {
    const FIRST = () => `<script>(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      // Clean storage before the page's own scripts get a turn: clear, then reload into a first visit.
      if (!sessionStorage.getItem('fresh')) { localStorage.clear(); sessionStorage.setItem('fresh', '1'); return location.reload(); }
      await wait(1500);
      sessionStorage.clear();
      const pre = document.createElement('pre'); pre.id = '__probe';
      pre.textContent = JSON.stringify({ card: !!document.querySelector('[data-changes-card]'), tags: document.querySelectorAll('[data-changes-new]').length, seen: !!localStorage.getItem('rosev_seen') });
      document.body.appendChild(pre);
    })();</script>`;
    const first = probeServer(FIRST);
    try {
      expect(await first.run('/writing/', 'first')).toEqual({ card: false, tags: 0, seen: true });
    } finally {
      first.stop();
    }
  });
});
