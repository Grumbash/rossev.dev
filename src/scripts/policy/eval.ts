// Runs a controller over seeds and scores it: one episode per seed, the scenario injected at tick 0,
// EPISODE ticks long (src/scripts/policy/service.ts). Recovery rate counts episodes that ended
// 'recovered' or 'caught'; ticks to recover are averaged over those (EPISODE when there are none).
import { EPISODE, createService, inject, observe, outcome, step, type Scenario, type ServiceOutcome, type ServiceState } from './service';

export interface Controller {
  name: string;
  decide: (s: ServiceState, obs: Float32Array) => number;
}
export interface Score {
  recoveryRate: number;
  meanReturn: number;
  meanTicksToRecover: number;
  /** Final outcome of each episode. */
  outcomes: Record<ServiceOutcome, number>;
  /** First outcome of each episode (a bad deploy that ships and is rolled back counts as 'shipped' here). */
  firstOutcome: Record<ServiceOutcome, number>;
}

const zero = (): Record<ServiceOutcome, number> => ({ caught: 0, recovered: 0, shipped: 0, failed: 0 });

/** One episode; `onStep` sees every (state, observation, action) visited, for the rollout exporter. */
export function episode(c: Controller, sc: Scenario | null, seed: number, o: { judge: boolean }, onStep?: (s: ServiceState, obs: Float32Array, action: number) => void) {
  let s = createService(seed, o);
  if (sc) s = inject(s, sc);
  let ret = 0;
  for (let t = 0; t < EPISODE; t++) {
    const obs = observe(s);
    const a = c.decide(s, obs);
    onStep?.(s, obs, a);
    const r = step(s, a);
    ret += r.reward;
    s = r.state;
  }
  return { state: s, ret, final: outcome(s), first: s.first };
}

export function evaluate(c: Controller, sc: Scenario, seeds: number[], o: { judge: boolean }): Score {
  const outcomes = zero();
  const firstOutcome = zero();
  let ret = 0;
  let ticks = 0;
  let ok = 0;
  for (const seed of seeds) {
    const e = episode(c, sc, seed, o);
    ret += e.ret;
    if (e.final) outcomes[e.final]++;
    if (e.first) firstOutcome[e.first]++;
    if (e.final === 'recovered' || e.final === 'caught') {
      ok++;
      ticks += e.state.resolvedAt;
    }
  }
  return {
    recoveryRate: ok / seeds.length,
    meanReturn: ret / seeds.length,
    meanTicksToRecover: ok ? ticks / ok : EPISODE,
    outcomes,
    firstOutcome,
  };
}
