// "Gleb now": a footer line with his local time in Tbilisi (at night, probably asleep) and the site's
// last commit, how long ago and what it says. The build writes the commit from git, so without JS the
// line still names it with its date; the browser fills in the time and "12 minutes ago", and once the
// footer is in view quietly asks GitHub's public API for a newer commit. Nothing about the visitor
// goes anywhere: the request carries no data of theirs, and nothing is tracked.
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { ago, clock } from '../src/scripts/now';
import { EVENTS } from '../src/scripts/analytics';
import { en } from '../src/i18n/en';
import { ru } from '../src/i18n/ru';
import { buildSite } from './fixtures/build';
import { hasChrome, probeServer } from './fixtures/probe';

setDefaultTimeout(120_000);

beforeAll(() => buildSite());

describe('the words', () => {
  test('his clock is Tbilisi time, and from midnight to seven he is probably asleep', () => {
    expect(clock(new Date('2026-11-06T19:14:00Z'))).toEqual({ time: '23:14', night: false });
    expect(clock(new Date('2026-11-06T22:05:00Z'))).toEqual({ time: '02:05', night: true });
    expect(clock(new Date('2026-11-07T03:00:00Z'))).toEqual({ time: '07:00', night: false });
  });

  test('how long ago reads naturally in both languages', () => {
    const min = 60_000;
    expect(ago(20_000, 'en', en.now.justNow)).toBe(en.now.justNow);
    expect(ago(12 * min, 'en', '')).toBe('12 minutes ago');
    expect(ago(3 * 60 * min, 'en', '')).toBe('3 hours ago');
    expect(ago(12 * min, 'ru', '')).toBe('12 минут назад');
    expect(ago(1 * min, 'ru', '')).toBe('1 минуту назад');
    expect(ago(2 * 24 * 60 * min, 'ru', '')).toBe('2 дня назад');
  });

  test('not tracked: no analytics event knows about it', () => {
    expect(Object.keys(EVENTS).filter((k) => /now|commit|clock/.test(k))).toEqual([]);
  });
});

describe('the build', () => {
  const head = execSync('git log -1 --format=%H%x00%s', { encoding: 'utf8' }).trim().split('\0');

  test('the footer names the last commit, linked, with its date, in the page language', () => {
    for (const [prefix, d] of [['', en], ['ru/', ru]] as const) {
      const html = readFileSync(`dist/${prefix}index.html`, 'utf8');
      const row = html.match(/<div[^>]*data-now[\s\S]*?<\/div>/)![0];
      expect(row).toContain(d.now.label);
      expect(row).toContain(`https://github.com/Grumbash/rossev.dev/commit/${head[0]}`);
      expect(row).toContain(head[1].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/'/g, '&#39;'));
      expect(row).toMatch(/<time datetime="\d{4}-\d\d-\d\dT[^"]+"/);
    }
  });

  test('the page may talk to GitHub’s API and nowhere new besides', () => {
    const csp = JSON.stringify(JSON.parse(readFileSync('vercel.json', 'utf8')));
    expect(csp).toMatch(/connect-src 'self' https:\/\/gateway\.umami\.is https:\/\/api\.github\.com;/);
  });
});

describe.skipIf(!hasChrome())('in the browser', () => {
  // GitHub answers with a commit made just now, newer than the build's; the line takes it.
  const PROBE = () => `<script>(async () => { try {
    const at = new Date().toISOString();
    const calls = [];
    window.fetch = async (url) => { calls.push(String(url)); return new Response(JSON.stringify({ sha: 'abc1234', html_url: 'https://github.com/Grumbash/rossev.dev/commit/abc1234', commit: { message: 'A newer commit\\n\\nbody', committer: { date: at } } }), { headers: { 'content-type': 'application/json' } }); };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    // In view before the module loads: under virtual time the observer only reports where the row is
    // when it starts watching, not a later scroll (no frames are rendered).
    const row = document.querySelector('[data-now]');
    row.scrollIntoView({ behavior: 'instant' });
    await wait(1500);
    const before = row.textContent.replace(/\\s+/g, ' ').trim();
    const pre = document.createElement('pre'); pre.id = '__probe';
    pre.textContent = JSON.stringify({ before, after: row.textContent.replace(/\\s+/g, ' ').trim(), href: row.querySelector('a').href, calls: calls.filter((c) => c.includes('github')) });
    document.body.appendChild(pre);
  } catch (e) { const pre = document.createElement('pre'); pre.id = '__probe'; pre.textContent = JSON.stringify({ error: String(e && e.stack || e) }); document.body.appendChild(pre); } })();</script>`;

  let srv: ReturnType<typeof probeServer>;
  beforeAll(() => (srv = probeServer(PROBE)));
  afterAll(() => srv?.stop());

  test('the time in Tbilisi appears; in view, a newer commit from GitHub takes the line', async () => {
    const r = await srv.run('/ru/', 'now');
    expect(r.error).toBeUndefined();
    expect(r.before).toMatch(/\d\d:\d\d в Тбилиси/);
    expect(r.calls).toEqual(['https://api.github.com/repos/Grumbash/rossev.dev/commits/main']);
    expect(r.after).toContain('A newer commit');
    expect(r.after).not.toContain('body');
    expect(r.after).toContain(ru.now.justNow);
    expect(r.href).toBe('https://github.com/Grumbash/rossev.dev/commit/abc1234');
  });
});
