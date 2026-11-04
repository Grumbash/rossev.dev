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
    expect(classifyCommit("Merge remote-tracking branch 'origin/main' into claude/x")).toBe('merge');
    expect(classifyCommit('Merge pull request #12 from Grumbash/claude/booked-page')).toBe('merge');
    expect(classifyCommit('Pin that a middle-click on a button sends nothing')).toBe('impl');
    expect(classifyCommit('Add /booked: a cal.com booking becomes booking_confirmed')).toBe('impl');
    // "failing test" mentioned later in a subject is not a red-test commit.
    expect(classifyCommit('Fix the failing test in CI')).toBe('impl');
    // The plural form is how #18, #20, #22 and #24 started.
    expect(classifyCommit('Add failing tests: home under 32 KB gzip, 6 latest posts')).toBe('red');
    expect(classifyCommit(fixture(18).commits[0].messageHeadline)).toBe('red');
  });

  // A PR that only refreshes the build-story data (#15, every bot PR) is bookkeeping, not loop work.
  // Leaving it out is also the loop guard: merging the bot's PR must not produce a story about itself.
  test('a PR that only touches build-story data is not a story entry', async () => {
    const { isDataOnly } = await gen();
    const paths = (pr: any) => pr.files.map((f: any) => f.path);
    expect(isDataOnly(paths(fixture(15)))).toBe(true);
    expect(isDataOnly(['src/data/build-story.json'])).toBe(true);
    expect(isDataOnly(paths(fixture(18)))).toBe(false);
    expect(isDataOnly(['src/data/build-story.json', 'src/pages/[...locale]/how-its-built.astro'])).toBe(false);
    expect(isDataOnly(['src/data/posts.json'])).toBe(false);
    expect(isDataOnly([])).toBe(false);
  });

  // New PRs show up with what git and GitHub know; the copy in Gleb's voice waits for him.
  test('a PR without highlights becomes a pending entry: facts only, no invented copy', async () => {
    const { toEntry, validate, computeStats } = await gen();
    const e = toEntry(fixture(18), undefined, REPO);
    expect(e.pending).toBe(true);
    expect(e.redTest?.sha).toBe(fixture(18).commits[0].oid);
    expect(e.url).toBe(`${GH}/pull/18`);
    expect(e.visitorChange).toBeUndefined();
    expect(e.humanDecision).toBeUndefined();
    expect(e.review).toBeUndefined();
    expect(e.findings).toEqual([]);
    expect(validate({ repo: REPO, prs: [e] })).toEqual([]);
    // Pending and without a red test: the reason is copy too, so it waits as well.
    expect(validate({ repo: REPO, prs: [toEntry(fixture(1), undefined, REPO)] })).toEqual([]);
    expect(computeStats([e]).findings).toBe(0);
    // A curated entry is never pending, and a half-written one is a problem, not a pending card.
    const ok = { visitorChange: { en: 'x', ru: 'х' }, humanDecision: { en: 'x', ru: 'х' }, findings: [] };
    expect(toEntry(fixture(12), ok, REPO).pending).toBeUndefined();
    const half = toEntry(fixture(12), { visitorChange: { en: 'x', ru: 'х' } } as any, REPO);
    expect(validate({ repo: REPO, prs: [half] }).join('\n')).toMatch(/#12\b/);
  });

  test('a PR without a red test first says why: before the loop, or another reason', async () => {
    const { toEntry, validate } = await gen();
    const ok = { visitorChange: { en: 'x', ru: 'х' }, humanDecision: { en: 'x', ru: 'х' }, findings: [] };
    expect(validate({ repo: REPO, prs: [toEntry(fixture(1), { ...ok, noRedTest: { en: 'Tests came with the code.', ru: 'Тесты пришли вместе с кодом.' } }, REPO)] })).toEqual([]);
  });

  // The workflow opens a PR only when the data file changed. A run after a bot PR merges sees the
  // same PRs and a newer main commit: that alone must leave the file byte for byte as it was.
  test('nextStory keeps the previous data untouched when only the main commit moved', async () => {
    const { toEntry, nextStory } = await gen();
    const h = { visitorChange: { en: 'x', ru: 'х' }, humanDecision: { en: 'x', ru: 'х' }, findings: [] };
    const verdict = { kind: 'judge', verdict: 'SHIP', summary: { en: 'ok', ru: 'ок' }, url: `${GH}/pull/12#issuecomment-1`, at: '2026-11-05T00:00:00Z' };
    const prev = {
      repo: REPO,
      generatedAt: '2026-11-04T00:00:00.000Z',
      throughSha: 'a'.repeat(40),
      prs: [{ ...toEntry(fixture(12), h, REPO), ciVerdicts: [verdict] }],
    };
    const same = nextStory(prev, [toEntry(fixture(12), h, REPO)], 'b'.repeat(40), '2026-11-05T00:00:00.000Z');
    expect(JSON.stringify(same)).toBe(JSON.stringify(prev));

    const grown = nextStory(prev, [toEntry(fixture(12), h, REPO), toEntry(fixture(18), undefined, REPO)], 'b'.repeat(40), '2026-11-05T00:00:00.000Z');
    expect(grown.throughSha).toBe('b'.repeat(40));
    expect(grown.generatedAt).toBe('2026-11-05T00:00:00.000Z');
    expect(grown.prs.map((p: any) => p.number)).toEqual([12, 18]);
    expect(grown.prs[0].ciVerdicts).toEqual([verdict]);

    expect(nextStory(null, [toEntry(fixture(12), h, REPO)], 'b'.repeat(40), '2026-11-05T00:00:00.000Z').throughSha).toBe('b'.repeat(40));
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
    // Merges that only refreshed the build-story data are left out (see isDataOnly).
    const dataOnly = (sha: string) =>
      execSync(`git diff --name-only ${sha}^1 ${sha}`, { encoding: 'utf8' })
        .split('\n')
        .filter(Boolean)
        .every((f) => /^src\/data\/build-story[^/]*\.json$/.test(f));
    const merged = execSync(`git log --merges --format=%H%x09%s ${story.throughSha}`, { encoding: 'utf8' })
      .split('\n')
      .map((l) => l.split('\t'))
      .map(([sha, s]) => ({ sha, n: Number(s?.match(/^Merge pull request #(\d+) from /)?.[1]) }))
      .filter((m) => m.n);
    expect(merged.length).toBeGreaterThan(0);
    const have = new Set(story.prs.map((p: any) => p.number));
    expect(merged.filter((m) => !have.has(m.n) && !dataOnly(m.sha)).map((m) => m.n)).toEqual([]);
    expect(merged.filter((m) => have.has(m.n) && dataOnly(m.sha)).map((m) => m.n)).toEqual([]);
  });

  test('catches up with main: every PR through #24 is in, the data-only #15 is not', () => {
    const have = story.prs.map((p: any) => p.number);
    for (const n of [16, 17, 18, 19, 20, 21, 22, 23, 24]) expect(have).toContain(n);
    expect(have).not.toContain(15);
  });

  test('no curated PR lacks a red-test-first commit unless it says why, in both languages', () => {
    for (const p of story.prs) {
      if (p.redTest) {
        expect(p.redTest.url).toBe(`${GH}/commit/${p.redTest.sha}`);
        expect(p.commits.find((c: any) => c.sha === p.redTest.sha)?.role).toBe('red');
      } else if (!p.pending) expect(isL10n(p.preLoop) || isL10n(p.noRedTest), `#${p.number} preLoop or noRedTest`).toBe(true);
    }
  });

  test('every curated PR says what changed for visitors and what the human decided, EN and RU', () => {
    for (const p of story.prs) {
      expect(Array.isArray(p.ciVerdicts), `#${p.number} ciVerdicts slot`).toBe(true);
      if (p.pending) {
        expect(p.findings, `#${p.number} pending findings`).toEqual([]);
        continue;
      }
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
      // Pending exactly when there is no highlight to show.
      expect(!!p.pending, `#${p.number} pending`).toBe(!h);
      if (!h) continue;
      for (const k of ['visitorChange', 'humanDecision', 'findings', 'preLoop', 'noRedTest'])
        expect(p[k] ?? null, `#${p.number}.${k}`).toEqual(h[k] ?? null);
    }
    // No highlight is orphaned (e.g. #15's after it left the story).
    const numbers = new Set(story.prs.map((p: any) => String(p.number)));
    expect(Object.keys(highlights).filter((k) => !numbers.has(k))).toEqual([]);
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

  test('speaks English and Russian (here and on /ru/)', () => {
    const h1 = (page: string) => text(page.match(/<h1[\s\S]*?<\/h1>/)?.[0] ?? '');
    expect(h1(html)).toMatch(/built/i);
    expect(h1(html)).not.toMatch(CYRILLIC);
    expect(h1(read(`dist/ru${PATH}index.html`))).toMatch(CYRILLIC);
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
      if (p.pending) {
        // Facts only, marked as waiting for the human's notes.
        expect(c).toMatch(/data-pending/);
        continue;
      }
      expect(c).not.toMatch(/data-pending/);
      expect(t).toContain(p.visitorChange.en);
      expect(t).toContain(p.humanDecision.en);
      for (const f of p.findings) {
        expect(t).toContain(f.en);
        expect(hrefs(c)).toContain(f.ref);
      }
      if (!p.redTest) expect(t).toContain((p.preLoop ?? p.noRedTest).en);
    }
  });

  // The committed data may have no pending PR at a given moment, so the page's pending branch is
  // pinned in its source: a bot PR must render, in both languages, without copy.
  test('the page renders a pending card in both languages', () => {
    const src = read('src/pages/[...locale]/how-its-built.astro');
    expect(src).toMatch(/data-pending/);
    expect(src).toMatch(/pending/);
  });

  test('the RU page carries the same cards in Russian', () => {
    const ru = text(read(`dist/ru${PATH}index.html`));
    for (const p of story.prs) {
      if (p.pending) continue;
      expect(ru).toContain(p.visitorChange.ru);
      expect(ru).toContain(p.humanDecision.ru);
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
