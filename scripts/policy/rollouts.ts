// Rollouts of the toy service (src/scripts/policy/service.ts) for imitation learning + DAgger (issue #10),
// and the baseline table.
//
// Usage:
//   bun scripts/policy/rollouts.ts table
//       Recovery rate / mean return / mean ticks to recover for noop, the runbook (rules.ts) and the
//       teacher (expert.ts) on the evaluation seeds 1000–1099, judge on, plus bad_deploy judge off.
//   bun scripts/policy/rollouts.ts score --policy <weights.bin> [--seeds 1000-1099]
//       One JSON object on stdout: per scenario (visitor faults judge on, bad_deploy judge off,
//       overload) the Score of the policy and of the runbook. scripts/policy/train.py uses it to pick
//       and gate checkpoints.
//   bun scripts/policy/rollouts.ts export --out <file.jsonl> [--seeds 0-299] [--policy <weights.bin>] [--beta 0.5] [--round 1]
//       Without --policy: the teacher drives (behaviour cloning data).
//       With --policy (DAgger): the learned policy drives (with probability --beta the teacher does,
//       seeded by seed and round), and every visited state is labelled with what the teacher would do.
//
// Output: JSON Lines, one per visited state (EPISODE ticks per episode):
//   {"obs":[OBS_SIZE floats],"action":<teacher's action index>,"took":<action actually taken>,
//    "scenario":"surge","judge":true,"seed":12,"tick":3}
//   obs is observe(state) before the step (rounded to 1e-5), action indexes ACTIONS in service.ts.
//   "onset":true marks the tick-0 state of a faulted episode: at inject time the observation is the same
//   for latency, node_down, surge and none (symptoms have not shown yet), so the teacher's label there is
//   not imitable from obs; training should down-weight (or drop) these rows.
// Episodes: every seed × scenario (each FAULT, 'overload', and 'none': a healthy service the policy
// must learn to leave alone) × judge on/off. Keep training seeds away from 1000–1099 (evaluation).
import { createWriteStream, readFileSync } from 'node:fs';
import { episode, evaluate, type Controller } from '../../src/scripts/policy/eval';
import { expert } from '../../src/scripts/policy/expert';
import { handRules } from '../../src/scripts/policy/rules';
import { ACTIONS, FAULTS, OBS_SIZE, type Scenario } from '../../src/scripts/policy/service';
import { mulberry32 } from '../../src/scripts/replay/frames';

const EVAL_SEEDS = Array.from({ length: 100 }, (_, i) => 1000 + i);
const noop: Controller = { name: 'noop', decide: () => ACTIONS.indexOf('noop') };
const rules: Controller = { name: 'rules', decide: (_s, obs) => handRules(obs) };
const teacher: Controller = { name: 'expert', decide: (s) => expert(s) };

const args = process.argv.slice(2);
const flag = (name: string, fallback?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const range = (spec: string) => {
  const [a, b] = spec.split('-').map(Number);
  return Array.from({ length: (b ?? a) - a + 1 }, (_, i) => a + i);
};

function table() {
  const rows: [Scenario, boolean][] = [...[...FAULTS, 'overload' as const].map((f) => [f, true] as [Scenario, boolean]), ['bad_deploy', false]];
  console.log('scenario      judge  controller  recovery  return  ticks  outcomes (final)');
  for (const [sc, judge] of rows) {
    for (const c of [noop, rules, teacher]) {
      const r = evaluate(c, sc, EVAL_SEEDS, { judge });
      const outs = Object.entries(r.outcomes)
        .filter(([, n]) => n)
        .map(([k, n]) => `${k} ${n}`)
        .join(', ');
      console.log(
        `${sc.padEnd(13)} ${(judge ? 'on' : 'off').padEnd(6)} ${c.name.padEnd(11)} ${(r.recoveryRate * 100).toFixed(0).padStart(7)}%  ${r.meanReturn.toFixed(1).padStart(6)}  ${r.meanTicksToRecover.toFixed(1).padStart(5)}  ${outs}`,
      );
    }
  }
}

async function loadPolicy(path: string) {
  const { act, decodePolicy } = await import('../../src/scripts/policy/net');
  const b = readFileSync(path);
  const policy = decodePolicy(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  if (policy.inputs !== OBS_SIZE) throw new Error(`policy expects ${policy.inputs} inputs, OBS_SIZE is ${OBS_SIZE}`);
  return { policy, act };
}

async function score() {
  const weights = flag('policy');
  if (!weights) throw new Error('--policy <weights.bin> is required');
  const seeds = range(flag('seeds', '1000-1099')!);
  const { policy, act } = await loadPolicy(weights);
  const learned: Controller = { name: 'policy', decide: (_s, obs) => act(policy, obs).action };
  const rows: [string, Scenario, boolean][] = [
    ['latency', 'latency', true],
    ['node_down', 'node_down', true],
    ['surge', 'surge', true],
    ['bad_deploy', 'bad_deploy', true],
    ['bad_deploy_off', 'bad_deploy', false],
    ['overload', 'overload', true],
  ];
  const out: Record<string, unknown> = {};
  for (const [key, sc, judge] of rows) out[key] = { policy: evaluate(learned, sc, seeds, { judge }), rules: evaluate(rules, sc, seeds, { judge }), noop: evaluate(noop, sc, seeds, { judge }), expert: evaluate(teacher, sc, seeds, { judge }) };
  console.log(JSON.stringify(out));
}

async function exportRollouts() {
  const out = flag('out');
  if (!out) throw new Error('--out <file.jsonl> is required');
  const seeds = range(flag('seeds', '0-299')!);
  if (seeds.some((s) => EVAL_SEEDS.includes(s))) console.warn('warning: training seeds overlap the evaluation seeds 1000–1099');
  const weights = flag('policy');
  const beta = Number(flag('beta', '0'));
  const round = Number(flag('round', '1'));
  let driver: (seed: number) => Controller = () => teacher;
  if (weights) {
    const { policy, act } = await loadPolicy(weights);
    driver = (seed) => {
      const coin = mulberry32(seed * 7919 + round * 104729);
      return { name: 'dagger', decide: (s, obs) => (coin() < beta ? expert(s) : act(policy, obs).action) };
    };
  }
  const file = createWriteStream(out);
  const scenarios: (Scenario | null)[] = [...FAULTS, 'overload', null];
  let n = 0;
  for (const seed of seeds)
    for (const sc of scenarios)
      for (const judge of [true, false])
        episode(driver(seed), sc, seed, { judge }, (s, obs, took) => {
          const line = { obs: Array.from(obs, (v) => Math.round(v * 1e5) / 1e5), action: expert(s), took, scenario: sc ?? 'none', judge, seed, tick: s.tick, onset: sc !== null && s.tick === s.faultTick };
          file.write(JSON.stringify(line) + '\n');
          n++;
        });
  await new Promise<void>((resolve) => file.end(resolve));
  console.log(`${n} states → ${out}${weights ? ` (DAgger round ${round}, beta ${beta})` : ' (teacher rollouts)'}`);
}

if (args[0] === 'table') table();
else if (args[0] === 'export') await exportRollouts();
else if (args[0] === 'score') await score();
else console.log('usage: bun scripts/policy/rollouts.ts table | export --out <file.jsonl> [--seeds 0-299] [--policy <weights.bin> --beta 0.5 --round 1]');
