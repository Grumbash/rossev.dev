// The teacher for imitation learning (issue #10). Privileged: it reads the hidden state, the fault
// the visitor injected and the true load and node health, which the learned policy never sees (it
// gets only observe()). That is the point: the policy has to learn to infer the cause from symptoms.
//  1. a bad change under the judge's review → block_merge (caught before merge)
//  2. a bad build in prod (shipped with the judge off) → rollback
//  3. a slow dependency → retry (reconnect) until it clears
//  4. a sick node in the pool → isolate it, once it is the one the alerts point at
//  5. fewer replicas than the load the fault is heading to needs (on the pool it will have) → scale
//  6. otherwise noop. It never pages a human (slow and costly) and does not block good changes.
// An overload is beyond max capacity: it scales to the max and isolates, and fails anyway.
import { ACTIONS, BASE_REPLICAS, MAX_REPLICAS, isolateTarget, type Action, type ServiceState } from './service';

const A = (a: Action) => ACTIONS.indexOf(a);
/** Load each fault is heading to (the teacher knows where a surge ends). */
const PEAK: Partial<Record<string, number>> = { surge: 1.9, overload: 3.4 };

export function expert(s: ServiceState): number {
  if (s.change?.bad && s.change.stage === 3 && s.judge) return A('block_merge');
  if (s.prod?.bad) return A('rollback');
  if (s.latencyOn) return A('retry');
  const sick = s.nodes.findIndex((n) => !n.isolated && n.health < 1);
  if (sick >= 0 && isolateTarget(s) === sick) return A('isolate');
  const losesNode = s.fault === 'node_down' || s.fault === 'overload';
  const pool = losesNode ? 3 : s.nodes.filter((n) => !n.isolated && n.health === 1).length;
  const load = Math.max(s.load, PEAK[s.fault ?? ''] ?? 0);
  const need = Math.max(BASE_REPLICAS, Math.min(MAX_REPLICAS, Math.ceil((load * 1.15) / (0.45 * (pool / 4)))));
  if (s.replicas < need) return A('scale');
  return A('noop');
}
