// Shared by the nca-regrow*.test.ts files: the shipped GR weights, a seeded rng, and the way the
// worker grows, damages and steps the monogram. The suite is split across files so a parallel run
// (scripts/test.ts) spreads its minutes of simulation over the cores.
import { readFileSync } from 'node:fs';
import { NeuralCA } from '../../src/scripts/nca/model';
import { decodeWeights } from '../../src/scripts/nca/weights';
import { createHealer, type HealerStatus } from '../../src/scripts/nca/healer';

const bin = readFileSync('public/nca/gr.bin');
export const weights = decodeWeights(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
const target: number[] = JSON.parse(readFileSync('scripts/nca/target.json', 'utf8')).rgba;

export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const mse = (ca: NeuralCA) => {
  const out = ca.rgba();
  let s = 0;
  for (let i = 0; i < out.length; i++) s += (out[i] - target[i]) ** 2;
  return s / out.length;
};

/** A grown monogram and its healer, as the worker has them after the first frame. */
export function grown(seed: number) {
  const ca = new NeuralCA(weights, mulberry32(seed));
  const healer = createHealer(ca);
  healer.grow();
  return { ca, healer };
}

/** Erase everything below `keepTop` of the grid, the way a drag across the lower part would. */
export function eraseBelow(ca: NeuralCA, keepTop: number) {
  const pts: { x: number; y: number }[] = [];
  for (let y = Math.round(keepTop * ca.size); y < ca.size; y += 2) for (let x = 0; x < ca.size; x += 2) pts.push({ x, y });
  return pts;
}

/** Steps like the worker loop does (a few steps per tick) until the healer says it is done. */
export function runUntilSettled(healer: ReturnType<typeof createHealer>, maxSteps: number): { steps: number; statuses: HealerStatus[] } {
  const statuses: HealerStatus[] = [];
  let steps = 0;
  while (steps < maxSteps) {
    const s = healer.step(4);
    steps += 4;
    statuses.push(s);
    if (s === 'settled') break;
  }
  return { steps, statuses };
}
