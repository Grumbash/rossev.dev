// Toy service for the self-healing policy (issue #10). Pure, immutable, no DOM, seeded: the same seed
// and the same actions give the same trajectory, in the browser, in tests and in the rollout exporter.
//
// What it models: a service on 4 nodes (named after the hero topology: builder, sandbox, judge, prod)
// with `replicas` workers spread over the nodes still in the pool, a request queue, and a deploy
// pipeline (builder → sandbox → judge → merge to prod), the same pipeline as the take-over of #23
// (src/scripts/replay/sim.ts): a 'broken_test' is #23's 'test' fault (the sandbox always stops it),
// a 'bad_deploy' is #23's 'logic' fault (tests pass; only a block_merge while the judge reviews it
// stops it, with the judge off it reaches prod).
//
// Per tick: arrivals = load × (share not sent to a dead node); capacity = replicas × 0.45 × (healthy
// nodes in the pool / 4) × (0.7 while a dependency is slow); queue += arrivals − capacity;
// p95 = 90 ms × slowdown × (1 + 0.6·util⁶) + 350 ms × queue/capacity (+150 ms for a hanging node);
// errors = traffic to a dead node (60% of its share fails) + 7% from a bad build in prod + timeouts.
// SLO: errors < 1% and p95 < 300 ms. Baseline: load 1.0, 3 replicas (capacity 1.35), max 6.
//
// Faults ramp in over ONSET ticks, so their symptoms overlap at first, and readings are noisy:
//  latency     a dependency slows down (×4.5 p95, ×0.7 capacity, 1.5% timeouts). Scaling only hides the queue;
//              `retry` (reconnect) clears it with p = 0.8. Never clears by itself.
//  node_down   one node first hangs (p95 up, a few errors), then dies (≈15% errors). Stays dead
//              until isolated (drained from the pool, rebuilt 6 ticks later); the pool is then one
//              node short, so the queue creeps until someone scales.
//  surge       load ramps 1.0 → 1.9 and stays: needs ≥ 5 replicas.
//  bad_deploy  a change that passes the tests enters the pipeline; merged, it adds 7% errors until
//              rolled back.
//  broken_test a change that breaks a test: the sandbox stops it ('caught'), whoever is in charge.
//  overload    surge to 3.4 plus a dead node: above max capacity (2.7) by construction, nothing
//              saves it, the teacher included.
// Health probes time out on healthy nodes when p95 is high, so a slow dependency or a surge can look
// like a sick node; a recent, harmless deploy (40% of episodes) makes any fault look like a bad one.
// The observation (observe) carries only these noisy dashboard readings, never the hidden fault.
//
// Reward per tick: +1 within SLO, −1 outside it; −10 when a bad deploy reaches prod; action costs:
// scale −0.2, page_human −2, rollback −0.3, isolate −0.2, retry −0.1, block_merge −0.1 (−1 more when
// it blocks a good change). Wrong moves also hurt through the physics: a rollback is a rolling restart
// (capacity ×0.75 for 2 ticks), a retry with no slow dependency re-sends the queue (retry storm),
// isolating a healthy node shrinks the pool for 4 ticks.
// Outcomes: 'caught' (a bad or broken change stopped before merge), 'shipped' (a bad deploy merged),
// 'recovered' (after ONSET, within SLO for STABLE ticks in a row; for a shipped deploy, after it is
// gone), 'failed' (the error budget of BUDGET out-of-SLO ticks burned, or EPISODE ticks without recovery). The first
// outcome is kept; 'shipped' can later turn into 'recovered' (rolled back), and stays 'shipped' at the
// cap otherwise.
import { mulberry32 } from '../replay/frames';

export const ACTIONS = ['noop', 'retry', 'rollback', 'isolate', 'scale', 'block_merge', 'page_human'] as const;
export const FAULTS = ['latency', 'node_down', 'bad_deploy', 'broken_test', 'surge'] as const;
export type Action = (typeof ACTIONS)[number];
export type Fault = (typeof FAULTS)[number];
export type Scenario = Fault | 'overload';
export type ServiceOutcome = 'caught' | 'recovered' | 'shipped' | 'failed';
export const NODES = ['builder', 'sandbox', 'judge', 'prod'] as const;

