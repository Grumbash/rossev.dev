// The on-call runbook (issue #10): what a competent SRE would write for this service from the
// dashboard alone, before any training. It reads only the observation (observe() in ./service.ts:
// noisy readings now and one tick ago, the pipeline, the judge switch, the last action), never the
// hidden fault. Frozen after the first training run (tests/policy.test.ts checks git history).
//
// In order, first match wins:
//  1. The judge flags the change it is reviewing (risk > 0.5)                → block_merge
//  2. Errors ≥ 1% within 6 ticks of a merge, no node failing its probes,
//     and we did not just roll back                                          → rollback
//  3. Exactly one node in the pool failing its health probe on two readings
//     in a row while the others pass, users see errors (≥ 1%), ≥ 3 in pool  → isolate
//  4. Queue building (> 0.5 and growing, or > 1.5), below max replicas        → scale
//  5. Still down (errors > 20% or p95 > 1 s) at max replicas, nobody paged    → page_human
//  6. p95 ≥ 300 ms without a queue behind it (< 0.3): a slow dependency        → retry
//  7. Errors ≥ 1% that nothing above explains (transient, reconnect)          → retry
//  8. Otherwise                                                               → noop
import { ACTIONS, MAX_REPLICAS, type Action } from './service';

const A = (a: Action) => ACTIONS.indexOf(a);

export function handRules(obs: Float32Array): number {
  const queue = obs[0] * 6;
  const errors = obs[1] * 0.25;
  const p95 = obs[2] * 1200;
  const health = Array.from(obs.slice(3, 7));
  const replicas = Math.round(obs[7] * MAX_REPLICAS);
  const pool = Math.round(obs[8] * 4);
  const stage = Math.round(obs[9] * 3);
  const sinceMerge = obs[10] * 12;
  const risk = obs[12];
  const prevQueue = obs[13] * 6;
  const prevHealth = Array.from(obs.slice(16, 20));
  const judge = obs[21] > 0.5;
  const last = ACTIONS[Math.round(obs[22] * (ACTIONS.length - 1))];
  const paged = obs[23] > 0.5;

  const failing = health.map((h, i) => h < 0.5 && prevHealth[i] < 0.5);
  const failingNow = health.some((h) => h < 0.5);
  const oneNodeDown = failing.filter(Boolean).length === 1 && health.filter((h) => h < 0.5).length === 1;

  if (judge && stage === 3 && risk > 0.5) return A('block_merge');
  if (errors >= 0.01 && sinceMerge <= 6 && !failingNow && last !== 'rollback') return A('rollback');
  if (oneNodeDown && pool >= 3 && errors >= 0.01) return A('isolate');
  if (replicas < MAX_REPLICAS && ((queue > 0.5 && queue > prevQueue) || queue > 1.5)) return A('scale');
  if (!paged && replicas >= MAX_REPLICAS && (errors > 0.2 || p95 > 1000)) return A('page_human');
  if (p95 >= 300 && queue < 0.3) return A('retry');
  if (errors >= 0.01) return A('retry');
  return A('noop');
}
