// The take-over's fault runs (issue #10): the learned policy keeps the toy service alive while the
// visitor injects faults. Part of the lazy replay chunk (./player.ts draws it). The weights
// (/policy/policy.bin, ~2 KB) are fetched on the first fault, never before. The service, the policy
// and the step are the same code the tests and the trainer run (../policy/*): nothing here is scripted,
// the page only paces the ticks (and pauses them while Explore has the canvas). Also styles the fault
// menu, here rather than in the page's CSS.
import { act, decodePolicy, paramCount, type Policy } from '../policy/net';
import { EPISODE, createService, inject, isolateTarget, observe, outcome, step, type Fault, type ServiceOutcome, type ServiceState } from '../policy/service';

export const POLICY_URL = '/policy/policy.bin';
/** One service tick on screen. */
export const TICK_MS = 600;
/** A bad deploy that ships stays on screen this long before the policy may roll it back. */
export const SHIP_HOLD_MS = 2500;
let weights: Promise<Policy> | null = null;
const loadPolicy = () =>
  (weights ??= fetch(POLICY_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`policy: ${r.status}`);
      return r.arrayBuffer();
    })
    .then(decodePolicy)
    .catch((e) => {
      weights = null; // a later fault tries again
      throw e;
    }));

export interface PolicyRun {
  kind: Fault;
  svc: ServiceState;
  ticks: number;
  /** The last decision: action index, its probability, and the service node it acted on (-1: none). */
  action: number;
  confidence: number;
  target: number;
  outcome: ServiceOutcome | null;
  done: boolean;
  params: number;
  /** The policy paged a human at some point (then the result is not the dashboard's alone). */
  paged: boolean;
}

export function createPolicyDriver(o: { rm: boolean; onTick: (r: PolicyRun) => void; onOutcome: (r: PolicyRun, o: ServiceOutcome) => void; onError: () => void }) {
  let svc: ServiceState | null = null;
  let run: PolicyRun | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let token = 0;
  let policy: Policy | null = null;
  let paused = false;

  const stopTimer = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };

  function tickOnce(r: PolicyRun) {
    const obs = observe(r.svc);
    const d = act(policy!, obs);
    const target = d.action === 3 ? isolateTarget(r.svc) : -1;
    r.svc = step(r.svc, d.action).state;
    svc = r.svc;
    r.ticks++;
    r.action = d.action;
    r.confidence = d.probs[d.action];
    r.target = target;
    if (d.action === 6) r.paged = true;
    const now = outcome(r.svc);
    const changed = now !== r.outcome;
    r.outcome = now;
    r.done = now === 'caught' || now === 'recovered' || now === 'failed' || r.ticks >= EPISODE;
    return changed;
  }

  function schedule(r: PolicyRun, me: number, delay: number) {
    timer = setTimeout(() => {
      timer = undefined;
      if (me !== token || r.done || paused) return;
      const changed = tickOnce(r);
      o.onTick(r);
      if (changed && r.outcome) o.onOutcome(r, r.outcome);
      if (!r.done) schedule(r, me, changed && r.outcome === 'shipped' ? SHIP_HOLD_MS : TICK_MS);
    }, delay);
  }

  return {
    get run() {
      return run;
    },
    /** Inject a fault into the running service (fault after fault), or into a fresh one. */
    start(kind: Fault, judge: boolean) {
      stopTimer();
      const me = ++token;
      if (svc && svc.judge !== judge) svc = null;
      const base = svc ?? createService((Math.random() * 2 ** 31) | 0, { judge });
      const r: PolicyRun = { kind, svc: inject(base, kind), ticks: 0, action: 0, confidence: 0, target: -1, outcome: null, done: false, params: 0, paged: false };
      run = r;
      svc = r.svc;
      loadPolicy().then(
        (p) => {
          if (me !== token) return;
          policy = p;
          r.params = paramCount(p);
          if (o.rm) {
            // Reduced motion: every tick at once, then each result in order (shipped, then its rollback).
            const seen: ServiceOutcome[] = [];
            while (!r.done) if (tickOnce(r) && r.outcome) seen.push(r.outcome);
            o.onTick(r);
            seen.forEach((x) => o.onOutcome(r, x));
            return;
          }
          o.onTick(r);
          if (!paused) schedule(r, me, TICK_MS);
        },
        () => {
          if (me === token) o.onError();
        }
      );
    },
    /** Explore took the canvas: the run waits where it is (nothing lands behind free play). */
    pause() {
      paused = true;
      stopTimer();
    },
    resume() {
      if (!paused) return;
      paused = false;
      if (run && !run.done && policy && run.params) schedule(run, token, TICK_MS);
    },
    /** The setup changed (judge toggled), the weights failed, or the film came back: the next fault starts a fresh service. */
    reset() {
      stopTimer();
      token++;
      run = null;
      svc = null;
    },
  };
}

let styled = false;
/** The fault menu and the policy label, styled from this lazy chunk (the page's inline CSS is full). */
export function stylePolicyUi() {
  if (styled) return;
  styled = true;
  const st = document.createElement('style');
  st.textContent = `.sim-fault-menu{position:absolute;z-index:8;display:grid;grid-template-columns:1fr;gap:4px;padding:6px;background:#0F1118;border:2px solid #0A0A0A;box-shadow:4px 4px 0 #0A0A0A;max-width:calc(100% - 32px)}
.sim-fault-menu button{font:800 .68rem var(--font-mono);text-transform:uppercase;text-align:left;min-height:32px;padding:6px 10px;background:#F4F0EA;color:#0A0A0A;border:2px solid #0A0A0A;cursor:pointer}
.sim-fault-menu button:hover{background:#C8FF00}
.sim-fault-menu button:focus-visible{outline:3px solid #C8FF00;outline-offset:2px}
.policy-label{position:absolute;left:10px;right:10px;bottom:6px;z-index:6;margin:0;font:600 .62rem var(--font-mono);color:#A7AFC2;background:rgba(11,12,16,.88);padding:2px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none}
.is-exploring .sim-fault-menu,.is-exploring .policy-label{display:none}
@media (max-width:519px){.sim-fault-menu{grid-template-columns:1fr 1fr}.sim-fault-menu button{font-size:.6rem;min-height:28px;padding:4px 6px}.policy-label{white-space:normal;line-height:1.3}}`;
  document.head.appendChild(st);
}
