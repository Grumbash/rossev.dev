// Rules for taking over the topology replay. Pure and immutable, no DOM: ./player.ts owns the
// screen. The film (mode 'replay') plays the real PR #11 run; any interaction pauses it where it
// is and hands the scene to the visitor (mode 'live'), where results are honest: a fault the tests
// miss is caught only by the judge, and with the judge off it ships. Left alone, the visitor is
// offered the film back, then gets it back from the point of divergence.

export type Mode = 'replay' | 'live';
export type Outcome = 'caught' | 'shipped' | 'healed' | 'unhealed';
export type FaultKind = 'logic' | 'test';

export interface SimState {
  mode: Mode;
  /** Film time (ms). Frozen while live, so resuming picks up where the visitor stepped in. */
  t: number;
  judge: boolean;
  outcome: Outcome | null;
  caughtBy: 'judge' | 'sandbox' | null;
  /** Time since the visitor last did something, while live. */
  idleMs: number;
}

export const RESUME_PROMPT_MS = 6000;
export const AUTO_RESUME_MS = 10000;
/** A cut counts as healed when the regrown monogram is this close (mean squared error, RGBA 0..1)
 * to what it was before the cut. Same bar as tests/nca.test.ts. */
export const HEAL_MSE = 0.01;

export const START: SimState = { mode: 'replay', t: 0, judge: true, outcome: null, caughtBy: null, idleMs: 0 };

/** Time passes: the film advances (and loops) while it plays; the idle clock runs while live. */
export function tick(s: SimState, dt: number, length: number): SimState {
  if (s.mode === 'replay') return { ...s, t: (s.t + dt) % length };
  const idleMs = s.idleMs + dt;
  return idleMs >= AUTO_RESUME_MS ? resume(s) : { ...s, idleMs };
}

/** Any interaction: the film stops where it is and the visitor drives. */
export const takeover = (s: SimState): SimState => ({ ...s, mode: 'live', idleMs: 0 });

/** Flipping the judge changes the setup, so the last result no longer describes it. */
export const toggleJudge = (s: SimState): SimState => ({ ...takeover(s), judge: !s.judge, outcome: null, caughtBy: null });

/** A 'logic' fault passes the tests (like G→R did): only the judge stands between it and main.
 * A 'test' fault breaks a test, so the sandbox stops it either way. */
export function injectFault(s: SimState, kind: FaultKind): SimState {
  const live = takeover(s);
  if (kind === 'test') return { ...live, outcome: 'caught', caughtBy: 'sandbox' };
  return live.judge ? { ...live, outcome: 'caught', caughtBy: 'judge' } : { ...live, outcome: 'shipped', caughtBy: null };
}

/** The visitor cut the GR and the real model regrew it: judged by its error against the uncut monogram. */
export const cutResult = (s: SimState, mse: number): SimState => ({
  ...takeover(s),
  outcome: mse < HEAL_MSE ? 'healed' : 'unhealed',
  caughtBy: null,
});

/** Back to the film at the point of divergence, with the judge back on and nothing broken. */
export const resume = (s: SimState): SimState => ({ ...START, t: s.t });

export const showResumePrompt = (s: SimState): boolean => s.mode === 'live' && s.idleMs >= RESUME_PROMPT_MS;

/** The analytics event a transition sends, if any (the caller sends each once per view). */
export function analyticsFor(from: SimState, to: SimState): { action: string; outcome?: Outcome } | null {
  if (from.mode === 'replay' && to.mode === 'live') return { action: 'takeover' };
  if (from.mode === 'live' && to.mode === 'replay') return { action: 'resume' };
  if (to.outcome && to.outcome !== from.outcome) return { action: 'outcome', outcome: to.outcome };
  return null;
}