/** Ticks for a fault to reach full strength; recovery counts only from here. */
export const ONSET = 3;
/** Consecutive in-SLO ticks that count as recovered. */
export const STABLE = 3;
/** Error budget: ticks out of SLO after the fault (for a bad deploy, after it ships) before it counts as failed. */
export const BUDGET = 12;
/** Ticks after the fault before an unrecovered episode is a failure. */
export const EPISODE = 40;
export const SLO = { errors: 0.01, p95: 300 } as const;
export const MAX_REPLICAS = 6;
export const BASE_REPLICAS = 3;
const PER_REPLICA = 0.45;
const BASE_LOAD = 1;
const BASE_P95 = 90;
/** Ticks a change spends at each pipeline stage. */
const STAGE_TICKS = 2;
const QUEUE_MAX = 12;
/** Deploy age (ticks since the last merge) reported when nothing merged recently. */
const AGE_CAP = 12;

const A = Object.fromEntries(ACTIONS.map((a, i) => [a, i])) as Record<Action, number>;

export interface Metrics {
  queue: number;
  errors: number;
  p95: number;
  health: number[];
}

export interface Node {
  /** True health: 1 fine, 0.5 hanging, 0 dead. */
  health: number;
  isolated: boolean;
  /** Ticks until an isolated node rejoins the pool (rebuilt if it was dead). */
  back: number;
}

export interface Change {
  /** 1 builder, 2 sandbox, 3 judge. */
  stage: 1 | 2 | 3;
  t: number;
  bad: boolean;
  broken: boolean;
}

export interface ServiceState {
  seed: number;
  tick: number;
  judge: boolean;
  load: number;
  replicas: number;
  /** Replicas one tick ago (shown next to the previous readings). */
  prevReplicas: number;
  nodes: Node[];
  /** Dependency slowdown factor on p95 (1 = none). */
  slow: number;
  queue: number;
  /** What the dashboard shows now and one tick ago (noisy). */
  m: Metrics;
  prev: Metrics;
  /** True (noise-free) SLO inputs of the last tick. */
  errors: number;
  p95: number;
  change: Change | null;
  /** A merged change in prod: bad or harmless. Null when none recently (or rolled back). */
  prod: { bad: boolean } | null;
  deployAge: number;
  testsRed: number;
  /** Judge's review risk of the change it is reviewing (0 when none or the judge is off). */
  risk: number;
  // hidden
  fault: Scenario | null;
  faultTick: number;
  faultNode: number;
  latencyOn: boolean;
  /** Ticks until a paged human arrives (−1 none). */
  page: number;
  lastAction: number;
  // bookkeeping
  stable: number;
  /** Ticks out of SLO since the fault (since the ship, for a bad deploy). */
  burned: number;
  /** Ticks left of a rolling restart (a rollback redeploys every node): capacity ×0.75 meanwhile. */
  restart: number;
  first: ServiceOutcome | null;
  final: ServiceOutcome | null;
  /** Ticks after the fault when it was caught or recovered (−1 not yet). */
  resolvedAt: number;
}

/** Counter-based randomness: one fresh mulberry32 stream per (seed, tick), so the state stays plain data. */
const rngAt = (seed: number, salt: number) => mulberry32(Math.imul(seed ^ 0x5bd1e995, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b));
/** Roughly standard normal (Irwin–Hall, 4 uniforms). */
const gauss = (r: () => number) => (r() + r() + r() + r() - 2) * Math.sqrt(3);
const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));

const freshNodes = (): Node[] => NODES.map(() => ({ health: 1, isolated: false, back: 0 }));

export function createService(seed: number, o: { judge: boolean }): ServiceState {
  const base: ServiceState = {
    seed,
    tick: 0,
    judge: o.judge,
    load: BASE_LOAD,
    replicas: BASE_REPLICAS,
    prevReplicas: BASE_REPLICAS,
    nodes: freshNodes(),
    slow: 1,
    queue: 0,
    m: { queue: 0, errors: 0, p95: 0, health: [1, 1, 1, 1] },
    prev: { queue: 0, errors: 0, p95: 0, health: [1, 1, 1, 1] },
    errors: 0,
    p95: 0,
    change: null,
    prod: null,
    deployAge: AGE_CAP,
    testsRed: 0,
    risk: 0,
    fault: null,
    faultTick: 0,
    faultNode: 0,
    latencyOn: false,
    page: -1,
    lastAction: A.noop,
    stable: 0,
    burned: 0,
    restart: 0,
    first: null,
    final: null,
    resolvedAt: -1,
  };
  const s = physics(base, rngAt(seed, 0));
  return { ...s, prev: s.m };
}

