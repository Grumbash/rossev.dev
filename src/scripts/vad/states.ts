// The voice demo's states. Pure: the eager loader and the lazy demo both feed it events and
// render the phase it returns (each phase has its own server-rendered line, data-vad-msg).
//
//   idle ─start─► asking ─mic─► loading ─loaded─► calibrating ─ready─► listening ─onset─► detected
//     │              └─mic error─► denied | nomic | unsupported | error      └─timeout─► quiet
//     └─start─► savedata (Save-Data / 2G: nothing asked, nothing downloaded) | unsupported
// A failure while loading or listening is `error`; a click on any end state starts over.

export type Phase =
  | 'idle'
  | 'savedata'
  | 'unsupported'
  | 'asking'
  | 'denied'
  | 'nomic'
  | 'loading'
  | 'calibrating'
  | 'listening'
  | 'detected'
  | 'quiet'
  | 'error';

export type Env = { saveData: boolean; getUserMedia: boolean; audioWorklet: boolean; worker: boolean };
export type State = { phase: Phase; progress: number; ms: number | null };
export type VadEvent =
  | { type: 'start' }
  | { type: 'mic'; error?: string }
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'loaded' }
  | { type: 'ready' }
  | { type: 'onset'; ms: number }
  | { type: 'timeout' }
  | { type: 'fail' };

export const initial: State = { phase: 'idle', progress: 0, ms: null };

const ENDS: Phase[] = ['idle', 'detected', 'quiet', 'denied', 'nomic', 'error'];

type Connection = { saveData?: boolean; effectiveType?: string };

export function envOf(win: Window): Env {
  const w = win as Window & { AudioWorkletNode?: unknown; Worker?: unknown };
  const nav = win.navigator as Navigator & { connection?: Connection };
  const c = nav.connection;
  return {
    saveData: !!c?.saveData || c?.effectiveType === '2g' || c?.effectiveType === 'slow-2g',
    getUserMedia: typeof nav.mediaDevices?.getUserMedia === 'function',
    audioWorklet: typeof w.AudioWorkletNode === 'function',
    worker: typeof w.Worker === 'function',
  };
}

/** getUserMedia's DOMException name -> where the demo stops. */
export function micErrorPhase(name: string | undefined): Phase {
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'nomic';
  // Thrown when mediaDevices exists but the page isn't a secure context, or the constraints are unknown.
  if (name === 'TypeError') return 'unsupported';
  return 'error';
}

export function next(s: State, e: VadEvent, env: Env): State {
  const to = (phase: Phase, patch: Partial<State> = {}): State => ({ ...s, phase, ...patch });
  switch (e.type) {
    case 'start':
      if (!ENDS.includes(s.phase)) return s;
      if (env.saveData) return to('savedata');
      if (!env.getUserMedia || !env.audioWorklet || !env.worker) return to('unsupported');
      return { phase: 'asking', progress: 0, ms: null };
    case 'mic':
      if (s.phase !== 'asking') return s;
      return e.error ? to(micErrorPhase(e.error)) : to('loading');
    case 'progress':
      return s.phase === 'loading' ? to('loading', { progress: e.total > 0 ? Math.min(1, e.loaded / e.total) : 0 }) : s;
    case 'loaded':
      return s.phase === 'loading' ? to('calibrating', { progress: 1 }) : s;
    case 'ready':
      return s.phase === 'calibrating' ? to('listening') : s;
    case 'onset':
      return s.phase === 'listening' ? to('detected', { ms: e.ms }) : s;
    case 'timeout':
      return s.phase === 'listening' || s.phase === 'calibrating' ? to('quiet') : s;
    case 'fail':
      return ['asking', 'loading', 'calibrating', 'listening'].includes(s.phase) ? to('error') : s;
  }
}

/** vad_demo's ms prop. Defined here, not in ./onset, so the onset code stays out of the eager chunk. */
export function latencyBucket(ms: number): string {
  if (ms < 100) return '<100';
  if (ms < 200) return '100-199';
  if (ms < 400) return '200-399';
  if (ms < 800) return '400-799';
  return '800+';
}

/** The Umami event a transition sends: vad_demo {action, ms?}. Progress, Save-Data and quiet send none. */
export function analyticsFor(prev: State, s: State): { action: string; ms?: string } | null {
  if (prev.phase === s.phase) return null;
  if (s.phase === 'asking') return { action: 'start' };
  if (s.phase === 'denied') return { action: 'denied' };
  if (s.phase === 'detected' && s.ms !== null) return { action: 'detected', ms: latencyBucket(s.ms) };
  if (s.phase === 'nomic' || s.phase === 'unsupported' || s.phase === 'error') return { action: 'error' };
  return null;
}
