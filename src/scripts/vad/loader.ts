// The only voice-demo code a page loads up front: one delegated click listener (the Sully
// breakdown arrives later, as a fragment) and the state rendering. On "Say hello" it decides
// from the browser alone whether the demo can run (Save-Data / 2G and unsupported browsers stop
// here, with nothing downloaded), then, inside the click, creates the AudioContext and asks for
// the mic: Safari only starts audio from a user gesture. Only then does it import ./demo.
import { track } from '../analytics';
import { loadVadDemo } from './load-demo';
import type { Mic } from './demo';
import { analyticsFor, envOf, initial, next, type State, type VadEvent } from './states';

const BUSY = ['asking', 'loading', 'calibrating', 'listening'];

export function renderVad(root: HTMLElement, s: State): void {
  root.dataset.vadPhase = s.phase;
  root.querySelectorAll<HTMLElement>('[data-vad-msg]').forEach((el) => (el.hidden = el.dataset.vadMsg !== s.phase));
  const pct = root.querySelector('[data-vad-progress]');
  if (pct) pct.textContent = `${Math.round(s.progress * 100)}%`;
  if (s.ms !== null) root.querySelectorAll('[data-vad-ms]').forEach((el) => (el.textContent = String(Math.round(s.ms!))));
  const btn = root.querySelector<HTMLButtonElement>('[data-vad-start]');
  if (btn) btn.disabled = BUSY.includes(s.phase);
}

export function initVadLoader(): void {
  const states = new WeakMap<HTMLElement, State>();

  document.addEventListener('click', (e) => {
    const root = (e.target as Element | null)?.closest?.('[data-vad-start]')?.closest<HTMLElement>('[data-vad]');
    if (!root) return;
    const env = envOf(window);
    const dispatch = (ev: VadEvent): State => {
      const prev = states.get(root) ?? initial;
      const s = next(prev, ev, env);
      states.set(root, s);
      const event = analyticsFor(prev, s);
      if (event) track('vad_demo', event as Record<string, string>);
      renderVad(root, s);
      return s;
    };
    if (dispatch({ type: 'start' }).phase !== 'asking') return;

    let ctx: AudioContext | undefined;
    let mic: Promise<Mic>;
    try {
      ctx = new AudioContext();
      ctx.resume().catch(() => {});
      // Never rejects: the demo reads the outcome, so a denial is not an unhandled rejection.
      mic = navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true } }).then(
        (stream) => ({ stream }),
        (err: unknown) => ({ error: (err as { name?: string })?.name ?? 'Error' }),
      );
    } catch (err) {
      ctx?.close().catch(() => {});
      dispatch({ type: 'mic', error: (err as { name?: string })?.name ?? 'Error' });
      return;
    }
    loadVadDemo().then(
      (m) => m.runVadDemo(root, ctx!, mic, dispatch),
      () => {
        mic.then((m) => m.stream?.getTracks().forEach((t) => t.stop()));
        ctx!.close().catch(() => {});
        dispatch({ type: 'fail' });
      },
    );
  });
}
