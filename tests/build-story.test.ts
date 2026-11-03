// "Agents wrote the code, I did the planning" has to be checkable, not just said. /how-its-built/
// shows every merged PR of this site with its real artifacts: the red test committed first, what
// the judge caught and where it was fixed, what the human decided, and a link to the PR. The data
// is a committed file produced by scripts/build-story.ts from `gh pr view` output plus a
// hand-curated highlights file; the page only renders it and every number on it is derived from it.
// Three parts: the generator's pure functions on real `gh` fixtures, the committed data, the built page.
import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import * as analytics from '../src/scripts/analytics';

// Bun 1.3 rejects a per-hook timeout; the build in beforeAll needs more than the 5s default.
setDefaultTimeout(120_000);

const SITE = 'https://rossev.dev';
const PATH = '/how-its-built/';
const REPO = 'Grumbash/rossev.dev';
const GH = `https://github.com/${REPO}`;
const PERSON = `${SITE}/#person`;
const read = (p: string) => readFileSync(p, 'utf8');
const json = (p: string) => JSON.parse(read(p));
const fixture = (n: number) => json(`tests/fixtures/build-story/pr-${n}.json`);
const CYRILLIC = /[А-Яа-яЁё]/;

const gen = () => import('../scripts/build-story');

type L10n = { en: string; ru: string };
const isL10n = (v: any): v is L10n =>
  !!v && typeof v.en === 'string' && v.en.trim().length > 0 && typeof v.ru === 'string' && CYRILLIC.test(v.ru);

