// Data behind /how-its-built/: every merged PR of this repo with its real artifacts (the red test
// committed first, the commits, what was caught before merge, what the human decided).
// Facts come from `gh pr view`; the copy comes from the hand-curated src/data/build-story-highlights.json.
// The page renders src/data/build-story.json and derives every number from it with computeStats().
//
// Usage: bun run build-story   (needs an authenticated `gh`). .github/workflows/build-story.yml runs it on
// every push to main and proposes the result as one bot PR; a PR without highlights shows up pending
// (facts only) until Gleb writes its copy. PRs that only touch build-story data are left out.
// Not part of `bun run build`: Vercel has no GitHub token, so the build only reads the committed file.
// Replay: bun scripts/build-story.ts --replay 11 [--stdout] writes src/data/replay-pr11.json (or prints it)
// from build-story.json and local git only, no gh: the hero topology's replay of that PR's agent run.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const REPO = 'Grumbash/rossev.dev';

export type L10n = { en: string; ru: string };
export type Role = 'red' | 'merge' | 'impl';

/** The commit shape `gh pr view --json commits` returns (the fields this script reads). */
export type GhCommit = { oid: string; messageHeadline: string; messageBody?: string; authoredDate?: string };
export type GhPr = {
  number: number;
  title: string;
  url: string;
  mergedAt: string;
  headRefName: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  commits: GhCommit[];
  /** Only the CLI asks for it (`files`), to leave data-only PRs out. */
  files?: { path: string }[];
};

export type Finding = L10n & {
  /** The commit of this PR that fixed it, or the PR URL when no single commit can be named. */
  ref: string;
};

export type Highlight = {
  /** The card title on /ru/: the PR title in Russian. The GitHub title stays the EN card title. */
  titleRu?: string;
  visitorChange: L10n;
  humanDecision: L10n;
  findings: Finding[];
  /** Only for PRs without a red-test-first commit: why (e.g. made before the loop existed). */
  preLoop?: L10n;
  /** Only for PRs without a red-test-first commit made after the loop existed: the literal reason. */
  noRedTest?: L10n;
  /** Only where the PR body says an independent review or judge ran: what it said, close to the body's words. */
  review?: L10n;
  /** The commit where the red test went green, when it can be named (must be a commit of this PR). */
  green?: string;
};

/**
 * A verdict appended by CI (a GitHub Actions LLM judge or the perf watchdog), not by this script.
 * Intended shape; nothing writes it yet, and this script always emits an empty list.
 */
export type CiVerdict = {
  kind: 'judge' | 'perf';
  /** The workflow's own word, e.g. SHIP / SHIP AFTER FIXES / BLOCK for the judge, pass / fail for perf. */
  verdict: string;
  /** One line on what it checked or found. */
  summary: L10n;
  /** The Actions run that produced it. */
  url: string;
  at: string;
};

export type Commit = { sha: string; subject: string; role: Role; url: string };
export type RedTest = { sha: string; subject: string; url: string };

export type Entry = {
  number: number;
  title: string;
  url: string;
  mergedAt: string;
  branch: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  redTest: RedTest | null;
  commits: Commit[];
  /** No highlight yet: the card shows facts only until Gleb writes the copy. Absent on curated entries. */
  pending?: true;
  visitorChange?: L10n;
  humanDecision?: L10n;
  titleRu?: string;
  findings: Finding[];
  preLoop?: L10n;
  noRedTest?: L10n;
  review?: L10n;
  green?: RedTest;
  ciVerdicts: CiVerdict[];
};

export type Story = {
  repo: string;
  generatedAt?: string;
  /** The main commit the data was generated through: every PR merged up to it is in `prs`. */
  throughSha?: string;
  prs: Entry[];
};
export type Stats = { prs: number; redFirst: number; findings: number; commits: number };

const gh = (repo: string) => `https://github.com/${repo}`;
const commitUrl = (sha: string, repo: string) => `${gh(repo)}/commit/${sha}`;

// Red only by how the subject starts: "Fix the failing test" is an implementation commit.
export function classifyCommit(subject: string): Role {
  if (/^(Red test:|Add a failing test|Add failing tests)/.test(subject)) return 'red';
  if (/^Merge (pull request|remote-tracking branch|branch)\b/.test(subject)) return 'merge';
  return 'impl';
}

