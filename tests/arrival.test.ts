// The site knows how you came, and says so once. From the QR code on the phone case (its card at /c
// links on with ?from=case): "looks like we just met". From LinkedIn (the referrer, nothing else): on
// a post with its full text here, that this is the full text; elsewhere, hello from LinkedIn. From
// /hire to the home page: start with the cases. A toast in the page's language, once per visit; the
// ?from=case comes off the address so it is not shared on. No tracking: nothing is stored but "shown".
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { BLOG_POSTS } from '../src/data/posts';
import { arrival } from '../src/scripts/arrival';
import { EVENTS } from '../src/scripts/analytics';
import { en } from '../src/i18n/en';
import { ru } from '../src/i18n/ru';
import { buildSite } from './fixtures/build';
import { hasChrome, probeServer } from './fixtures/probe';

setDefaultTimeout(120_000);

beforeAll(() => buildSite());

const at = (path: string, search = '', referrer = '', fullPost = false) =>
  arrival({ path, search, referrer, origin: 'https://rossev.dev', fullPost });

describe('where you came from', () => {
  test('the case QR: ?from=case, on any page, in either language', () => {
    expect(at('/', '?from=case')).toBe('case');
    expect(at('/ru/hire/', '?a=1&from=case')).toBe('case');
  });

  test('LinkedIn by the referrer: a full post says it is the full text; any other page says hello', () => {
    expect(at('/writing/x/', '', 'https://www.linkedin.com/', true)).toBe('linkedinPost');
    expect(at('/ru/writing/x/', '', 'https://lnkd.in/abc', true)).toBe('linkedinPost');
    expect(at('/writing/x/', '', 'https://www.linkedin.com/', false)).toBe('linkedin');
    expect(at('/', '', 'https://linkedin.com/in/rossev')).toBe('linkedin');
    expect(at('/', '', 'https://notlinkedin.com/')).toBeNull();
  });

  test('from /hire to the home page: start with the cases; elsewhere from /hire, nothing', () => {
    expect(at('/', '', 'https://rossev.dev/hire/')).toBe('hire');
    expect(at('/ru/', '', 'https://rossev.dev/ru/hire/')).toBe('hire');
    expect(at('/cases/yagni/', '', 'https://rossev.dev/hire/')).toBeNull();
    expect(at('/', '', 'https://evil.dev/hire/')).toBeNull();
  });

  test('anything else, nothing', () => {
    expect(at('/', '', '')).toBeNull();
    expect(at('/', '', 'https://rossev.dev/writing/')).toBeNull();
    expect(at('/', '', 'https://www.google.com/')).toBeNull();
  });

  test('not tracked: no analytics event knows about it', () => {
    expect(Object.keys(EVENTS).filter((k) => /arriv|greet|from|source/.test(k))).toEqual([]);
  });
});

describe('the build', () => {
  test('the toast carries every greeting in the page language', () => {
    for (const [prefix, d] of [['', en], ['ru/', ru]] as const) {
      const toast = readFileSync(`dist/${prefix}index.html`, 'utf8').match(/<div[^>]*id="brutal-toast"[^>]*>/)![0];
      for (const [k, v] of Object.entries(d.arrival)) expect(toast).toContain(`data-arrival-${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}="${v}"`);
    }
    expect(Object.keys(en.arrival).sort()).toEqual(['case', 'hire', 'linkedin', 'linkedinPost']);
    expect(Object.keys(ru.arrival).sort()).toEqual(Object.keys(en.arrival).sort());
  });

  test('the case card links on to the site with ?from=case; its own address and the booking link stay as they are', () => {
    for (const prefix of ['', 'ru/']) {
      const html = readFileSync(`dist/${prefix}c/index.html`, 'utf8');
      const site = [...html.matchAll(/<a\b[^>]*href="(\/[^"]*)"/g)].map((m) => m[1]).filter((h) => !h.endsWith('.vcf') && !/\/c\/$/.test(h));
      expect(site.length).toBeGreaterThanOrEqual(2);
      for (const h of site) expect(h).toContain('?from=case');
      expect(html).not.toMatch(/rel="canonical"[^>]*from=case/);
    }
  });
});

describe.skipIf(!hasChrome())('in the browser', () => {
  const PROBE = (mode: string) => `<script>(async () => { try {
    ${mode === 'linkedin' ? `Object.defineProperty(document, 'referrer', { get: () => 'https://www.linkedin.com/' });` : ''}
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await wait(1500);
    const t = document.getElementById('brutal-toast');
    const out = { text: t.textContent, show: t.classList.contains('show'), search: location.search };
    report(out);
    function report(o) { const pre = document.createElement('pre'); pre.id = '__probe'; pre.textContent = JSON.stringify(o); document.body.appendChild(pre); }
  } catch (e) { const pre = document.createElement('pre'); pre.id = '__probe'; pre.textContent = JSON.stringify({ error: String(e && e.stack || e) }); document.body.appendChild(pre); } })();</script>`;

  let srv: ReturnType<typeof probeServer>;
  beforeAll(() => (srv = probeServer(PROBE)));
  afterAll(() => srv?.stop());

  test('from the case QR: the greeting shows, and ?from=case leaves the address', async () => {
    const r = await srv.run('/ru/?from=case', 'case');
    expect(r.error).toBeUndefined();
    expect(r).toMatchObject({ text: ru.arrival.case, show: true });
    expect(r.search).toBe('?probe=case');
  });

  test('from LinkedIn on a full post: this is the full text', async () => {
    const slug = BLOG_POSTS.find((p) => p.body && p.url)!.slug;
    const r = await srv.run(`/writing/${slug}/`, 'linkedin');
    expect(r.error).toBeUndefined();
    expect(r).toMatchObject({ text: en.arrival.linkedinPost, show: true });
  });
});
