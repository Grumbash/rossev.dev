/// <reference lib="webworker" />
// Runs the GR neural cellular automaton off the main thread. A grown grid costs
// a few milliseconds per step on a laptop and several times that on a phone, so
// the page only receives finished frames and never steps the model itself.
import { NeuralCA } from './model';
import { decodeWeights } from './weights';
import { createTicker } from './ticker';
import { createHealer, type Healer, type HealerStatus } from './healer';

export type ToWorker =
  /** `from: 'seed'` starts from one cell instead of the grown monogram (the post-page companion). */
  | { type: 'init'; weightsUrl: string; reducedMotion: boolean; from?: 'grown' | 'seed' }
  /** The companion grows only this many steps from its seed, as far as the post has been read. */
  | { type: 'cap'; steps: number }
  | { type: 'visible'; visible: boolean }
  | { type: 'damage'; points: { x: number; y: number }[]; r: number }
  | { type: 'reset' }
  /** Hands a drawn frame's pixel buffer back so the next frame can reuse it. */
  | { type: 'recycle'; pixels: Uint8ClampedArray<ArrayBuffer> };

export type FromWorker =
  | { type: 'frame'; size: number; pixels: Uint8ClampedArray<ArrayBuffer> }
  /** A regrow from a single cell started (too much lost, or it settled into a wrong shape). */
  | { type: 'notice'; kind: 'regrowing' }
  | { type: 'error'; message: string };

const STEPS_PER_SECOND = 40;
const TICK_MS = 1000 / 30;
const MAX_STEPS_PER_TICK = 4; // a slow device grows slower instead of falling behind
// The loop runs until the healer (./healer.ts) settles: a bite or cut ~200–450 steps, a
// loss too large to heal is given up by step 380 and regrown (~400–800 more), and then it
// rests until the next bite or reset.
const GROWN_STEPS = 300;
// The page shows a notice for 2.5 s; no second one while it is up. Longer than 2.5 s
// so a regrow right as the notice fades doesn't flash it straight back.
const NOTICE_MS = 3000;
// Under reduced motion a regrow skips to the grown monogram, but only once the gesture
// that caused it has been still this long: growing out of sight blocks the worker for
// ~0.7 s, and an erase stroke still under way would just erase the new monogram again.
const QUIET_MS = 400;

const scope = self as unknown as DedicatedWorkerGlobalScope;

let healer: Healer | null = null;
let reducedMotion = false;
let visible = false;
let active = false; // the healer is still watching the pattern change
let owed = 0;
let lastTick = 0;
let noticeUntil = 0;
let silentGrowAt = 0; // when to grow a reduced-motion regrow out of sight; 0 = none pending
// The companion's first growth from its seed stops at `cap` steps until the reader reads on;
// Infinity everywhere else. Healing after damage is never capped.
let cap = Infinity;
let grownSteps = 0;
let capping = false;

// Pixel buffers travel to the page (transferred, not copied) and come back via
// 'recycle'. The RGBA floats come from the healer, which reads them for its stats.
const spare: Uint8ClampedArray<ArrayBuffer>[] = [];

/** Posts the healer's last measured frame as straight-alpha pixels. */
function postFrame(): void {
  if (!healer) return;
  const { rgba, size } = healer;
  const pixels = spare.pop() ?? new Uint8ClampedArray(rgba.length);
  // The model works in premultiplied alpha; ImageData wants it straight.
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3];
    if (a < 1 / 255) {
      pixels[i] = pixels[i + 1] = pixels[i + 2] = pixels[i + 3] = 0;
      continue;
    }
    pixels[i] = (rgba[i] / a) * 255;
    pixels[i + 1] = (rgba[i + 1] / a) * 255;
    pixels[i + 2] = (rgba[i + 2] / a) * 255;
    pixels[i + 3] = a * 255;
  }
  const msg: FromWorker = { type: 'frame', size, pixels };
  scope.postMessage(msg, [pixels.buffer]);
}

