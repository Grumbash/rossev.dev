// Data behind /how-its-built/: every merged PR of this repo with its real artifacts (the red test
// committed first, the commits, what was caught before merge, what the human decided).
// Facts come from `gh pr view`; the copy comes from the hand-curated src/data/build-story-highlights.json.
// The page renders src/data/build-story.json and derives every number from it with computeStats().
//
// Usage: bun run build-story   (needs an authenticated `gh`; rerun after each merge and commit the JSON).
// Not part of `bun run build`: Vercel has no GitHub token, so the build only reads the committed file.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const REPO = 'Grumbash/rossev.dev';

export type L10n = { en: string; ru: string };
export type Role = 'red' | 'merge' | 'impl';

/** The commit shape `gh pr view --json commits` returns (the fields this script reads). */
export type GhCommit = { oid: string; messageHeadline: string; messageBody?: string };
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
};

export type Finding = L10n & {
  /** The commit of this PR that fixed it, or the PR URL when no single commit can be named. */
  ref: string;
};

export type Highlight = {
  visitorChange: L10n;
  humanDecision: L10n;
  findings: Finding[];
  /** Only for PRs without a red-test-first commit: why (e.g. made before the loop existed). */
  preLoop?: L10n;
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
  visitorChange: L10n;
  humanDecision: L10n;
  findings: Finding[];
  preLoop?: L10n;
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
  if (/^(Red test:|Add a failing test)/.test(subject)) return 'red';
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

export function toEntry(pr: GhPr, h: Highlight, repo = REPO): Entry {
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
    visitorChange: h.visitorChange,
    humanDecision: h.humanDecision,
    findings: h.findings ?? [],
    ciVerdicts: [],
  };
  if (h.preLoop) entry.preLoop = h.preLoop;
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
    if (!p.redTest && !isL10n(p.preLoop)) problems.push(`${n}: no red test first and no preLoop reason (EN + RU)`);
    if (p.redTest && p.commits.find((c) => c.sha === p.redTest!.sha)?.role !== 'red')
      problems.push(`${n}: red test ${p.redTest.sha} is not a red commit of this PR`);
    if (!isL10n(p.visitorChange)) problems.push(`${n}: visitorChange needs EN and Russian RU`);
    if (!isL10n(p.humanDecision)) problems.push(`${n}: humanDecision needs EN and Russian RU`);
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

const run = (args: string[]) => execFileSync('gh', args, { encoding: 'utf8' });
const git = (args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();

if (import.meta.main) {
  const root = resolve(import.meta.dir, '..');
  const highlights: Record<string, Highlight> = JSON.parse(readFileSync(resolve(root, 'src/data/build-story-highlights.json'), 'utf8'));
  const numbers: number[] = JSON.parse(run(['pr', 'list', '--repo', REPO, '--state', 'merged', '--limit', '1000', '--json', 'number'])).map(
    (p: { number: number }) => p.number,
  );
  const fields = 'number,title,url,mergedAt,headRefName,additions,deletions,changedFiles,commits';
  const early: string[] = [];
  const prs = numbers
    .map((n) => JSON.parse(run(['pr', 'view', String(n), '--repo', REPO, '--json', fields])) as GhPr)
    .sort((a, b) => a.mergedAt.localeCompare(b.mergedAt))
    .flatMap((pr) => {
      const h = highlights[String(pr.number)];
      if (!h) return early.push(`#${pr.number}: no entry in build-story-highlights.json`), [];
      return [toEntry(pr, h, REPO)];
    });
  // A red-test commit is only a test: anything outside tests/ means code landed before (or with) it.
  for (const p of prs)
    for (const c of p.commits.filter((x) => x.role === 'red')) {
      const files = git(['show', '--name-only', '--format=', c.sha]).split('\n').filter(Boolean);
      const code = files.filter((f) => !f.startsWith('tests/'));
      if (code.length) early.push(`#${p.number}: red commit ${c.sha.slice(0, 7)} touches ${code.join(', ')}`);
    }

  // The main commit this data covers, as an ancestor of HEAD, so the freshness test can check it here.
  try {
    git(['fetch', '--quiet', 'origin', 'main']);
  } catch {}
  const throughSha = git(['merge-base', 'HEAD', 'origin/main']);

  // A rerun with nothing new keeps the old timestamp, so the committed file only changes with the data.
  const out = resolve(root, 'src/data/build-story.json');
  let prev: Story | null = null;
  try {
    prev = JSON.parse(readFileSync(out, 'utf8'));
  } catch {}
  const carried = carryCiVerdicts(prev, prs);
  const same = prev && prev.throughSha === throughSha && JSON.stringify(prev.prs) === JSON.stringify(carried);
  const story: Story = { repo: REPO, generatedAt: same ? prev!.generatedAt : new Date().toISOString(), throughSha, prs: carried };
  const problems = [...early, ...validate(story)];
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  writeFileSync(out, JSON.stringify(story, null, 2) + '\n');
  const s = computeStats(carried);
  console.log(`✓ src/data/build-story.json: ${s.prs} PRs, ${s.redFirst} red-test-first, ${s.findings} findings, ${s.commits} commits`);
}