/** The visitor (or the exporter) injects a fault. Nothing observable changes until the next tick,
 * except a change appearing in the pipeline. Draws the same random numbers whatever the fault. */
export function inject(s: ServiceState, f: Scenario): ServiceState {
  const r = rngAt(s.seed, 0x10000 + s.tick);
  const harmless = r() < 0.4;
  const where = Math.floor(r() * 4);
  const phase = Math.floor(r() * STAGE_TICKS);
  const node = Math.floor(r() * NODES.length);
  let change: Change | null = s.change;
  let prod = s.prod;
  let deployAge = s.deployAge;
  if (f === 'bad_deploy' || f === 'broken_test') change = { stage: 1, t: 0, bad: f === 'bad_deploy', broken: f === 'broken_test' };
  else if (harmless && !change) {
    if (where < 3) change = { stage: (where + 1) as 1 | 2 | 3, t: phase, bad: false, broken: false };
    else {
      prod = { bad: false };
      deployAge = phase;
    }
  }
  // fault after fault into one service (the page does this): a finished surge does not linger,
  // but a slow dependency nobody fixed stays slow
  return {
    ...s,
    load: f === 'surge' || f === 'overload' ? s.load : BASE_LOAD,
    change,
    prod,
    deployAge,
    fault: f,
    faultTick: s.tick,
    faultNode: node,
    latencyOn: f === 'latency' || s.latencyOn,
    stable: 0,
    burned: 0,
    first: null,
    final: null,
    resolvedAt: -1,
  };
}

const capacityOf = (s: ServiceState) => {
  const pool = s.nodes.reduce((a, n) => a + (n.isolated ? 0 : n.health), 0);
  return s.replicas * PER_REPLICA * (pool / NODES.length) * (s.restart > 0 ? 0.75 : 1) * (s.latencyOn ? 1 - 0.3 * Math.min(1, (s.slow - 1) / 3.5) : 1);
};

/** Load, capacity, queue and the true and measured metrics for one tick. */
function physics(s: ServiceState, r: () => number): ServiceState {
  const active = s.nodes.filter((n) => !n.isolated);
  const share = 1 / Math.max(1, active.length);
  const deadShare = active.reduce((a, n) => a + (n.health === 0 ? share : 0), 0);
  const hangShare = active.reduce((a, n) => a + (n.health > 0 && n.health < 1 ? share : 0), 0);
  const load = s.load * (1 + 0.04 * gauss(r));
  const arrivals = load * (1 - deadShare);
  const cap = Math.max(0.05, capacityOf(s));
  let queue = Math.max(0, s.queue + arrivals - cap);
  let dropped = 0;
  if (queue > QUEUE_MAX) {
    dropped = (queue - QUEUE_MAX) / Math.max(load, 0.1);
    queue = QUEUE_MAX;
  }
  const util = Math.min(1.5, arrivals / cap);
  const p95 = BASE_P95 * s.slow * (1 + 0.6 * util ** 6) + (350 * queue) / cap + (hangShare > 0 ? 150 : 0);
  const errors = clamp(0.002 + deadShare * 0.6 + hangShare * 0.12 + (s.prod?.bad ? 0.07 : 0) + 0.015 * ((s.slow - 1) / 3.5) + Math.max(0, (p95 - 900) / 3000) + dropped);
  // the dashboard: noisy readings, probes that time out on healthy nodes when everything is slow
  const timeout = clamp((p95 - 220) / 700, 0, 0.5);
  const health = s.nodes.map((n) => {
    if (n.isolated) return 1;
    if (n.health === 0) return 0.08 * r();
    if (n.health < 1) return clamp(n.health + 0.15 * gauss(r));
    // a timed-out probe reads like a refused one (overlapping ranges): the dashboard cannot tell slow from dead in one reading
    return r() < timeout ? 0.02 + 0.5 * r() : clamp(1 - Math.abs(0.06 * gauss(r)));
  });
  const m: Metrics = {
    queue: Math.max(0, queue + 0.12 * gauss(r)),
    errors: clamp(errors * (1 + 0.2 * gauss(r)) + 0.001 * Math.abs(gauss(r))),
    p95: Math.max(20, p95 * (1 + 0.08 * gauss(r)) + 15 * gauss(r)),
    health,
  };
  const reviewing = s.change?.stage === 3 && s.judge;
  const risk = reviewing ? clamp(s.change!.bad ? 0.62 + 0.38 * r() : 0.05 + 0.4 * r()) : 0;
  return { ...s, queue, errors, p95, prev: s.m, m, risk };
}

