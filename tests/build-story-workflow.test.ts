// /how-its-built/ follows main by itself: every push to main regenerates the build story and, when
// the data changed, opens or updates ONE bot PR. The bot never pushes to main (Gleb merges), never
// overwrites a human's commit on its branch, and merging its PR does not make another one: PRs that
// only touch build-story data are left out of the story and an unchanged story leaves the file
// byte for byte (both pinned in build-story.test.ts). This file checks the workflow itself.
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';

const PATH = '.github/workflows/build-story.yml';
const src = existsSync(PATH) ? readFileSync(PATH, 'utf8') : '';
const wf: any = src ? Bun.YAML.parse(src) : {};
const steps: any[] = Object.values(wf.jobs ?? {}).flatMap((j: any) => j.steps ?? []);
const scripts = steps.map((s) => String(s.run ?? '')).join('\n');
const BRANCH = 'bot/build-story';

describe(PATH, () => {
  test('runs on every push to main and by hand, one run at a time', () => {
    expect(src.length).toBeGreaterThan(0);
    expect(wf.on?.push?.branches).toEqual(['main']);
    expect(wf.on).toHaveProperty('workflow_dispatch');
    expect(wf.concurrency?.group).toBeTruthy();
    expect(wf.concurrency?.['cancel-in-progress']).toBe(false);
  });

  test('may write contents and pull requests, nothing else', () => {
    expect(wf.permissions).toEqual({ contents: 'write', 'pull-requests': 'write' });
  });

  test('checks out main with full history: throughSha and the red-commit check need it', () => {
    const co = steps.find((s) => String(s.uses ?? '').startsWith('actions/checkout@'));
    expect(co?.with?.ref).toBe('main');
    expect(co?.with?.['fetch-depth']).toBe(0);
    expect(co?.with?.['persist-credentials']).toBe(false);
  });

  test('regenerates with gh, then tests and builds before proposing anything', () => {
    const gen = steps.findIndex((s) => /bun run build-story\b/.test(String(s.run ?? '')));
    expect(gen).toBeGreaterThanOrEqual(0);
    expect(String(steps[gen].env?.GH_TOKEN ?? '')).toMatch(/secrets\.(PUBLORA_SYNC_TOKEN|GITHUB_TOKEN)/);
    const after = steps.slice(gen + 1).map((s) => String(s.run ?? ''));
    expect(after.some((r) => /\bbun test\b/.test(r))).toBe(true);
    expect(after.some((r) => /\bbun run build\b/.test(r))).toBe(true);
  });

  test('proposes only when the data file changed', () => {
    expect(scripts).toMatch(/git diff --quiet[^\n]*src\/data\/build-story\.json/);
  });

  // A PR opened with GITHUB_TOKEN triggers no workflows, so perf.yml would never gate it.
  test('opens the PR with the fine-grained PAT, falling back to GITHUB_TOKEN', () => {
    const pr = steps.find((s) => /gh pr (create|edit)/.test(String(s.run ?? '')));
    expect(pr).toBeDefined();
    expect(String(pr.env?.GH_TOKEN ?? '')).toMatch(/secrets\.PUBLORA_SYNC_TOKEN\s*\|\|\s*secrets\.GITHUB_TOKEN/);
    expect(String(pr.env?.BRANCH ?? '')).toBe(BRANCH);
    expect(pr.run).toMatch(/gh pr create[^\n]*--base main[^\n]*--head "\$BRANCH"/);
    expect(pr.run).toMatch(/gh pr list[^\n]*--head "\$BRANCH"/);
  });

  test('never pushes to main: only to its own branch, with a lease', () => {
    const pushes = scripts.split('\n').filter((l) => /\bgit(_auth)?\b.*\bpush\b/.test(l));
    expect(pushes.length).toBeGreaterThan(0);
    for (const l of pushes) {
      expect(l).toMatch(/--force-with-lease=/);
      expect(l).toMatch(/refs\/heads\/\$BRANCH/);
      expect(l).not.toMatch(/\bmain\b/);
    }
    expect(scripts).not.toMatch(/HEAD:(refs\/heads\/)?main\b/);
  });

  test('leaves the branch alone when someone other than the bot committed to it', () => {
    expect(scripts).toMatch(/git log --format=%ae HEAD\.\.FETCH_HEAD/);
    expect(scripts).toMatch(/exit 0/);
  });
});
