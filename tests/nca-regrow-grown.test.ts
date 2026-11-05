// More of the recovery guard on the shipped weights; the story is in nca-regrow.test.ts.
import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { NeuralCA } from '../src/scripts/nca/model';
import { decodeWeights } from '../src/scripts/nca/weights';
import { createHealer } from '../src/scripts/nca/healer';
import { eraseBelow, grown, mse, mulberry32, runUntilSettled } from './fixtures/nca-regrow';

setDefaultTimeout(60_000);

// A second judge found the guard measured "grown" against one grown frame. On ~4% of page views that
// frame is itself off (bad bbox, or MSE ~0.009), so clean heals were judged wrong and thrown away,
// up to 4 regrows and ~100 s. Seeds below are the ones it reproduced on.
describe('"grown" means the real GR, not whatever the first grow happened to produce', () => {
  test('a full wipe on the seeds that used to loop regrows once and ends clean', () => {
    for (const seed of [203, 260, 275, 278, 281, 301]) {
      const { ca, healer } = grown(seed);
      healer.damage(eraseBelow(ca, 0), 2.5);
      const run = runUntilSettled(healer, 2000);
      expect(run.statuses.at(-1), `seed ${seed}`).toBe('settled');
      expect(healer.regrows, `seed ${seed}`).toBe(1);
      expect(mse(ca), `seed ${seed}`).toBeLessThan(0.005);
    }
  });

  test('an ordinary bite on those seeds heals in place, with no regrow', () => {
    for (const seed of [203, 260, 275, 278, 281, 301]) {
      const { ca, healer } = grown(seed);
      healer.damage([{ x: 0.3 * ca.size, y: 0.5 * ca.size }], 0.15 * ca.size);
      runUntilSettled(healer, 2000);
      expect(healer.regrows, `seed ${seed}`).toBe(0);
    }
  });
});

describe('one gesture is one regrow', () => {
  test('a scribble that keeps erasing after the threshold regrows and announces once, not per pointer move', () => {
    const { ca, healer } = grown(4);
    const n = ca.size;
    let regrowingVerdicts = 0;
    // A drag sends one damage message per pointer move; sweep back and forth across the whole grid.
    for (let pass = 0; pass < 6; pass++) {
      for (let x = 0; x <= n; x += 3) {
        for (const y of [0.2, 0.4, 0.6, 0.8]) {
          if (healer.damage([{ x: pass % 2 ? n - x : x, y: y * n }], 0.12 * n) === 'regrowing') regrowingVerdicts++;
        }
        healer.step(4);
      }
    }
    expect(regrowingVerdicts).toBeLessThanOrEqual(1);
    expect(healer.regrows).toBeLessThanOrEqual(1);
    runUntilSettled(healer, 3000);
    expect(mse(ca)).toBeLessThan(0.01);
  });

  test('a small tap while a regrow is under way does not start another one', () => {
    const { ca, healer } = grown(5);
    expect(healer.damage(eraseBelow(ca, 0.3), 2.5)).toBe('regrowing');
    for (let i = 0; i < 5; i++) healer.step(4);
    expect(healer.damage([{ x: 2, y: 2 }], 2)).not.toBe('regrowing');
    expect(healer.regrows).toBe(1);
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