/** Replicas a human (or the teacher) would run for the true load on the current pool. */
export function neededReplicas(s: ServiceState, load = s.load): number {
  const pool = s.nodes.reduce((a, n) => a + (n.isolated ? 0 : n.health === 1 ? 1 : 0), 0);
  const per = PER_REPLICA * (Math.max(1, pool) / NODES.length) * (s.latencyOn ? 0.7 : 1);
  return Math.min(MAX_REPLICAS, Math.ceil((load * 1.15) / per));
}

/** Isolate drains the pool node whose health reading is lowest right now (never below 2 nodes). */
export function isolateTarget(s: ServiceState): number {
  const active = s.nodes.map((n, i) => (n.isolated ? -1 : i)).filter((i) => i >= 0);
  if (active.length <= 2) return -1;
  return active.reduce((best, i) => (s.m.health[i] < s.m.health[best] ? i : best), active[0]);
}

export function step(s0: ServiceState, actionIndex: number): { state: ServiceState; reward: number } {
  const r = rngAt(s0.seed, s0.tick + 1);
  let reward = 0;
  let s: ServiceState = { ...s0, nodes: s0.nodes.map((n) => ({ ...n })), lastAction: actionIndex, prevReplicas: s0.replicas };
  let caught = false;
  let shipped = false;

  // 1. the action
  switch (ACTIONS[actionIndex]) {
    case 'retry':
      reward -= 0.1;
      if (s.latencyOn && r() < 0.8) s.latencyOn = false;
      // reconnecting re-sends what is waiting: a retry storm when there is a queue
      else if (s.queue > 0.3) s.queue += 0.3;
      break;
    case 'rollback':
      reward -= 0.3;
      if (s.prod) s = { ...s, prod: null, deployAge: AGE_CAP, restart: 2 };
      break;
    case 'isolate': {
      reward -= 0.2;
      const i = isolateTarget(s);
      if (i >= 0) s.nodes[i] = { health: s.nodes[i].health, isolated: true, back: s.nodes[i].health === 1 ? 4 : 6 };
      break;
    }
    case 'scale':
      reward -= 0.2;
      s.replicas = Math.min(MAX_REPLICAS, s.replicas + 1);
      break;
    case 'block_merge':
      reward -= 0.1;
      if (s.change?.stage === 3 && s.judge) {
        if (s.change.bad) caught = true;
        else reward -= 1;
        s.change = null;
      }
      break;
    case 'page_human':
      if (s.page < 0) {
        reward -= 2;
        s.page = 4;
      }
      break;
  }

  // 2. a paged human arrives and fixes what can be fixed
  if (s.page > 0) {
    s.page -= 1;
    if (s.page === 0) {
      s.page = -1;
      s.latencyOn = false;
      s.nodes = s.nodes.map((n) => (n.health < 1 && !n.isolated ? { ...n, isolated: true, back: 6 } : n));
      if (s.prod?.bad) s = { ...s, prod: null, deployAge: AGE_CAP };
      s.replicas = Math.max(s.replicas, neededReplicas(s));
    }
  }

  // 3. the hidden fault develops
  const k = s.tick + 1 - s.faultTick;
  const ramp = Math.min(1, k / ONSET);
  if (s.fault === 'surge') s.load = BASE_LOAD + 0.9 * ramp;
  if (s.fault === 'overload') s.load = BASE_LOAD + 2.4 * ramp;
  s.slow = s.latencyOn ? Math.max(s.slow, 1 + 3.5 * ramp) : 1;
  if ((s.fault === 'node_down' || s.fault === 'overload') && k <= 2) {
    const n = s.nodes[s.faultNode];
    if (!n.isolated) s.nodes[s.faultNode] = { ...n, health: k === 1 ? 0.5 : 0 };
    else if (k === 2) s.nodes[s.faultNode] = { ...n, health: 0, back: Math.max(n.back, 6) };
  }
  s.nodes = s.nodes.map((n) => {
    if (!n.isolated) return n;
    const back = n.back - 1;
    return back <= 0 ? { health: 1, isolated: false, back: 0 } : { ...n, back };
  });

  // 4. the pipeline (a rolling restart started earlier runs its course)
  if (s0.restart > 0) s.restart = s0.restart - 1;
  s.deployAge = Math.min(AGE_CAP, s.deployAge + 1);
  s.testsRed = Math.max(0, s.testsRed - 1);
  if (s.change) {
    let c: Change | null = { ...s.change, t: s.change.t + 1 };
    if (c.t >= STAGE_TICKS) {
      if (c.stage === 1) {
        c = { ...c, stage: 2, t: 0 };
        if (c.broken) {
          // the sandbox runs the tests: a broken one stops the change, judge or not
          s.testsRed = 3;
          caught = true;
          c = null;
        }
      } else if (c.stage === 2 && s.judge) c = { ...c, stage: 3, t: 0 };
      else {
        // merged (with the judge off it goes straight from the sandbox to main)
        s.prod = { bad: c.bad };
        s.deployAge = 0;
        if (c.bad) {
          reward -= 10;
          shipped = true;
        }
        c = null;
      }
    }
    s.change = c;
  }

  // 5. the tick plays out
  s = physics({ ...s, tick: s.tick + 1 }, r);
  const inSlo = s.errors < SLO.errors && s.p95 < SLO.p95;
  reward += inSlo ? 1 : -1;

  // 6. outcomes
  if (s.fault) {
    const since = s.tick - s.faultTick;
    const done = s.final === 'caught' || s.final === 'recovered' || s.final === 'failed';
    if (!done) {
      const note = (o: ServiceOutcome) => {
        s.first ??= o;
        s.final = o;
      };
      if (caught) {
        note('caught');
        s.resolvedAt = since;
      } else {
        if (shipped) note('shipped');
        const watching = s.fault === 'bad_deploy' ? s.final === 'shipped' && !s.prod?.bad : s.fault !== 'broken_test';
        if (watching && !inSlo) s.burned += 1;
        s.stable = watching && inSlo && since >= ONSET ? s.stable + 1 : 0;
        if (s.stable >= STABLE) {
          note('recovered');
          s.resolvedAt = since;
        } else if (watching && s.burned >= BUDGET) note('failed');
        else if (since >= EPISODE && s.final === null && s.fault !== 'broken_test') note('failed');
      }
    }
  }
  return { state: s, reward };
}