// GitHub cuts long subjects at ~70 chars into "…", moving the rest to the start of the body.
const subjectOf = (c: GhCommit) =>
  c.messageHeadline.endsWith('…') && c.messageBody?.startsWith('…')
    ? c.messageHeadline.slice(0, -1) + c.messageBody.slice(1).split('\n')[0]
    : c.messageHeadline;

// Red-test-first means the PR's first own commit is the test; a merge from main before it doesn't count.
export function redTestOf(commits: GhCommit[], repo = REPO): RedTest | null {
  const first = commits.find((c) => classifyCommit(c.messageHeadline) !== 'merge');
  if (!first || classifyCommit(first.messageHeadline) !== 'red') return null;
  return { sha: first.oid, subject: subjectOf(first), url: commitUrl(first.oid, repo) };
}

// A PR that only refreshes the build-story data (#15, every bot PR) is bookkeeping, not loop work.
// Leaving it out is also the workflow's loop guard: merging the bot's PR adds no entry about itself.
const DATA_FILE = /^src\/data\/build-story[^/]*\.json$/;
export function isDataOnly(paths: string[]): boolean {
  return paths.length > 0 && paths.every((p) => DATA_FILE.test(p));
}

// Any bot's PR (bot/publora-sync, bot/build-story) is bookkeeping too: it would otherwise become a
// pending card, and merging bot/build-story would make a story about itself. No file list means unknown,
// so not data-only.
export function isBookkeeping(pr: { headRefName: string; files?: { path: string }[] }): boolean {
  return pr.headRefName.startsWith('bot/') || isDataOnly((pr.files ?? []).map((f) => f.path));
}

// A red commit may add a stub its test imports, nothing more: a NEW file holding only the
// "Not implemented yet" comment, type-only imports and declarations, inert constants, and functions
// whose whole body throws 'not implemented' (or calls such a function). A modified file is never one,
// since editing a real module under the same comment would slip code in before the test.
const THROW = String.raw`\{ throw new Error\('not implemented'\);? \}`;
export function isPlaceholder(status: string, content: string): boolean {
  if (status !== 'A' || !/^\/\/.*\bNot implemented yet: tests\/\S+ is red first/m.test(content)) return false;
  const code = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // Top-level statements: split at `;`, and at a closing `}` at depth 0 when a new statement follows.
  const statements: string[] = [];
  let depth = 0;
  let quote = '';
  let cur = '';
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    cur += ch;
    if (quote) {
      if (ch === quote && code[i - 1] !== '\\') quote = '';
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    else if ('({['.includes(ch)) depth++;
    else if (')}]'.includes(ch)) depth--;
    const rest = code.slice(i + 1).trimStart();
    if (depth === 0 && (ch === ';' || (ch === '}' && (rest === '' || /^(export|import|const|let|var|function|class|interface|type)\b/.test(rest))))) {
      statements.push(cur);
      cur = '';
    }
  }
  if (depth !== 0 || quote || cur.trim()) return false;
  const throwers = new Set<string>();
  const params = String.raw`\([^)]*\)`;
  const throwing = new RegExp(
    String.raw`^(?:export )?(?:function (\w+)${params}(?:: [^{]+)? ${THROW}|const (\w+)(?:: [^=]+)? = ${params}(?:: [^=]+?)? => ${THROW});?$`,
  );
  const calling = new RegExp(String.raw`^(?:export )?const \w+(?:: [^=]+)? = ${params}(?:: .+?)? => (\w+)\(\);?$`);
  const inert = /^(?:export )?const \w+(?:: [^=]+)? = (?:-?\d[\d_.]*|'[^']*'|"[^"]*"|true|false|null|[[{][^()=`]*[\]}](?: as const)?);?$/;
  for (const raw of statements) {
    const st = raw.replace(/\s+/g, ' ').trim();
    if (st === '' || st === ';') continue;
    if (/^import type [^;]+ from '[^']+';?$/.test(st) || /^export (?:type|interface) /.test(st)) continue;
    const t = st.match(throwing);
    if (t) {
      throwers.add(t[1] ?? t[2]);
      continue;
    }
    const c = st.match(calling);
    if (c && throwers.has(c[1])) continue;
    if (inert.test(st)) continue;
    return false;
  }
  return throwers.size > 0;
}

