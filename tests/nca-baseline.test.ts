// The recovery guard judges "grown" against the GR training target, but the page does not ship
// the target image: it ships the target's signature, generated into src/scripts/nca/baseline.ts.
// That file must be exactly what scripts/nca/gen-baseline.ts computes from scripts/nca/target.json
// (re-run it after retraining), and a clean grown GR must pass the shape check against it.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { GR_BASELINE } from '../src/scripts/nca/baseline';
import { targetBaseline } from '../scripts/nca/gen-baseline';
import { NeuralCA } from '../src/scripts/nca/model';
import { decodeWeights } from '../src/scripts/nca/weights';
import { createHealer } from '../src/scripts/nca/healer';

describe('the shipped GR baseline', () => {
  test('equals the signature recomputed from target.json at the model alive threshold', () => {
    expect(GR_BASELINE).toEqual(targetBaseline());
  });

  test('is a GR: two letters on a 56-cell grid, the R on a lime block', () => {
    expect(GR_BASELINE.size).toBe(56);
    expect(GR_BASELINE.alive).toBeGreaterThan(900);
    const greenRight = GR_BASELINE.green.filter((_, k) => k % 4 >= 2).reduce((a, b) => a + b, 0);
    const greenLeft = GR_BASELINE.green.filter((_, k) => k % 4 < 2).reduce((a, b) => a + b, 0);
    expect(greenRight).toBeGreaterThan(10 * greenLeft);
  });

  test('a clean grown GR is judged grown against it: watched again, it settles with no regrow', () => {
    const bin = readFileSync('public/nca/gr.bin');
    const weights = decodeWeights(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
    const target: number[] = JSON.parse(readFileSync('scripts/nca/target.json', 'utf8')).rgba;
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    let clean = 0;
    for (let i = 0; i < 8; i++) {
      const ca = new NeuralCA(weights, rng);
      const healer = createHealer(ca);
      healer.grow();
      const out = ca.rgba();
      let mse = 0;
      for (let k = 0; k < out.length; k++) mse += (out[k] - target[k]) ** 2;
      if (mse / out.length >= 0.002) continue;
      clean++;
      healer.damage([], 0); // nothing erased: just watch it again
      let steps = 0;
      while (healer.step(4) !== 'settled' && steps < 2000) steps += 4;
      expect(healer.regrows).toBe(0);
      expect(steps).toBeLessThan(400);
    }
    expect(clean).toBeGreaterThan(4);
  }, 60_000);

  test('a healer refuses a baseline with no live cells instead of looping on it', () => {
    const bin = readFileSync('public/nca/gr.bin');
    const ca = new NeuralCA(decodeWeights(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)));
    expect(() => createHealer(ca, { baseline: { ...GR_BASELINE, alive: 0 } })).toThrow();
  });
});
