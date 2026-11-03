/// <reference lib="webworker" />
// Runs the GR neural cellular automaton off the main thread. A grown grid costs
// a few milliseconds per step on a laptop and several times that on a phone, so
// the page only receives finished frames and never steps the model itself.
import { NeuralCA } from './model';
import { decodeWeights } from './weights';
import { createTicker } from './ticker';

export type ToWorker =
  | { type: 'init'; weightsUrl: string; reducedMotion: boolean }
  | { type: 'visible'; visible: boolean }
  | { type: 'damage'; points: { x: number; y: number }[]; r: number }
  | { type: 'reset' }
  /** Hands a drawn frame's pixel buffer back so the next frame can reuse it. */
  | { type: 'recycle'; pixels: Uint8ClampedArray<ArrayBuffer> };

export type FromWorker =
  | { type: 'frame'; size: number; pixels: Uint8ClampedArray<ArrayBuffer> }
  | { type: 'error'; message: string };

const STEPS_PER_SECOND = 40;
const TICK_MS = 1000 / 30;
const MAX_STEPS_PER_TICK = 4; // a slow device grows slower instead of falling behind
// Growing takes ~300 steps and healing a cut up to ~600. After that the pattern
// is visually still, so the loop rests until the next bite or reset.
const ACTIVE_STEPS = 700;
const GROWN_STEPS = 300;

const scope = self as unknown as DedicatedWorkerGlobalScope;

let ca: NeuralCA | null = null;
let aliveThreshold = 0.1;
let reducedMotion = false;
let visible = false;
let budget = 0;
let owed = 0;
let lastTick = 0;

// Frame buffers: one RGBA float buffer, and pixel buffers that travel to the
// page (transferred, not copied) and come back via 'recycle'.
let rgba: Float32Array = new Float32Array(0);
const spare: Uint8ClampedArray<ArrayBuffer>[] = [];

/** Posts the current state as straight-alpha pixels. Returns false if no cell is alive. */
function postFrame(): boolean {
  if (!ca) return false;
  rgba = ca.rgba(rgba.length === ca.size * ca.size * 4 ? rgba : undefined);
  const pixels = spare.pop() ?? new Uint8ClampedArray(rgba.length);
  let maxAlpha = 0;
  // The model works in premultiplied alpha; ImageData wants it straight.
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3];
    if (a > maxAlpha) maxAlpha = a;
    if (a < 1 / 255) {
      pixels[i] = pixels[i + 1] = pixels[i + 2] = pixels[i + 3] = 0;
      continue;
    }
    pixels[i] = (rgba[i] / a) * 255;
    pixels[i + 1] = (rgba[i + 1] / a) * 255;
    pixels[i + 2] = (rgba[i + 2] / a) * 255;
    pixels[i + 3] = a * 255;
  }
  const msg: FromWorker = { type: 'frame', size: ca.size, pixels };
  scope.postMessage(msg, [pixels.buffer]);
  return maxAlpha > aliveThreshold;
}

/** Posts a frame; if everything has died (a full wipe), starts over from a seed. */
function showOrRestart(): void {
  if (!postFrame()) reset();
}

function shouldRun(): boolean {
  return ca !== null && visible && budget > 0;
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
  if (!ca || !shouldRun()) return false;
  const now = performance.now();
  owed = Math.min(owed + ((now - lastTick) / 1000) * STEPS_PER_SECOND, MAX_STEPS_PER_TICK);
  lastTick = now;
  const n = Math.min(Math.floor(owed), budget);
  if (n > 0) {
    ca.step(n);
    owed -= n;
    budget -= n;
    showOrRestart(); // may reset(), which wakes the ticker; it stays a single chain
  }
  return shouldRun();
}

const ticker = createTicker(tick, TICK_MS);

/** Restarts from a seed. `silent` grows it out of sight and shows the finished
 * monogram: used under reduced motion, and for the first frame, which replaces the
 * page's static GR (a GR → dot → GR flash would read as a glitch, not as growth;
 * Reset and full wipes still show the growth). */
function reset(silent = reducedMotion): void {
  if (!ca) return;
  ca.seed();
  if (silent) {
    ca.step(GROWN_STEPS);
    budget = 0;
  } else {
    budget = ACTIVE_STEPS;
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
        const weights = decodeWeights(await res.arrayBuffer());
        ca = new NeuralCA(weights);
        aliveThreshold = weights.aliveThreshold;
      } catch (err) {
        scope.postMessage({ type: 'error', message: String(err) } satisfies FromWorker);
        return;
      }
      reset(true);
      break;
    }
    case 'visible':
      visible = msg.visible;
      wake();
      break;
    case 'damage':
      if (!ca) return;
      for (const p of msg.points) ca.damage(p.x, p.y, msg.r);
      budget = ACTIVE_STEPS; // healing answers the visitor, so it animates even with reduced motion
      showOrRestart();
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