export const OBS_SIZE = 24;
/** Index of the current p95 reading in the observation. */
export const OBS_P95 = 2;

/** What an on-call engineer sees, normalised to ~0..1: now and one tick ago, plus the pipeline, the
 * judge switch and the last action. Never the hidden fault. Layout (index: meaning):
 *  0 queue, 1 errors, 2 p95, 3–6 node health (builder, sandbox, judge, prod; drained nodes read 1),
 *  7 replicas, 8 nodes in pool, 9 pipeline stage (0 none, ⅓ builder, ⅔ sandbox, 1 judge),
 *  10 ticks since the last merge (1 = none recently), 11 tests red, 12 judge's review risk,
 *  13–20 the same as 0–7 one tick ago, 21 judge on, 22 last action, 23 a human is on the way. */
export function observe(s: ServiceState): Float32Array {
  const o = new Float32Array(OBS_SIZE);
  const put = (at: number, m: Metrics, replicas: number) => {
    o[at] = clamp(m.queue / 6);
    o[at + 1] = clamp(m.errors / 0.25);
    o[at + 2] = clamp(m.p95 / 1200);
    m.health.forEach((h, i) => (o[at + 3 + i] = h));
    o[at + 7] = replicas / MAX_REPLICAS;
  };
  put(0, s.m, s.replicas);
  o[8] = s.nodes.filter((n) => !n.isolated).length / NODES.length;
  o[9] = (s.change?.stage ?? 0) / 3;
  o[10] = s.deployAge / AGE_CAP;
  o[11] = s.testsRed > 0 ? 1 : 0;
  o[12] = s.risk;
  put(13, s.prev, s.prevReplicas);
  o[21] = s.judge ? 1 : 0;
  o[22] = s.lastAction / (ACTIONS.length - 1);
  o[23] = s.page >= 0 ? 1 : 0;
  return o;
}

export const outcome = (s: ServiceState): ServiceOutcome | null => s.final;
