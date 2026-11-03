// A booked call must show up in analytics, attributed to the button that led to it, and the
// visitor's booking details must not. cal.com redirects to /booked with the booking page's own
// params (our utm_content) plus the booking (uid, email, attendeeName, phone, ...). A classic
// inline script in <head> keeps only the placement and strips the query before any deferred
// tracker (Umami, Vercel) reads the URL. Unit part checks the helper and the runtime event;
// markup part runs the built page's head scripts against a fake browser.
import { afterEach, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as analytics from '../src/scripts/analytics';

const { EVENTS } = analytics;
const bookingSource = (search: string): string | null => (analytics as any).bookingSource(search);

// Bun 1.3 rejects a per-hook timeout; the build in beforeAll needs more than the 5s default.
setDefaultTimeout(120_000);

const PLACEMENTS = ['nav', 'hero', 'footer', 'reader'];
const PII = ['t@example.com', 't%40example.com', 'Test', 'Tester', '+995555000000', 'g@example.com'];
const REDIRECT =
  '?utm_source=rossev.dev&utm_medium=site&utm_content=hero&month=2026-11&date=2026-11-05&slot=2026-11-05T10%3A00%3A00.000Z' +
  '&uid=abc123&title=Intro&startTime=2026-11-05T10%3A00%3A00Z&endTime=2026-11-05T10%3A30%3A00Z' +
  '&email=t%40example.com&attendeeName=Test&attendeeFirstName=Test&attendeeLastName=Tester' +
  '&phone=%2B995555000000&guestEmails=g%40example.com&isEmbed=false';

describe('bookingSource', () => {
  test('booking_confirmed is declared with a single source prop', () => {
    expect((EVENTS as Record<string, readonly string[]>).booking_confirmed).toEqual(['source']);
  });

  test('returns the placement from a real cal.com redirect and ignores every other param', () => {
    expect(bookingSource(REDIRECT)).toBe('hero');
    for (const p of PLACEMENTS) expect(bookingSource(`?uid=abc&utm_content=${p}&email=t%40example.com`)).toBe(p);
  });

  test('a booking without a known placement is unknown', () => {
    expect(bookingSource('?uid=abc&email=t%40example.com')).toBe('unknown');
    for (const bad of ['HERO', 'hero ', '<script>', 't@example.com', 'linkedin', '', 'hero&x=1'])
      expect(bookingSource(`?uid=abc&utm_content=${encodeURIComponent(bad)}`)).toBe('unknown');
  });

  test('no uid means no booking: a reload, a back button or a typed URL', () => {
    expect(bookingSource('')).toBeNull();
    expect(bookingSource('?utm_content=hero')).toBeNull();
    expect(bookingSource('?uid=&utm_content=hero')).toBeNull();
  });

  test('never returns anything outside the placement list, unknown or null', () => {
    const allowed = new Set([...PLACEMENTS, 'unknown', null]);
    const junk = ['', '?', '?uid', '?uid=1&utm_content=', '?uid=1&utm_content=nav&utm_content=evil', '?uid=1&uid=2&utm_content=footer', REDIRECT];
    for (let i = 0; i < 200; i++) {
      const v = Math.random().toString(36).slice(2);
      junk.push(`?uid=${v}&utm_content=${v}&email=${v}`, `?${v}=${v}`);
    }
    for (const s of junk) expect(allowed.has(bookingSource(s))).toBe(true);
  });
});

// initAnalytics reports the booking the head script left on <html data-booking-source>.
describe('runtime (initAnalytics)', () => {
  const g = globalThis as any;
  async function boot(attrs: Record<string, string>) {
    const calls: unknown[][] = [];
    g.window = { umami: { track: (...a: unknown[]) => calls.push(a) }, location: { search: '' }, addEventListener() {} };
    g.location = g.window.location;
    g.document = {
      documentElement: { getAttribute: (k: string) => attrs[k] ?? null, setAttribute: (k: string, v: string) => (attrs[k] = v) },
      addEventListener() {},
      getElementById: () => null,
    };
    const mod = await import(`../src/scripts/analytics.ts?boot=${Math.random()}`);
    mod.initAnalytics();
    return calls;
  }
  afterEach(() => {
    for (const k of ['window', 'document', 'location']) delete g[k];
  });

  test('a booking is reported once with its source', async () => {
    const calls = await boot({ 'data-lang': 'en', 'data-page': 'booked', 'data-booking-source': 'hero' });
    expect(calls).toEqual([['booking_confirmed', { source: 'hero' }]]);
  });

  test('no booking, no event', async () => {
    expect(await boot({ 'data-lang': 'en', 'data-page': 'booked' })).toEqual([]);
  });

  test('a tampered attribute is reported as unknown, never verbatim', async () => {
    const calls = await boot({ 'data-lang': 'en', 'data-page': 'booked', 'data-booking-source': 't@example.com' });
    expect(calls).toEqual([['booking_confirmed', { source: 'unknown' }]]);
  });
});

describe('built /booked', () => {
  let html = '';
  const read = (p: string) => readFileSync(p, 'utf8');
  const head = (h: string) => h.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
  // Inline classic scripts in <head>, in document order: the ones that run before any deferred tracker.
  const headScripts = (h: string) =>
    [...head(h).matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)]
      .filter((m) => !/\ssrc=|type="application\/ld\+json"/.test(m[1] ?? ''))
      .map((m) => ({ attrs: m[1] ?? '', code: m[2] }));

  // A browser just far enough for the head scripts: records URL rewrites, attribute writes and tracker calls.
  function runHead(h: string, pathname: string, search: string) {
    const attrs: Record<string, string> = {};
    const urls: string[] = [];
    const sent: unknown[][] = [];
    const location = { pathname, search, hash: '', href: `https://rossev.dev${pathname}${search}`, origin: 'https://rossev.dev' };
    const documentElement = {
      getAttribute: (k: string) => attrs[k] ?? null,
      setAttribute: (k: string, v: string) => (attrs[k] = String(v)),
      dataset: new Proxy({} as Record<string, string>, {
        set: (_t, k, v) => ((attrs['data-' + String(k).replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())] = String(v)), true),
        get: (_t, k) => attrs['data-' + String(k).replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())],
      }),
    };
    const history = { replaceState: (_s: unknown, _t: string, url?: string) => urls.push(String(url)), state: null };
    const window: any = {
      location,
      history,
      document: { documentElement },
      localStorage: { getItem: () => null, setItem() {} },
      umami: { track: (...a: unknown[]) => sent.push(a) },
      URL,
      URLSearchParams,
    };
    window.window = window;
    const ctx = { ...window, window, console: { log() {}, error() {} } };
    for (const s of headScripts(h)) runInNewContext(s.code, ctx);
    return { attrs, urls, sent };
  }

  beforeAll(() => {
    execSync('bun run build', { stdio: 'ignore', env: { ...process.env, PUBLIC_UMAMI_WEBSITE_ID: 'test-site-id' } });
    html = existsSync('dist/booked/index.html') ? read('dist/booked/index.html') : '';
  });

  test('the page is built', () => {
    expect(existsSync('dist/booked/index.html')).toBe(true);
  });

  test('is never indexed: noindex and kept out of the sitemap', () => {
    expect(html).toMatch(/<meta[^>]*name="robots"[^>]*content="[^"]*noindex/);
    const locs = readdirSync('dist')
      .filter((f) => /^sitemap.*\.xml$/.test(f))
      .flatMap((f) => [...read(`dist/${f}`).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
    expect(locs.length).toBeGreaterThan(0);
    expect(locs.filter((l) => l.includes('/booked'))).toEqual([]);
  });

  test('is not linked from the site', () => {
    for (const p of ['dist/index.html', 'dist/writing/index.html']) expect(read(p)).not.toMatch(/href="[^"]*\/booked/);
  });

  test('speaks English and Russian', () => {
    const h1 = html.match(/<h1[\s\S]*?<\/h1>/)?.[0] ?? '';
    const lang = (cls: string) => (h1.match(new RegExp(`class="${cls}"[^>]*>([^<]+)<`))?.[1] ?? '').trim();
    expect(lang('lang-en').length).toBeGreaterThan(0);
    expect(lang('lang-ru')).toMatch(/[А-Яа-яЁё]/);
  });

  test('offers no second "book a call": the visitor has just booked', () => {
    expect(html).not.toContain('data-track="cta_book"');
  });

  test('the query is stripped by a classic inline head script, so deferred trackers never see it', () => {
    const strip = headScripts(html).filter((s) => s.code.includes('replaceState'));
    expect(strip.length).toBe(1);
    expect(strip[0].attrs).not.toMatch(/\b(defer|async)\b|type="module"/);
    // Everything that reports the URL loads after parsing.
    const umami = html.match(/<script[^>]*cloud\.umami\.is\/script\.js[^>]*>/)?.[0] ?? '';
    expect(umami).toMatch(/\bdefer\b/);
  });

  test('a cal.com redirect leaves only the placement: clean URL, no PII anywhere', () => {
    const { attrs, urls, sent } = runHead(html, '/booked/', REDIRECT);
    expect(urls.length).toBe(1);
    expect(urls[0]).not.toContain('?');
    expect(new URL(urls[0], 'https://rossev.dev').pathname).toBe('/booked/');
    expect(attrs['data-booking-source']).toBe('hero');
    const leaked = JSON.stringify({ attrs, urls, sent });
    for (const p of PII) expect(leaked).not.toContain(p);
    expect(sent).toEqual([]);
  });

  test('a visit without a booking reports nothing and still cleans the URL', () => {
    const { attrs, urls } = runHead(html, '/booked/', '?utm_content=hero&email=t%40example.com');
    expect(attrs['data-booking-source']).toBeUndefined();
    for (const u of urls) expect(u).not.toContain('?');
  });

  test('no other page strips its URL (deep links like ?case= keep working)', () => {
    const { urls, attrs } = runHead(read('dist/index.html'), '/', '?case=yagni&uid=abc&utm_content=hero');
    expect(urls).toEqual([]);
    expect(attrs['data-booking-source']).toBeUndefined();
  });
});
