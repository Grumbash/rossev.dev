// A letter that knows the context. On /hire, next to booking a call, WRITE ME AN EMAIL is a mailto:
// with a subject. With JS the letter is already started from what this browser remembers (the reading
// memory, scripts/reading.ts): "Hi Gleb, I'm writing after reading “X” and “Y” on your site. I'm
// interested in: AI agent reliability audit." — the two posts read most recently, and the offer the
// visitor jumped to. A line under the button shows how it starts and that nothing leaves the browser
// until they send it. In the page's language; no analytics beyond the email_click there already is.
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { letter } from '../src/scripts/letter';
import { BLOG_POSTS } from '../src/data/posts';
import { PROFILE } from '../src/data/profile';
import { en } from '../src/i18n/en';
import { ru } from '../src/i18n/ru';
import { buildSite } from './fixtures/build';
import { hasChrome, probeServer } from './fixtures/probe';

setDefaultTimeout(120_000);

beforeAll(() => buildSite());

const titles = { a: 'Post A', b: 'Post B', c: 'Post C', d: 'Post D' };

describe('the letter', () => {
  test('the two posts read most recently, then the offer; a glance does not count', () => {
    const store = { a: { f: 0.5, t: 1 }, b: { f: 1, t: 3, d: 1 as const }, c: { f: 0.3, t: 2 }, d: { f: 0.02, t: 9 } };
    const l = letter({ store, titles, offer: 'AI agent reliability audit', w: en.letter })!;
    expect(letter({ store: {}, titles, offer: 'Аудит надёжности', w: ru.letter })!.lines).toEqual(['Интересует: аудит надёжности.']);
    expect(l.lines).toEqual(['I’m writing after reading “Post B” and “Post C” on your site.', 'I’m interested in: AI agent reliability audit.']);
    expect(l.body).toBe(`Hi Gleb,\n\n${l.lines.join(' ')}\n\n`);
  });

  test('in Russian, with Russian quotes; one post alone', () => {
    const l = letter({ store: { a: { f: 0.5, t: 1 } }, titles, offer: null, w: ru.letter })!;
    expect(l.lines).toEqual(['Пишу после вашего поста «Post A».']);
    expect(l.body.startsWith(ru.letter.hello)).toBe(true);
  });

  test('nothing read and no offer: no letter to start, the plain mailto stays', () => {
    expect(letter({ store: {}, titles, offer: null, w: en.letter })).toBeNull();
    expect(letter({ store: { gone: { f: 1, t: 1, d: 1 } }, titles, offer: null, w: en.letter })).toBeNull();
  });
});

describe('the build', () => {
  test('/hire has a mailto with a subject next to booking, its words in the page language, and the email_click track', () => {
    for (const [prefix, d] of [['', en], ['ru/', ru]] as const) {
      const html = readFileSync(`dist/${prefix}hire/index.html`, 'utf8');
      const a = html.match(/<a[^>]*data-letter[^>]*>/)![0];
      expect(a).toContain(`href="mailto:${PROFILE.email}?subject=${encodeURIComponent(d.letter.subject)}"`);
      expect(a).toContain('data-track="email_click"');
      expect(a).toContain('data-track-placement="hire"');
      expect(a).toContain(`data-letter-hello="${d.letter.hello}"`);
      expect(html).toContain(d.letter.write);
      expect(html).toMatch(/<p[^>]*data-letter-line[^>]*hidden/);
    }
  });
});

describe.skipIf(!hasChrome())('in the browser', () => {
  const [one, two] = BLOG_POSTS.slice(0, 2);
  const PROBE = () => `<script>
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('rosev_reading', JSON.stringify({ '${one.slug}': { f: 1, t: 2, d: 1 }, '${two.slug}': { f: 0.4, t: 1 } }));
    }
    (async () => { try {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    document.querySelector('.hire-jump a[href="#audit"]').click();
    await wait(1500);
    const a = document.querySelector('[data-letter]');
    const p = document.querySelector('[data-letter-line]');
    const pre = document.createElement('pre'); pre.id = '__probe';
    pre.textContent = JSON.stringify({ href: a.href, preview: p.hidden ? null : p.textContent });
    document.body.appendChild(pre);
  } catch (e) { const pre = document.createElement('pre'); pre.id = '__probe'; pre.textContent = JSON.stringify({ error: String(e && e.stack || e) }); document.body.appendChild(pre); } })();</script>`;

  let srv: ReturnType<typeof probeServer>;
  beforeAll(() => (srv = probeServer(PROBE)));
  afterAll(() => srv?.stop());

  test('read two posts and jumped to the audit: the letter starts with them, and the line says so', async () => {
    const r = await srv.run('/ru/hire/', 'letter');
    expect(r.error).toBeUndefined();
    const body = decodeURIComponent(new URL(r.href).searchParams.get('body') ?? '');
    expect(body).toContain(`«${one.title.ru}» и «${two.title.ru}»`);
    expect(body).toContain('Интересует: аудит надёжности AI-агентов.');
    expect(new URL(r.href).searchParams.get('subject')).toBe(ru.letter.subject);
    expect(r.preview).toContain(one.title.ru);
    expect(r.preview).toContain(ru.letter.note);
  });
});
