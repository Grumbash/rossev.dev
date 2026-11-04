// The hero topology replays a real agent run on this site: PR #11, the GR monogram.
// Everything it shows must be checkable: times are the commits' own, diff lines were really added,
// test names really exist, the catch is the judge's real finding. The G→R mis-heal never reached git
// (the first committed weights were already trained on strokes); the round-1 weights it came from were
// recovered from the agent run's working files and are kept here, and the recorded frames must re-run
// from them exactly.
import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { NeuralCA } from '../src/scripts/nca/model';
import { decodeWeights } from '../src/scripts/nca/weights';
import type { Replay, ReplayEvent } from '../scripts/build-story';
import { PALETTE, cut, decodeFrame, encodeFrame, mulberry32, quantize } from '../src/scripts/replay/frames';

setDefaultTimeout(120_000);

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 << 20 });
const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const weightsFrom = (p: string) => {
  const bin = readFileSync(p);
  return decodeWeights(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
};

// A test name is in the source literally, or matches a template title like `regrows after a bite out of the ${name}`
// whose ${...} part is one of the string literals in that file.
function nameIn(src: string, name: string): boolean {
  if (src.includes(name)) return true;
  const literals = new Set([...src.matchAll(/'([^'\n]+)'/g)].map((m) => m[1]));
  for (const m of src.matchAll(/test\(`([^`]*)\$\{\w+\}([^`]*)`/g)) {
    if (name.startsWith(m[1]) && name.endsWith(m[2]) && literals.has(name.slice(m[1].length, name.length - m[2].length))) return true;
  }
  return false;
}

const REPLAY = 'src/data/replay-pr11.json';
const FRAMES = 'public/replay/pr11-gr.json';
const ROUND1 = 'scripts/nca/gr-round1.bin';

let story: any;
let pr11: any;
let replay: Replay;

beforeAll(() => {
  story = readJson('src/data/build-story.json');
  pr11 = story.prs.find((p: any) => p.number === 11);
  replay = existsSync(REPLAY) ? readJson(REPLAY) : ({ events: [] } as unknown as Replay);
});

describe('frame codec', () => {
  test('quantizes premultiplied RGBA to the three monogram colours', () => {
    const px = new Float32Array([0, 0, 0, 0, 0.04, 0.04, 0.04, 1, 0.78, 1, 0, 1, 0.02, 0.02, 0.02, 0.1]);
    expect([...quantize(px)]).toEqual([0, 1, 2, 0]);
    expect(PALETTE.length).toBe(3);
  });

  test('a frame survives encode → decode', () => {
    const idx = new Uint8Array(56 * 56).map((_, i) => i % 3);
    expect([...decodeFrame(encodeFrame(idx), 56)]).toEqual([...idx]);
  });

  test('mulberry32 is the stream tests/nca.test.ts uses', () => {
    const r = mulberry32(1);
    expect(r()).toBeCloseTo(0.6270739405881613, 12);
  });
});

describe('replay data (src/data/replay-pr11.json)', () => {
  test('is labelled as a replay of PR #11 in EN and RU', () => {
    expect(replay.pr).toBe(11);
    expect(replay.url).toBe(pr11.url);
    expect(replay.label.en).toContain('Replay');
    expect(replay.label.en).toContain('PR #11');
    expect(replay.label.ru).toContain('PR #11');
  });

  test('tells plan → diff → test → catch → fix → merge, in time order', () => {
    const kinds = replay.events.map((e) => e.kind);
    const first = (k: ReplayEvent['kind']) => kinds.indexOf(k);
    const order = (['plan', 'diff', 'test', 'catch', 'fix', 'merge'] as const).map(first);
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(kinds.at(-1)).toBe('merge');
    const times = replay.events.map((e) => Date.parse(e.t));
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
  });

  test('every caption is short and bilingual, every node is a topology node', () => {
    expect(replay.events.length).toBeGreaterThanOrEqual(6);
    for (const e of replay.events) {
      expect(e.caption.en.length).toBeGreaterThan(5);
      expect(e.caption.en.length).toBeLessThanOrEqual(90);
      expect(e.caption.ru.length).toBeGreaterThan(5);
      expect(Number.isInteger(e.node) && e.node >= 0 && e.node < 8).toBe(true);
    }
  });

  test('times are when each commit was authored (committer dates were rewritten by a later rebase), and the merge is the PR’s merge', () => {
    const shas = new Set(pr11.commits.map((c: any) => c.sha));
    for (const e of replay.events.filter((e) => e.kind !== 'merge')) {
      expect(shas.has(e.sha)).toBe(true);
      expect(Date.parse(e.t)).toBe(Date.parse(git('show', '-s', '--format=%aI', e.sha!).trim()));
    }
    const merge = replay.events.at(-1)!;
    expect(Date.parse(merge.t)).toBe(Date.parse(pr11.mergedAt));
  });

  test('the plan is the red tests that were committed first', () => {
    const plan = replay.events.filter((e) => e.kind === 'plan');
    expect(plan.length).toBeGreaterThan(0);
    const reds = pr11.commits.filter((c: any) => c.role === 'red');
    for (const e of plan) expect(reds.map((c: any) => c.sha)).toContain(e.sha);
  });

  test('diff lines were really added in their commit', () => {
    const diffs = replay.events.filter((e) => e.kind === 'diff');
    expect(diffs.reduce((n, e) => n + (e.lines?.length ?? 0), 0)).toBeGreaterThanOrEqual(4);
    for (const e of diffs) {
      const added = new Set(git('show', '--format=', e.sha!).split('\n').filter((l) => l.startsWith('+')).map((l) => l.slice(1).trim()));
      for (const l of e.lines!) expect(added.has(l.trim())).toBe(true);
    }
  });

  // Honest order: the sandbox ran the implementation (its commit gives the time) against the tests that
  // existed then (bites only, from the first red test: `testsAt`); they passed and missed the cut.
  // The vertical-cut test only exists because the judge caught G→R, so it belongs to the fix.
  test('test names exist in tests/nca.test.ts at their commit', () => {
    const named = replay.events.filter((e) => (e.kind === 'test' || e.kind === 'fix') && e.lines?.length);
    for (const e of named) {
      const src = git('show', `${e.testsAt ?? e.sha}:tests/nca.test.ts`);
      for (const name of e.lines!) expect(nameIn(src, name)).toBe(true);
    }
    const tests = replay.events.filter((e) => e.kind === 'test');
    expect(tests.reduce((n, e) => n + (e.lines?.length ?? 0), 0)).toBeGreaterThanOrEqual(3);
    for (const e of tests) expect(e.testsAt).toBe('6151777add1a736c719b97cef9adf95b434208ff');
    expect(tests.flatMap((e) => e.lines!).some((n) => /cut/.test(n))).toBe(false);
    expect(tests.flatMap((e) => e.lines!).some((n) => /bite/.test(n))).toBe(true);
    const fix = replay.events.find((e) => e.kind === 'fix' && e.sha === '662bf5800a68368eae63308271d2947c92cd2d94');
    expect(fix?.lines ?? []).toContain('a vertical cut between the letters');
  });

  test('the catch is the judge’s real G→R finding, marked as reproduced, at the Judge node', () => {
    const c = replay.events.find((e) => e.kind === 'catch')!;
    const finding = pr11.findings.find((f: any) => /G grow back as an R/.test(f.en));
    expect(finding).toBeDefined();
    expect(c.reproduced).toBe(true);
    expect(c.node).toBe(3); // 04 · REVIEWER & JUDGE
    expect(c.caption.en.length).toBeGreaterThan(5);
  });

  test('the fix is the strokes red test and its implementation', () => {
    const fixes = replay.events.filter((e) => e.kind === 'fix').map((e) => e.sha);
    expect(fixes).toContain('662bf5800a68368eae63308271d2947c92cd2d94');
  });

  test('build-story regenerates exactly this file from build-story.json and git', () => {
    const out = execFileSync('bun', ['scripts/build-story.ts', '--replay', '11', '--stdout'], { encoding: 'utf8' });
    expect(JSON.parse(out)).toEqual(replay);
  });
});

describe('reproduced G→R frames (public/replay/pr11-gr.json)', () => {
  let rec: any;
  beforeAll(() => {
    rec = existsSync(FRAMES) ? readJson(FRAMES) : { frames: [] };
  });

  test('says where it came from: PR #11 round-1 weights, committed, not the shipped ones', () => {
    expect(existsSync(ROUND1)).toBe(true);
    expect(rec.weights).toBe(ROUND1);
    expect(rec.source.en).toMatch(/PR #11/);
    expect(rec.source.en).toMatch(/round 1/i);
    expect(rec.source.en).toMatch(/not in git/i);
    expect(rec.source.ru).toMatch(/PR #11/);
    expect(readFileSync(ROUND1).equals(readFileSync('public/nca/gr.bin'))).toBe(false);
  });

  // The sandbox's "all green" is a claim too: run the 6151777 assertions (bites-era tests) on round 1.
  test('the round-1 weights pass the tests that existed then (why the sandbox was green)', () => {
    const target = readJson('scripts/nca/target.json');
    const w = weightsFrom(ROUND1);
    const mseOf = (ca: NeuralCA) => {
      const out = ca.rgba();
      let sum = 0;
      for (let i = 0; i < out.length; i++) sum += (out[i] - target.rgba[i]) ** 2;
      return sum / out.length;
    };
    const grown = (seed: number) => {
      const ca = new NeuralCA(w, mulberry32(seed));
      ca.seed();
      ca.step(300);
      return ca;
    };
    expect(mseOf(grown(1))).toBeLessThan(0.01);
    for (const [fx, fy] of [[0.5, 0.5], [0.3, 0.5], [0.65, 0.7]]) {
      const ca = grown(2);
      ca.damage(fx * ca.size, fy * ca.size, 0.2 * ca.size);
      expect(mseOf(ca)).toBeGreaterThan(0.01);
      ca.step(300);
      expect(mseOf(ca)).toBeLessThan(0.01);
    }
    const stable = grown(3);
    stable.step(1000);
    expect(mseOf(stable)).toBeLessThan(0.015);
  });

  test('says the weights are a float16 copy of a source JSON, with its sha256', () => {
    expect(rec.source.en).toMatch(/float16/);
    expect(rec.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  test('the round-1 weights grow GR fine: the bug only shows after a cut', () => {
    const target = readJson('scripts/nca/target.json');
    const ca = new NeuralCA(weightsFrom(ROUND1), mulberry32(rec.rngSeed));
    ca.seed();
    ca.step(rec.grow);
    const out = ca.rgba();
    let sum = 0;
    for (let i = 0; i < out.length; i++) sum += (out[i] - target.rgba[i]) ** 2;
    expect(sum / out.length).toBeLessThan(0.01);
  });

  test('is small: 12–16 frames, at most 4 KB gzip', () => {
    expect(rec.frames.length).toBeGreaterThanOrEqual(12);
    expect(rec.frames.length).toBeLessThanOrEqual(16);
    expect(gzipSync(readFileSync(FRAMES), { level: 9 }).length).toBeLessThanOrEqual(4000);
  });

  test('re-runs exactly from the committed weights: grow, vertical cut, regrow', () => {
    const ca = new NeuralCA(weightsFrom(ROUND1), mulberry32(rec.rngSeed));
    ca.seed();
    ca.step(rec.grow);
    let at = 0;
    rec.frames.forEach((f: { step: number; data: string }, i: number) => {
      if (i === 1) for (const [x0, y0, x1, y1] of rec.cut) cut(ca, x0, y0, x1, y1);
      if (f.step > at) ca.step(f.step - at);
      at = Math.max(at, f.step);
      expect(encodeFrame(quantize(ca.rgba()))).toBe(f.data);
    });
    expect(rec.cut).toEqual([[0.5, 0, 0.5, 1]]);
    expect(rec.frames.at(-1).step).toBeGreaterThanOrEqual(1000);
  });

  test('shows the bug: the G grows back with lime in it, where the target has none', () => {
    const target = readJson('scripts/nca/target.json');
    const n = target.size;
    const limeLeft = (idx: Uint8Array) => {
      let k = 0;
      for (let y = 0; y < n; y++) for (let x = 0; x < n * 0.45; x++) if (idx[y * n + x] === 2) k++;
      return k;
    };
    const t = quantize(new Float32Array(target.rgba));
    expect(limeLeft(t)).toBeLessThan(5);
    expect(limeLeft(decodeFrame(rec.frames[0].data, n))).toBeLessThan(5); // grown fine before the cut
    expect(limeLeft(decodeFrame(rec.frames.at(-1).data, n))).toBeGreaterThanOrEqual(40);
  });

  test('the shipped weights heal the same cut on the same seed (the fix)', () => {
    const ca = new NeuralCA(weightsFrom('public/nca/gr.bin'), mulberry32(rec.rngSeed));
    ca.seed();
    ca.step(rec.grow);
    for (const [x0, y0, x1, y1] of rec.cut) cut(ca, x0, y0, x1, y1);
    ca.step(rec.frames.at(-1).step);
    const target = readJson('scripts/nca/target.json');
    const out = ca.rgba();
    let sum = 0;
    for (let i = 0; i < out.length; i++) sum += (out[i] - target.rgba[i]) ** 2;
    expect(sum / out.length).toBeLessThan(0.01);
  });
});