/** A regrow from one cell started: tell the visitor why (once), and under reduced
 * motion show the finished monogram instead of the growth once the gesture is over. */
function regrowing(): void {
  const now = performance.now();
  if (now >= noticeUntil) {
    noticeUntil = now + NOTICE_MS;
    scope.postMessage({ type: 'notice', kind: 'regrowing' } satisfies FromWorker);
  }
  if (reducedMotion) silentGrowAt = now + QUIET_MS;
}

function shouldRun(): boolean {
  return healer !== null && visible && active;
}

/** Starts the loop if it should run and isn't already; the only way ticks get scheduled. */
function wake(): void {
  if (ticker.pending || !shouldRun()) return;
  lastTick = performance.now();
  owed = 0;
  ticker.wake();
}

/** One loop iteration; returns whether to keep going. */
function tick(): boolean {
  if (!healer || !shouldRun()) return false;
  const now = performance.now();
  if (silentGrowAt) {
    if (now < silentGrowAt) return true; // hold the seed still while the gesture goes on
    silentGrowAt = 0;
    healer.grow();
    active = false;
    postFrame();
    return false;
  }
  owed = Math.min(owed + ((now - lastTick) / 1000) * STEPS_PER_SECOND, MAX_STEPS_PER_TICK);
  lastTick = now;
  let n = Math.floor(owed);
  // Growing toward the reader: no further than the share read, then wait for more.
  if (capping) {
    n = Math.min(n, cap - grownSteps);
    if (n <= 0) {
      owed = 0;
      return false;
    }
    grownSteps += n;
    if (grownSteps >= GROWN_STEPS) capping = false;
  }
  if (n > 0) {
    const status: HealerStatus = healer.step(n);
    owed -= n;
    if (status === 'settled') active = false;
    if (status === 'regrowing') regrowing();
    postFrame();
  }
  return shouldRun();
}

const ticker = createTicker(tick, TICK_MS);

/** Restarts from a seed. `silent` grows it out of sight and shows the finished
 * monogram: used under reduced motion, and for the first frame, which replaces the
 * page's static GR (a GR → dot → GR flash would read as a glitch, not as growth;
 * Reset and full wipes still show the growth). */
function reset(silent = reducedMotion): void {
  if (!healer) return;
  silentGrowAt = 0;
  if (silent) {
    healer.grow();
    active = false;
  } else {
    healer.restart();
    active = true;
  }
  postFrame();
  wake();
}

scope.onmessage = async (event: MessageEvent<ToWorker>) => {
  const msg = event.data;
  switch (msg.type) {
    case 'init': {
      reducedMotion = msg.reducedMotion;
      try {
        const res = await fetch(msg.weightsUrl);
        if (!res.ok) throw new Error(`weights: HTTP ${res.status}`);
        healer = createHealer(new NeuralCA(decodeWeights(await res.arrayBuffer())), { grownSteps: GROWN_STEPS });
      } catch (err) {
        scope.postMessage({ type: 'error', message: String(err) } satisfies FromWorker);
        return;
      }
      if (msg.from === 'seed') {
        capping = true;
        healer.restart();
        active = true;
        postFrame();
        wake();
      } else reset(true);
      break;
    }
    case 'cap':
      cap = msg.steps;
      wake();
      break;
    case 'visible':
      visible = msg.visible;
      wake();
      break;
    case 'damage':
      if (!healer) return;
      // Healing answers the visitor, so it animates even with reduced motion.
      active = true;
      if (healer.damage(msg.points, msg.r) === 'regrowing') regrowing();
      else if (silentGrowAt) silentGrowAt = performance.now() + QUIET_MS; // still erasing
      postFrame();
      wake();
      break;
    case 'reset':
      reset();
      break;
    case 'recycle':
      if (spare.length < 3) spare.push(msg.pixels);
      break;
  }
};
