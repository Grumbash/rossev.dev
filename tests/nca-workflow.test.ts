// The NCA simulations are 30–45 s of one core each. In the perf job they shared a 4-vCPU runner
// with the rest of the suite and timed out against each other (nca-regrow-sequence: 64.6 s against
// a 60 s limit, on a PR that only changed copy). So they run in .github/workflows/nca.yml, one
// runner per file, and the perf job skips them. This file checks that the two stay in step: one
// list, every simulation on its own runner, and a path filter that sees everything they read.
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

const NCA = '.github/workflows/nca.yml';
const PERF = '.github/workflows/perf.yml';
const LIST = 'scripts/ci/simulations.json';
const yaml = (p: string): any => (existsSync(p) ? Bun.YAML.parse(readFileSync(p, 'utf8')) : {});
const nca = yaml(NCA);
const perf = yaml(PERF);
const simulations: string[] = existsSync(LIST) ? JSON.parse(readFileSync(LIST, 'utf8')) : [];
const runs = (wf: any) => Object.values(wf.jobs ?? {}).flatMap((j: any) => (j.steps ?? []).map((s: any) => String(s.run ?? '')));

// Every repo file a test reaches: relative imports (followed), and literal readFileSync paths.
function reach(file: string, seen = new Set<string>()): Set<string> {
  if (seen.has(file) || !existsSync(file)) return seen;
  seen.add(file);
  if (!/\.ts$/.test(file)) return seen;
  const src = readFileSync(file, 'utf8');
  for (const [, spec] of src.matchAll(/^import (?!type )[^;]*?from '(\.[^']+)'/gm)) {
    const base = normalize(join(dirname(file), spec));
    const hit = [base, `${base}.ts`, join(base, 'index.ts')].find((p) => existsSync(p) && !p.endsWith('/'));
    if (hit) reach(hit, seen);
  }
  for (const [, p] of src.matchAll(/readFileSync\('([^']+)'/g)) seen.add(p);
  return seen;
}

describe('one list of simulations', () => {
  test('names real test files, each once', () => {
    expect(simulations.length).toBeGreaterThan(0);
    expect(new Set(simulations).size).toBe(simulations.length);
    for (const f of simulations) expect(existsSync(f), f).toBe(true);
  });

  test('none of them needs the built site: nca.yml does not build it', () => {
    for (const f of simulations) expect([...reach(f)].filter((p) => p.startsWith('dist')), f).toEqual([]);
  });
});

describe(PERF, () => {
  test('runs the suite without the simulations', () => {
    expect(runs(perf)).toContain('bun run test --skip-simulations');
  });
});

describe(NCA, () => {
  test('gives every simulation in the list a runner of its own, and lets each finish', () => {
    expect(runs(nca).join('\n')).toContain(`jq -c . ${LIST}`);
    const sim = nca.jobs?.simulate;
    expect(sim?.needs).toBe('list');
    expect(sim?.strategy?.matrix?.file).toBe('${{ fromJSON(needs.list.outputs.files) }}');
    expect(sim?.strategy?.['fail-fast']).toBe(false);
  });

  test('passes the file name as data, not as script', () => {
    const step = nca.jobs.simulate.steps.find((s: any) => /bun test/.test(s.run ?? ''));
    expect(step.run).toBe('bun test "$FILE"');
    expect(step.env.FILE).toBe('${{ matrix.file }}');
  });

  test('only reads the repo, and also runs nightly and by hand', () => {
    expect(nca.permissions).toEqual({ contents: 'read' });
    expect(nca.on?.schedule?.length).toBe(1);
    expect(nca.on).toHaveProperty('workflow_dispatch');
  });

  test('its path filter sees every file a simulation reaches', () => {
    const globs: string[] = (nca.on?.pull_request?.paths ?? []).map((p: string) => new Bun.Glob(p));
    expect(globs.length).toBeGreaterThan(0);
    for (const f of simulations) {
      for (const p of reach(f)) expect(globs.some((g: any) => g.match(p)), `${f} reaches ${p}`).toBe(true);
    }
  });
});