// Without a highlight the entry carries only what git and GitHub know: copy in Gleb's voice waits for him.
/** One commit of main as `git log --format=%H%x00%aI%x00%s` prints it. */
export type MainCommit = { sha: string; authoredAt: string; subject: string };

/**
 * Main's history was rewritten once (2026-11-04: docs/ and AI co-author trailers dropped), but GitHub
 * keeps each PR's commit list as it was. A PR commit main does not contain is replaced by its
 * rewritten twin on main: same author time, and the subject gh shows (cut at ~70 chars with "…")
 * when several commits share that second. Commits main contains, or with no single twin, stay.
 */
export function onMain(commits: GhCommit[], main: MainCommit[]): GhCommit[] {
  const shas = new Set(main.map((c) => c.sha));
  return commits.map((c) => {
    if (shas.has(c.oid) || !c.authoredDate) return c;
    const at = Date.parse(c.authoredDate);
    const head = c.messageHeadline.replace(/…$/, '');
    const same = main.filter((m) => Date.parse(m.authoredAt) === at);
    const twins = same.length > 1 ? same.filter((m) => m.subject.startsWith(head)) : same;
    return twins.length === 1 ? { ...c, oid: twins[0].sha } : c;
  });
}

export function toEntry(pr: GhPr, h: Highlight | undefined, repo = REPO): Entry {
  const entry: Entry = {
    number: pr.number,
    title: pr.title,
    url: `${gh(repo)}/pull/${pr.number}`,
    mergedAt: pr.mergedAt,
    branch: pr.headRefName,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changedFiles,
    redTest: redTestOf(pr.commits, repo),
    commits: pr.commits.map((c) => ({
      sha: c.oid,
      subject: subjectOf(c),
      role: classifyCommit(c.messageHeadline),
      url: commitUrl(c.oid, repo),
    })),
    findings: [],
    ciVerdicts: [],
  };
  if (!h) return { ...entry, pending: true };
  entry.visitorChange = h.visitorChange;
  entry.humanDecision = h.humanDecision;
  if (h.titleRu) entry.titleRu = h.titleRu;
  entry.findings = h.findings ?? [];
  if (h.preLoop) entry.preLoop = h.preLoop;
  if (h.noRedTest) entry.noRedTest = h.noRedTest;
  if (h.review) entry.review = h.review;
  if (h.green) {
    const c = pr.commits.find((x) => x.oid === h.green);
    // An unknown sha is kept as-is so validate() can name it instead of it silently disappearing.
    entry.green = { sha: h.green, subject: c ? subjectOf(c) : '', url: commitUrl(h.green, repo) };
  }
  return entry;
}

// CI appends verdicts to the committed data; a regeneration from `gh` must not drop them.
export function carryCiVerdicts(old: Pick<Story, 'prs'> | null, fresh: Entry[]): Entry[] {
  const kept = new Map((old?.prs ?? []).map((p) => [p.number, p.ciVerdicts ?? []]));
  return fresh.map((p) => ({ ...p, ciVerdicts: kept.get(p.number) ?? p.ciVerdicts }));
}

// The workflow proposes a PR only when the file changed, so an unchanged story must come back as
// `prev` itself: a newer main commit (e.g. the merge of the bot's own PR) or a new timestamp alone
// is not a change.
export function nextStory(prev: Story | null, prs: Entry[], throughSha: string, now: string): Story {
  const carried = carryCiVerdicts(prev, prs);
  if (prev && JSON.stringify(prev.prs) === JSON.stringify(carried)) return prev;
  return { repo: REPO, generatedAt: now, throughSha, prs: carried };
}

export function computeStats(prs: Entry[]): Stats {
  return {
    prs: prs.length,
    redFirst: prs.filter((p) => p.redTest).length,
    findings: prs.reduce((n, p) => n + p.findings.length, 0),
    commits: prs.reduce((n, p) => n + p.commits.filter((c) => c.role !== 'merge').length, 0),
  };
}

const CYRILLIC = /[А-Яа-яЁё]/;
const isL10n = (v: unknown): v is L10n => {
  const o = v as L10n | undefined;
  return !!o && typeof o.en === 'string' && o.en.trim() !== '' && typeof o.ru === 'string' && CYRILLIC.test(o.ru);
};

