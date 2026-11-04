// The GR automaton heals bites and cuts, but when a visitor erases most of it and leaves a thin
// strip, the strip settles into a wrong stable shape (a long bar) and never becomes GR again: the
// cells only see their neighbours and a strip says nothing about where G and R were. Production
// weights, measured: keep the top 30% → MSE stuck at ~0.12; keep 40% → ~0.075; keep 55% heals,
// but only after ~2000 steps, long after the loop used to fall asleep at 700.
//
// So a recovery guard watches the pattern: too little left after damage, or a shape that settles
// wrong, means an honest regrow from a single cell instead of a broken monogram. These tests drive
// the same healer the worker uses, on the shipped weights.
import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { NeuralCA } from '../src/scripts/nca/model';
import { decodeWeights } from '../src/scripts/nca/weights';
import { createHealer, type HealerStatus } from '../src/scripts/nca/healer';
import { en } from '../src/i18n/en';
import { ru } from '../src/i18n/ru';

setDefaultTimeout(60_000);

const bin = readFileSync('public/nca/gr.bin');
const weights = decodeWeights(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
const target: number[] = JSON.parse(readFileSync('scripts/nca/target.json', 'utf8')).rgba;

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mse = (ca: NeuralCA) => {
  const out = ca.rgba();
  let s = 0;
  for (let i = 0; i < out.length; i++) s += (out[i] - target[i]) ** 2;
  return s / out.length;
};

/** A grown monogram and its healer, as the worker has them after the first frame. */
function grown(seed: number) {
  const ca = new NeuralCA(weights, mulberry32(seed));
  const healer = createHealer(ca);
  healer.grow();
  return { ca, healer };
}

/** Erase everything below `keepTop` of the grid, the way a drag across the lower part would. */
function eraseBelow(ca: NeuralCA, keepTop: number) {
  const pts: { x: number; y: number }[] = [];
  for (let y = Math.round(keepTop * ca.size); y < ca.size; y += 2) for (let x = 0; x < ca.size; x += 2) pts.push({ x, y });
  return pts;
}

/** Steps like the worker loop does (a few steps per tick) until the healer says it is done. */
function runUntilSettled(healer: ReturnType<typeof createHealer>, maxSteps: number): { steps: number; statuses: HealerStatus[] } {
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

describe('a small bite heals in place, as before', () => {
  test('no regrow, back to GR', () => {
    const { ca, healer } = grown(2);
    const verdict = healer.damage([{ x: 0.5 * ca.size, y: 0.5 * ca.size }], 0.2 * ca.size);
    expect(verdict).toBe('healing');
    const run = runUntilSettled(healer, 1500);
    expect(run.statuses.at(-1)).toBe('settled');
    expect(healer.regrows).toBe(0);
    expect(mse(ca)).toBeLessThan(0.01);
  });
});

describe('too little left after damage', () => {
  for (const keep of [0.3, 0.4]) {
    test(`keeping the top ${keep * 100}% regrows from one cell and ends as GR`, () => {
      const { ca, healer } = grown(7);
      const verdict = healer.damage(eraseBelow(ca, keep), 2.5);
      expect(verdict).toBe('regrowing');
      const run = runUntilSettled(healer, 1500);
      expect(run.statuses.at(-1)).toBe('settled');
      expect(healer.regrows).toBe(1);
      expect(mse(ca)).toBeLessThan(0.01);
    });
  }

  test('a full wipe still regrows', () => {
    const { ca, healer } = grown(3);
    expect(healer.damage(eraseBelow(ca, 0), 2.5)).toBe('regrowing');
    runUntilSettled(healer, 1500);
    expect(mse(ca)).toBeLessThan(0.01);
  });
});

describe('a large but recoverable loss', () => {
  test('keeping the top 55% ends as GR, without the loop giving up half-healed', () => {
    const { ca, healer } = grown(7);
    healer.damage(eraseBelow(ca, 0.55), 2.5);
    const run = runUntilSettled(healer, 4000);
    expect(run.statuses.at(-1)).toBe('settled');
    expect(mse(ca)).toBeLessThan(0.01);
  });
});

describe('a shape that settles wrong is caught too', () => {
  test('the pre-fix round-1 weights turn a vertical cut into "RR"; the guard regrows instead of settling on it', () => {
    // Real weights from PR #11 round 1, before the stroke retrain: a vertical cut between the
    // letters regrows the G as a second R and stays that way. Enough cells survive the cut, so
    // only the shape check can notice.
    const r1 = readFileSync('scripts/nca/gr-round1.bin');
    const w1 = decodeWeights(r1.buffer.slice(r1.byteOffset, r1.byteOffset + r1.byteLength));
    const ca = new NeuralCA(w1, mulberry32(1));
    const healer = createHealer(ca);
    healer.grow();
    const cut: { x: number; y: number }[] = [];
    for (let y = 0; y <= ca.size; y += 3) cut.push({ x: 28, y });
    expect(healer.damage(cut, 6.72)).toBe('healing');
    runUntilSettled(healer, 4000);
    expect(healer.regrows).toBeGreaterThanOrEqual(1);
  });
});

describe('the visitor is told what happened', () => {
  test('both locales say the monogram is regrowing from a single cell', () => {
    expect(en.nca.regrowing).toMatch(/regrow/i);
    expect(en.nca.regrowing).toMatch(/single cell|one cell/i);
    expect(ru.nca.regrowing.length).toBeGreaterThan(10);
    expect(ru.nca.regrowing).toMatch(/[а-яё]/i);
  });
});