describe('generator (pure functions on real gh output)', () => {
  test('classifies commits: red tests by their subject, merges, everything else is implementation', async () => {
    const { classifyCommit } = await gen();
    expect(classifyCommit('Red test: a neural cellular automaton grows GR from one cell')).toBe('red');
    expect(classifyCommit('Add a failing test that /booked counts a real booking')).toBe('red');
    expect(classifyCommit("Merge remote-tracking branch 'origin/main' into x")).toBe('merge');
    expect(classifyCommit('Merge pull request #12 from Grumbash/booked-page')).toBe('merge');
    expect(classifyCommit('Pin that a middle-click on a button sends nothing')).toBe('impl');
    expect(classifyCommit('Add /booked: a cal.com booking becomes booking_confirmed')).toBe('impl');
    // "failing test" mentioned later in a subject is not a red-test commit.
    expect(classifyCommit('Fix the failing test in CI')).toBe('impl');
  });

  test('the red test counts only when it is the first non-merge commit of the PR', async () => {
    const { redTestOf } = await gen();
    const c = (oid: string, messageHeadline: string) => ({ oid, messageHeadline });
    expect(redTestOf(fixture(12).commits)?.sha).toBe(fixture(12).commits[0].oid);
    expect(redTestOf(fixture(3).commits)?.sha).toBe(fixture(3).commits[0].oid);
    expect(redTestOf(fixture(1).commits)).toBeNull();
    // Code first, test after: not red-test-first.
    expect(redTestOf([c('a1', 'Implement the thing'), c('b2', 'Add a failing test for the thing')])).toBeNull();
    // A merge from main before the red test does not disqualify it.
    expect(redTestOf([c('m0', "Merge remote-tracking branch 'origin/main' into x"), c('r1', 'Red test: x')])?.sha).toBe('r1');
  });

  test('builds an entry from gh output and highlights, with commit links and an empty CI verdict slot', async () => {
    const { toEntry } = await gen();
    const h = {
      visitorChange: { en: 'A booking is counted.', ru: 'Бронь засчитана.' },
      humanDecision: { en: 'Keep no booking PII.', ru: 'Никаких данных брони.' },
      findings: [],
    };
    const e = toEntry(fixture(12), h, REPO);
    expect(e.number).toBe(12);
    expect(e.url).toBe(`${GH}/pull/12`);
    expect(e.mergedAt).toBe(fixture(12).mergedAt);
    expect(e.additions).toBe(fixture(12).additions);
    expect(e.deletions).toBe(fixture(12).deletions);
    expect(e.redTest).toEqual({ sha: fixture(12).commits[0].oid, subject: fixture(12).commits[0].messageHeadline, url: `${GH}/commit/${fixture(12).commits[0].oid}` });
    expect(e.commits.map((x: any) => x.role)).toEqual(['red', 'impl']);
    for (const x of e.commits) expect(x.url).toBe(`${GH}/commit/${x.sha}`);
    expect(e.visitorChange).toEqual(h.visitorChange);
    expect(e.humanDecision).toEqual(h.humanDecision);
    expect(e.ciVerdicts).toEqual([]);
  });

  test('regenerating keeps CI verdicts already appended to the data', async () => {
    const { toEntry, carryCiVerdicts } = await gen();
    const h = { visitorChange: { en: 'x', ru: 'х' }, humanDecision: { en: 'x', ru: 'х' }, findings: [] };
    const verdict = { kind: 'judge', verdict: 'SHIP', summary: { en: 'ok', ru: 'ок' }, url: `${GH}/pull/12#issuecomment-1`, at: '2026-11-05T00:00:00Z' };
    const old = { repo: REPO, prs: [{ ...toEntry(fixture(12), h, REPO), ciVerdicts: [verdict] }] };
    const fresh = [toEntry(fixture(12), h, REPO), toEntry(fixture(3), h, REPO)];
    const out = carryCiVerdicts(old, fresh);
    expect(out.find((p: any) => p.number === 12).ciVerdicts).toEqual([verdict]);
    expect(out.find((p: any) => p.number === 3).ciVerdicts).toEqual([]);
  });

  test('stats are computed, never typed: PRs, red-test-first, findings fixed, commits', async () => {
    const { toEntry, computeStats } = await gen();
    const base = { visitorChange: { en: 'x', ru: 'х' }, humanDecision: { en: 'x', ru: 'х' } };
    const f = (ref: string) => ({ en: 'caught', ru: 'поймал', ref });
    const prs = [
      toEntry(fixture(1), { ...base, findings: [], preLoop: { en: 'Before the loop.', ru: 'До цикла.' } }, REPO),
      toEntry(fixture(3), { ...base, findings: [f(`${GH}/pull/3`), f(`${GH}/pull/3`)] }, REPO),
      toEntry(fixture(12), { ...base, findings: [f(`${GH}/pull/12`)] }, REPO),
    ];
    expect(computeStats(prs)).toEqual({ prs: 3, redFirst: 2, findings: 3, commits: 1 + 4 + 2 });
  });

  test('validate names every problem: no red test and no reason, untranslated copy, foreign or unknown refs', async () => {
    const { toEntry, validate } = await gen();
    const ok = { visitorChange: { en: 'x', ru: 'х' }, humanDecision: { en: 'x', ru: 'х' } };
    const good = toEntry(fixture(12), { ...ok, findings: [{ en: 'c', ru: 'п', ref: `${GH}/commit/${fixture(12).commits[1].oid}` }] }, REPO);
    expect(validate({ repo: REPO, prs: [good] })).toEqual([]);

    const noReason = toEntry(fixture(1), { ...ok, findings: [] }, REPO);
    expect(validate({ repo: REPO, prs: [noReason] }).join('\n')).toMatch(/#1\b.*red test/i);

    const english = toEntry(fixture(12), { ...ok, humanDecision: { en: 'x', ru: 'x' }, findings: [] }, REPO);
    expect(validate({ repo: REPO, prs: [english] }).join('\n')).toMatch(/#12\b/);

    const foreign = toEntry(fixture(12), { ...ok, findings: [{ en: 'c', ru: 'п', ref: 'https://example.com/x' }] }, REPO);
    expect(validate({ repo: REPO, prs: [foreign] }).join('\n')).toMatch(/#12\b/);

    // A finding pinned to a commit must point at a commit of that PR.
    const stray = toEntry(fixture(12), { ...ok, findings: [{ en: 'c', ru: 'п', ref: `${GH}/commit/${fixture(3).commits[0].oid}` }] }, REPO);
    expect(validate({ repo: REPO, prs: [stray] }).join('\n')).toMatch(/#12\b/);
  });
});

describe('committed data (src/data/build-story.json)', () => {
  const story = existsSync('src/data/build-story.json') ? json('src/data/build-story.json') : { prs: [] };
  const highlights = existsSync('src/data/build-story-highlights.json') ? json('src/data/build-story-highlights.json') : {};

  test('exists and passes the generator\'s own validation', async () => {
    const { validate } = await gen();
    expect(story.repo).toBe(REPO);
    expect(story.prs.length).toBeGreaterThan(0);
    expect(validate(story)).toEqual([]);
  });

  // The data says which main commit it was generated through. Every PR merged up to that commit
  // must be in it. Merges after it make the page stale, not main red: otherwise every merge would
  // fail `bun test` (and CI on every open PR) until someone regenerated the data.
  test('every PR merged up to the commit the data was generated through is in the data', () => {
    expect(story.throughSha).toMatch(/^[0-9a-f]{40}$/);
    execSync(`git merge-base --is-ancestor ${story.throughSha} HEAD`);
    const merged = execSync(`git log --merges --format=%s ${story.throughSha}`, { encoding: 'utf8' })
      .split('\n')
      .map((s) => s.match(/^Merge pull request #(\d+) from /)?.[1])
      .filter(Boolean)
      .map(Number);
    expect(merged.length).toBeGreaterThan(0);
    const have = new Set(story.prs.map((p: any) => p.number));
    expect(merged.filter((n) => !have.has(n))).toEqual([]);
  });

  test('no PR lacks a red-test-first commit unless it says why, in both languages', () => {
    for (const p of story.prs) {
      if (p.redTest) {
        expect(p.redTest.url).toBe(`${GH}/commit/${p.redTest.sha}`);
        expect(p.commits.find((c: any) => c.sha === p.redTest.sha)?.role).toBe('red');
      } else expect(isL10n(p.preLoop), `#${p.number} preLoop`).toBe(true);
    }
  });

  test('every PR says what changed for visitors and what the human decided, EN and RU', () => {
    for (const p of story.prs) {
      expect(isL10n(p.visitorChange), `#${p.number} visitorChange`).toBe(true);
      expect(isL10n(p.humanDecision), `#${p.number} humanDecision`).toBe(true);
      expect(Array.isArray(p.ciVerdicts), `#${p.number} ciVerdicts slot`).toBe(true);
      for (const f of p.findings) {
        expect(isL10n(f), `#${p.number} finding`).toBe(true);
        expect(f.ref).toMatch(new RegExp(`^${GH}/(pull/${p.number}|commit/[0-9a-f]{40})$`));
      }
    }
  });

  test('the curated copy in the data is the highlights file as it is now (the generator was rerun)', () => {
    for (const p of story.prs) {
      const h = highlights[String(p.number)];
      expect(h, `#${p.number} has highlights`).toBeDefined();
      for (const k of ['visitorChange', 'humanDecision', 'findings', 'preLoop'])
        expect(p[k] ?? null, `#${p.number}.${k}`).toEqual(h[k] ?? null);
    }
  });
});

describe(`built ${PATH}`, () => {
  const story = existsSync('src/data/build-story.json') ? json('src/data/build-story.json') : { prs: [] };
  let html = '';
  const meta = (key: string) =>
    html.match(new RegExp(`<meta[^>]*(?:name|property)="${key}"[^>]*content="([^"]*)"`))?.[1] ??
    html.match(new RegExp(`<meta[^>]*content="([^"]*)"[^>]*(?:name|property)="${key}"`))?.[1];
  const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const text = (h: string) => decode(h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
  const hrefs = (h: string) => [...h.matchAll(/<a\b[^>]*href="([^"]*)"/g)].map((m) => decode(m[1]));
  const card = (n: number) => html.match(new RegExp(`<[a-z]+[^>]*data-pr="${n}"[^>]*>[\\s\\S]*?<!-- /pr-${n} -->`))?.[0] ?? '';

  beforeAll(() => {
    execSync('bun run build', { stdio: 'ignore' });
    html = existsSync(`dist${PATH}index.html`) ? read(`dist${PATH}index.html`) : '';
  });

  test('is built with its own canonical, title, description and OG', () => {
    expect(html.length).toBeGreaterThan(0);
    expect(html).toMatch(new RegExp(`<link[^>]*rel="canonical"[^>]*href="${SITE}${PATH}"`));
    const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '';
    expect(title).toMatch(/built/i);
    const home = read('dist/index.html').match(/<title>([\s\S]*?)<\/title>/)?.[1];
    expect(title).not.toBe(home);
    expect((meta('description') ?? '').length).toBeGreaterThan(50);
    expect(meta('og:title')).toBeTruthy();
    expect(meta('og:url')).toBe(`${SITE}${PATH}`);
  });

  test('speaks English and Russian', () => {
    const h1 = html.match(/<h1[\s\S]*?<\/h1>/)?.[0] ?? '';
    expect(h1).toMatch(/class="lang-en"/);
    expect(h1.match(/class="lang-ru"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? '').toMatch(CYRILLIC);
  });

  test('one card per PR in the data, each linking to its real PR and its red test', () => {
    expect(story.prs.length).toBeGreaterThan(0);
    expect([...html.matchAll(/data-pr="(\d+)"/g)].map((m) => Number(m[1])).sort((a, b) => a - b)).toEqual(
      story.prs.map((p: any) => p.number).sort((a: number, b: number) => a - b),
    );
    for (const p of story.prs) {
      const c = card(p.number);
      expect(c, `card #${p.number}`).not.toBe('');
      expect(hrefs(c)).toContain(`${GH}/pull/${p.number}`);
      if (p.redTest) expect(hrefs(c)).toContain(p.redTest.url);
      const t = text(c);
      expect(t).toContain(p.visitorChange.en);
      expect(t).toContain(p.visitorChange.ru);
      expect(t).toContain(p.humanDecision.en);
      for (const f of p.findings) {
        expect(t).toContain(f.en);
        expect(hrefs(c)).toContain(f.ref);
      }
      if (!p.redTest) expect(t).toContain(p.preLoop.en);
    }
  });

  test('every link to GitHub on the page is a PR or commit that is in the data', () => {
    const known = new Set<string>();
    for (const p of story.prs) {
      known.add(p.url);
      for (const c of p.commits) known.add(c.url);
    }
    const gh = hrefs(html).filter((h) => h.startsWith(`${GH}/pull/`) || h.startsWith(`${GH}/commit/`));
    expect(gh.length).toBeGreaterThan(0);
    for (const h of gh) expect(known.has(h), h).toBe(true);
  });

  test('the stats strip shows numbers computed from the data file', () => {
    const stat = (k: string) => html.match(new RegExp(`data-stat="${k}"[^>]*>\\s*([^<]+?)\\s*<`))?.[1];
    const prs = story.prs.length;
    const redFirst = story.prs.filter((p: any) => p.redTest).length;
    const findings = story.prs.reduce((n: number, p: any) => n + p.findings.length, 0);
    const commits = story.prs.reduce((n: number, p: any) => n + p.commits.filter((c: any) => c.role !== 'merge').length, 0);
    expect(stat('prs')).toBe(String(prs));
    expect(stat('red-first')).toBe(`${redFirst}/${prs}`);
    expect(stat('findings')).toBe(String(findings));
    expect(stat('commits')).toBe(String(commits));
  });

  test('ends with a tracked book-a-call link placed as build-story', () => {
    expect(analytics.PLACEMENTS as readonly string[]).toContain('build-story');
    expect(analytics.bookingSource('?uid=abc&utm_content=build-story')).toBe('build-story');
    const cal = [...html.matchAll(/<a\b([^>]*)>/g)]
      .map((m) => m[1])
      .filter((a) => /data-track-placement="build-story"/.test(a));
    expect(cal.length).toBe(1);
    expect(cal[0]).toMatch(/data-track="cta_book"/);
    const u = new URL(decode(cal[0].match(/href="([^"]*)"/)![1]));
    expect(u.hostname).toMatch(/cal\.com$/);
    expect(u.searchParams.get('utm_content')).toBe('build-story');
    expect(u.searchParams.get('utm_source')).toBe('rossev.dev');
  });

  test('JSON-LD: an Article by the same #person, at the canonical URL', () => {
    const raw = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] ?? '{}';
    const ld = JSON.parse(raw);
    const graph: any[] = ld['@graph'] ?? [ld];
    const article = graph.find((n) => /Article$/.test(n['@type']));
    expect(article).toBeDefined();
    expect(article.author?.['@id'] ?? article.author).toBe(PERSON);
    expect(article.url ?? article.mainEntityOfPage?.['@id'] ?? article.mainEntityOfPage).toBe(`${SITE}${PATH}`);
  });

  test('is in the sitemap', () => {
    const locs = readdirSync('dist')
      .filter((f) => /^sitemap.*\.xml$/.test(f))
      .flatMap((f) => [...read(`dist/${f}`).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
    expect(locs).toContain(`${SITE}${PATH}`);
  });

  test('is reachable from the hero value line and from the footer on every page', () => {
    const home = read('dist/index.html');
    const hero = home.match(/<section class="hero-section[\s\S]*?<\/section>/)?.[0] ?? '';
    expect(hrefs(hero)).toContain(PATH);
    for (const p of ['dist/index.html', 'dist/writing/index.html', `dist${PATH}index.html`]) {
      const footer = read(p).match(/<footer[\s\S]*?<\/footer>/)?.[0] ?? '';
      expect(hrefs(footer), p).toContain(PATH);
    }
  });

  test('ships no page-specific client JS: its scripts are the ones /writing/ already loads', () => {
    const srcs = (h: string) => new Set([...h.matchAll(/<script\b[^>]*\bsrc="([^"]*)"/g)].map((m) => m[1]));
    const writing = srcs(read('dist/writing/index.html'));
    for (const s of srcs(html)) expect(writing.has(s), s).toBe(true);
  });
});