// Every problem names its PR, so a failed run says which highlight to fix.
export function validate(story: Story): string[] {
  const problems: string[] = [];
  const base = gh(story.repo);
  for (const p of story.prs) {
    const n = `#${p.number}`;
    if (p.url !== `${base}/pull/${p.number}`) problems.push(`${n}: url ${p.url} is not ${base}/pull/${p.number}`);
    // A pending entry waits for all of its copy, including the reason it has no red test.
    if (!p.pending && !p.redTest && !isL10n(p.preLoop) && !isL10n(p.noRedTest))
      problems.push(`${n}: no red test first and no preLoop or noRedTest reason (EN + RU)`);
    if (p.redTest && p.commits.find((c) => c.sha === p.redTest!.sha)?.role !== 'red')
      problems.push(`${n}: red test ${p.redTest.sha} is not a red commit of this PR`);
    if (p.pending) {
      if (p.visitorChange || p.humanDecision || p.review || p.findings?.length) problems.push(`${n}: a pending entry carries no copy`);
    } else {
      if (!isL10n(p.visitorChange)) problems.push(`${n}: visitorChange needs EN and Russian RU`);
      if (!isL10n(p.humanDecision)) problems.push(`${n}: humanDecision needs EN and Russian RU`);
    }
    if (p.noRedTest !== undefined && !isL10n(p.noRedTest)) problems.push(`${n}: noRedTest needs EN and Russian RU`);
    if (p.titleRu !== undefined && !CYRILLIC.test(p.titleRu)) problems.push(`${n}: titleRu needs Russian`);
    if (!Array.isArray(p.ciVerdicts)) problems.push(`${n}: ciVerdicts must be a list`);
    if (p.review !== undefined && !isL10n(p.review)) problems.push(`${n}: review needs EN and Russian RU`);
    if (p.green && p.commits.find((c) => c.sha === p.green!.sha)?.role !== 'impl')
      problems.push(`${n}: green ${p.green.sha} is not an implementation commit of this PR`);
    const shas = new Set(p.commits.map((c) => c.sha));
    for (const f of p.findings ?? []) {
      if (!isL10n(f)) problems.push(`${n}: finding "${f.en}" needs EN and Russian RU`);
      const sha = f.ref?.match(new RegExp(`^${base}/commit/([0-9a-f]{40})$`))?.[1];
      if (f.ref !== `${base}/pull/${p.number}` && !sha) problems.push(`${n}: finding ref ${f.ref} is not this PR or one of its commits`);
      else if (sha && !shas.has(sha)) problems.push(`${n}: finding ref ${f.ref} is a commit outside this PR`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Replay: one PR's agent run as timed events on the yagni topology (src/data/topology.ts,
// ISO_DOMAINS.yagni.nodes: 0 PLAN & GITHUB, 1 AGENT CORE, 2 BUILDER, 3 REVIEWER & JUDGE, 4 SANDBOX,
// 5 ORG ISOLATION, 6 SELF-IMPROVING, 7 radar). Every event points at a commit of the PR and takes that
// commit's author date (when the work happened: the branch's rebase rewrote every
// committer date to 00:49); diff lines must be lines the commit added, test names must be in its tests.

export type ReplayKind = 'plan' | 'diff' | 'test' | 'catch' | 'fix' | 'merge';
export type ReplayEvent = {
  t: string;
  kind: ReplayKind;
  node: number;
  sha?: string;
  caption: L10n;
  lines?: string[];
  /** For `test`/`fix` events: the commit whose test file `lines` quotes, when not `sha` itself. */
  testsAt?: string;
  reproduced?: boolean;
};
export type Replay = { pr: number; label: L10n; url: string; mergedAt: string; events: ReplayEvent[] };

/** A storyboard step: an event without its time, which comes from git (or the PR's merge). */
export type ReplayStep = Omit<ReplayEvent, 't'> & {
  /** For `test` steps: the file whose test names `lines` quotes. */
  testFile?: string;
};
export type Storyboard = { label: L10n; steps: ReplayStep[] };

/** What the replay builder reads from git; the CLI passes the local repo, tests can pass a stub. */
export type GitReader = {
  /** Author date, ISO 8601. */
  authoredAt(sha: string): string;
  /** Lines the commit added, without the leading "+". */
  added(sha: string): string[];
  /** A file at that commit. */
  show(sha: string, path: string): string;
};

// The round-1 implementation never reached git: it was rewritten before its first commit, so the run's
// steps point at the implementation it became (19f2dbc, also the finding's own ref). The sandbox step
// quotes the tests that existed then (`testsAt`: the first red test, bites only, no cut). The strokes
// red test and the retrain were authored in the same second as 19f2dbc.
const SHA = {
  red: 'ead95cff3b5fe2180c6ea6f69d9d906e7eb8578f',
  strokes: '85abfee4dc9c6eef4003a8e44d1f2e84d9dab9ac',
  impl: '19f2dbcc2f73de42886406c972e1db0576c903f5',
};

export const STORYBOARDS: Record<number, Storyboard> = {
  11: {
    label: {
      en: 'Replay of a real agent run on this site · PR #11',
      ru: 'Повтор реального прогона агентов на этом сайте · PR #11',
    },
    steps: [
      {
        kind: 'plan',
        node: 0,
        sha: SHA.red,
        caption: {
          en: 'Plan: a failing test first. GR grows from one cell and regrows after a bite',
          ru: 'План: сначала падающий тест. GR растёт из одной клетки и отрастает после укуса',
        },
      },
      {
        kind: 'diff',
        node: 2,
        sha: SHA.impl,
        caption: {
          en: 'The builder writes the model: each cell senses its neighbours, then updates',
          ru: 'Builder пишет модель: каждая клетка ощущает соседей и обновляется',
        },
        lines: [
          'p[c * 3] = state[base + c];',
          'p[c * 3 + 1] = (tr + 2 * r + br - tl - 2 * l - bl) / 8;',
          'p[c * 3 + 2] = (bl + 2 * b + br - tl - 2 * t - tr) / 8;',
          'if (this.rng() < this.fireRate) this.update(cell, next);',
          'if (region[cell] && !(preAlive[cell] && postAlive[cell])) next.fill(0, cell * ch, (cell + 1) * ch);',
        ],
      },
      {
        kind: 'test',
        node: 4,
        sha: SHA.impl,
        testsAt: SHA.red,
        testFile: 'tests/nca.test.ts',
        caption: {
          en: 'The sandbox runs the checks: all green, but they only test round bites',
          ru: 'Песочница гоняет проверки: всё зелёное, но проверяются только круглые укусы',
        },
        lines: [
          'grows GR from a single seed cell',
          'regrows after a bite out of the centre',
          'regrows after a bite out of the left edge',
          'stays stable long after it has grown',
        ],
      },
      {
        kind: 'catch',
        node: 3,
        sha: SHA.impl,
        reproduced: true,
        caption: {
          en: 'The judge catches it: after a vertical cut the G grows back as an R',
          ru: 'Судья ловит ошибку: после вертикального разреза G отрастает как R',
        },
      },
      {
        kind: 'fix',
        node: 4,
        sha: SHA.strokes,
        testFile: 'tests/nca.test.ts',
        lines: ['a vertical cut between the letters'],
        caption: {
          en: 'The catch becomes a red test: heal drag strokes, not only round bites',
          ru: 'Находка становится красным тестом: заживать после штрихов, а не только укусов',
        },
      },
      {
        kind: 'fix',
        node: 2,
        sha: SHA.impl,
        caption: {
          en: 'Retrained on strokes from the start: the cut heals and the G stays a G',
          ru: 'Сеть переобучена на штрихах с нуля: разрез заживает, G остаётся G',
        },
      },
      {
        kind: 'merge',
        node: 0,
        caption: {
          en: 'Merged, with the known limit written down',
          ru: 'Смержено в main, известное ограничение записано',
        },
      },
    ],
  },
};

/**
 * A test name is in the source literally, or matches a template title like `regrows after a bite out of the ${name}`
 * whose ${...} part is one of the string literals in that file (same rule as tests/replay-data.test.ts).
 */
export function testNameIn(src: string, name: string): boolean {
  if (src.includes(name)) return true;
  const literals = new Set([...src.matchAll(/'([^'\n]+)'/g)].map((m) => m[1]));
  for (const m of src.matchAll(/test\(`([^`]*)\$\{\w+\}([^`]*)`/g)) {
    if (name.startsWith(m[1]) && name.endsWith(m[2]) && literals.has(name.slice(m[1].length, name.length - m[2].length))) return true;
  }
  return false;
}

/** The judge's G→R finding a `reproduced` catch must stand for. */
const G_TO_R = /G grow back as an R/;

/** The replay of PR `number`: storyboard steps timed from git, checked against the commits. Throws on a mismatch. */
export function replayFor(story: Story, git: GitReader, number: number, board: Storyboard | undefined = STORYBOARDS[number]): Replay {
  const pr = story.prs.find((p) => p.number === number);
  if (!pr) throw new Error(`replay: #${number} is not in build-story.json`);
  if (!board) throw new Error(`replay: no storyboard for #${number}`);
  const shas = new Set(pr.commits.map((c) => c.sha));
  const events = board.steps.map(({ testFile, ...step }): ReplayEvent => {
    if (step.kind === 'merge') return { t: pr.mergedAt, ...step };
    if (!step.sha || !shas.has(step.sha)) throw new Error(`replay #${number}: ${step.kind} ${step.sha} is not a commit of the PR`);
    if (step.kind === 'plan' && pr.commits.find((c) => c.sha === step.sha)?.role !== 'red')
      throw new Error(`replay #${number}: plan ${step.sha} is not a red-test commit`);
    if (step.kind === 'diff') {
      const added = new Set(git.added(step.sha).map((l) => l.trim()));
      for (const l of step.lines ?? []) if (!added.has(l.trim())) throw new Error(`replay #${number}: ${step.sha.slice(0, 7)} did not add ${JSON.stringify(l)}`);
    }
    if (step.reproduced && !pr.findings.some((f) => G_TO_R.test(f.en)))
      throw new Error(`replay #${number}: ${step.kind} is marked reproduced, but the PR has no G→R finding`);
    if (step.testsAt && !shas.has(step.testsAt)) throw new Error(`replay #${number}: testsAt ${step.testsAt} is not a commit of the PR`);
    if (step.kind === 'test' || (step.kind === 'fix' && step.lines?.length)) {
      const at = step.testsAt ?? step.sha;
      const file = testFile ?? 'tests/nca.test.ts';
      const src = git.show(at, file);
      for (const n of step.lines ?? []) if (!testNameIn(src, n)) throw new Error(`replay #${number}: no test ${JSON.stringify(n)} in ${file} at ${at.slice(0, 7)}`);
    }
    return { t: git.authoredAt(step.sha), ...step };
  });
  for (let i = 1; i < events.length; i++)
    if (Date.parse(events[i].t) < Date.parse(events[i - 1].t))
      throw new Error(`replay #${number}: ${events[i].kind} (${events[i].t}) is earlier than ${events[i - 1].kind} (${events[i - 1].t})`);
  for (const e of events) {
    if (!isL10n(e.caption) || e.caption.en.length > 90) throw new Error(`replay #${number}: caption "${e.caption.en}" needs EN ≤ 90 chars and Russian RU`);
    if (!Number.isInteger(e.node) || e.node < 0 || e.node > 7) throw new Error(`replay #${number}: node ${e.node} is not a topology node`);
  }
  return { pr: number, label: board.label, url: pr.url, mergedAt: pr.mergedAt, events };
}

const run = (args: string[]) => execFileSync('gh', args, { encoding: 'utf8' });
const git = (args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();

// Non-test files a red commit may add because they only produce test fixtures, never site code.
// Named one by one, with the reason, so the red-commit check stays strict for everything else.
const RED_COMMIT_TOOLING: Record<string, string[]> = {
  // #25: the export script that wrote tests/fixtures/vad/hello.json in the same commit; the weights it
  // also writes (public/vad/) came with the implementation.
  'f5177fb85eb143ee75fb1e54db148207b8148818': ['scripts/vad/export.py'],
};

const replayAt = process.argv.indexOf('--replay');
if (import.meta.main && replayAt >= 0) {
  // Local only: build-story.json plus git, never gh.
  const root = resolve(import.meta.dir, '..');
  const number = Number(process.argv[replayAt + 1]);
  const story: Story = JSON.parse(readFileSync(resolve(root, 'src/data/build-story.json'), 'utf8'));
  const local: GitReader = {
    authoredAt: (sha) => git(['show', '-s', '--format=%aI', sha]),
    added: (sha) =>
      execFileSync('git', ['show', '--format=', sha], { encoding: 'utf8', maxBuffer: 64 << 20 })
        .split('\n')
        .filter((l) => l.startsWith('+'))
        .map((l) => l.slice(1)),
    show: (sha, path) => execFileSync('git', ['show', `${sha}:${path}`], { encoding: 'utf8', maxBuffer: 64 << 20 }),
  };
  const json = JSON.stringify(replayFor(story, local, number), null, 2) + '\n';
  if (process.argv.includes('--stdout')) process.stdout.write(json);
  else {
    writeFileSync(resolve(root, `src/data/replay-pr${number}.json`), json);
    console.log(`✓ src/data/replay-pr${number}.json`);
  }
} else if (import.meta.main) {
  const root = resolve(import.meta.dir, '..');
  const highlights: Record<string, Highlight> = JSON.parse(readFileSync(resolve(root, 'src/data/build-story-highlights.json'), 'utf8'));
  const numbers: number[] = JSON.parse(run(['pr', 'list', '--repo', REPO, '--state', 'merged', '--limit', '1000', '--json', 'number'])).map(
    (p: { number: number }) => p.number,
  );
  const fields = 'number,title,url,mergedAt,headRefName,additions,deletions,changedFiles,commits,files';
  const mainLog: MainCommit[] = git(['log', '--format=%H%x00%aI%x00%s', 'HEAD'])
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [sha, authoredAt, subject] = l.split('\0');
      return { sha, authoredAt, subject };
    });
  const early: string[] = [];
  // No highlight is not an error any more: the entry is pending until Gleb writes its copy.
  const prs = numbers
    .map((n) => JSON.parse(run(['pr', 'view', String(n), '--repo', REPO, '--json', fields])) as GhPr)
    .filter((pr) => !isBookkeeping(pr))
    .map((pr) => ({ ...pr, commits: onMain(pr.commits, mainLog) }))
    .sort((a, b) => a.mergedAt.localeCompare(b.mergedAt))
    .map((pr) => toEntry(pr, highlights[String(pr.number)], REPO));
  const listed = new Set(prs.map((p) => String(p.number)));
  for (const k of Object.keys(highlights)) if (!listed.has(k)) early.push(`#${k}: highlight for a PR that is not in the story (bookkeeping or not merged)`);
  // A red-test commit is only a test: anything outside tests/ means code landed before (or with) it.
  // Two exceptions carry no behaviour: a new placeholder stub (isPlaceholder) and RED_COMMIT_TOOLING.
  // A commit git can't see (a squash-merged PR whose branch is gone, not in the fetched pull refs) is
  // a warning, not a crash: the PR still counts by what gh reports.
  for (const p of prs)
    for (const c of p.commits.filter((x) => x.role === 'red')) {
      let changed: [string, string][];
      try {
        changed = git(['show', '--name-status', '--format=', c.sha])
          .split('\n')
          .filter(Boolean)
          .map((l) => l.split('\t') as [string, string]);
      } catch {
        console.warn(`! #${p.number}: red commit ${c.sha.slice(0, 7)} is not in local git; its files were not checked`);
        continue;
      }
      const code = changed
        .filter(([, f]) => !f.startsWith('tests/') && !RED_COMMIT_TOOLING[c.sha]?.includes(f))
        .filter(([status, f]) => !(status === 'A' && isPlaceholder(status, git(['show', `${c.sha}:${f}`]))))
        .map(([, f]) => f);
      if (code.length) early.push(`#${p.number}: red commit ${c.sha.slice(0, 7)} touches ${code.join(', ')}`);
    }

  // The main commit this data covers, as an ancestor of HEAD, so the freshness test can check it here.
  try {
    git(['fetch', '--quiet', 'origin', 'main']);
  } catch {}
  const throughSha = git(['merge-base', 'HEAD', 'origin/main']);

  // An unchanged story keeps the file byte for byte (nextStory), so the workflow proposes nothing.
  const out = resolve(root, 'src/data/build-story.json');
  let prev: Story | null = null;
  try {
    prev = JSON.parse(readFileSync(out, 'utf8'));
  } catch {}
  const story = nextStory(prev, prs, throughSha, new Date().toISOString());
  const problems = [...early, ...validate(story)];
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  writeFileSync(out, JSON.stringify(story, null, 2) + '\n');
  const s = computeStats(story.prs);
  const pending = story.prs.filter((p) => p.pending).map((p) => `#${p.number}`);
  console.log(`✓ src/data/build-story.json: ${s.prs} PRs, ${s.redFirst} red-test-first, ${s.findings} findings, ${s.commits} commits`);
  if (pending.length) console.log(`  pending notes: ${pending.join(', ')}`);
}
