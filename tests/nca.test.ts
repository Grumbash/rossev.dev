// The neural cellular automaton grows the GR monogram from one cell and
// regrows it after damage. This runs the same NeuralCA the browser runs, on the
// shipped weights, against the target the model was trained on.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { NeuralCA, type NcaWeights } from '../src/scripts/nca/model';
import { decodeWeights } from '../src/scripts/nca/weights';
// The browser seeds from Math.random; tests use a fixed stream (mulberry32) so a run is repeatable.
import { cut, mulberry32 } from '../src/scripts/replay/frames';

// The page ships the weights as a compact binary; the tests run exactly what it decodes.
const bin = readFileSync('public/nca/gr.bin');
const weights: NcaWeights = decodeWeights(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
const target: { size: number; rgba: number[] } = JSON.parse(
  readFileSync('scripts/nca/target.json', 'utf8')
);

function mse(ca: NeuralCA): number {
  const out = ca.rgba();
  let sum = 0;
  for (let i = 0; i < out.length; i++) sum += (out[i] - target.rgba[i]) ** 2;
  return sum / out.length;
}

function grown(seed: number): NeuralCA {
  const ca = new NeuralCA(weights, mulberry32(seed));
  ca.seed();
  ca.step(300);
  return ca;
}

describe('NeuralCA on the GR weights', () => {
  test('the grid and the target are the same size', () => {
    const ca = new NeuralCA(weights);
    expect(ca.size).toBe(target.size);
    expect(ca.rgba().length).toBe(target.size * target.size * 4);
  });

  test('grows GR from a single seed cell', () => {
    const ca = new NeuralCA(weights, mulberry32(1));
    ca.seed();
    expect(mse(ca)).toBeGreaterThan(0.02);
    ca.step(300);
    expect(mse(ca)).toBeLessThan(0.01);
  });

  const spots: [string, number, number][] = [
    ['centre', 0.5, 0.5],
    ['left edge', 0.3, 0.5],
    ['lower right', 0.65, 0.7],
  ];

  for (const [name, fx, fy] of spots) {
    test(`regrows after a bite out of the ${name}`, () => {
      const ca = grown(2);
      const n = ca.size;
      ca.damage(fx * n, fy * n, 0.2 * n);
      expect(mse(ca)).toBeGreaterThan(0.01);
      ca.step(300);
      expect(mse(ca)).toBeLessThan(0.01);
    });
  }

  // The page invites a drag, not a bite: a stroke is the brush stamped every
  // few cells along a line, the way the pointer handler stamps it (cut() in frames.ts).
  const stroke = cut;

  const strokes: [string, [number, number, number, number][]][] = [
    ['a vertical cut between the letters', [[0.5, 0, 0.5, 1]]],
    ['a horizontal cut through both letters', [[0, 0.5, 1, 0.5]]],
    ['a diagonal slash', [[0.1, 0.2, 0.9, 0.8]]],
    ['three separate scribbles', [[0.25, 0.35, 0.35, 0.45], [0.6, 0.6, 0.7, 0.5], [0.45, 0.3, 0.5, 0.7]]],
  ];

  for (const [name, lines] of strokes) {
    test(`heals ${name}`, () => {
      for (const seed of [5, 6, 7]) {
        const ca = grown(seed);
        for (const [x0, y0, x1, y1] of lines) stroke(ca, x0, y0, x1, y1);
        expect(mse(ca)).toBeGreaterThan(0.01);
        ca.step(600);
        expect(mse(ca)).toBeLessThan(0.01);
      }
    }, 300_000); // a hang guard, not a speed check (CI: nca.yml)
  }

  test('stays stable long after it has grown', () => {
    const ca = grown(3);
    ca.step(1000);
    expect(mse(ca)).toBeLessThan(0.015);
  }, 300_000); // a hang guard, not a speed check (CI: nca.yml)

  test('100 steps run in under two seconds on one CPU core', () => {
    const ca = new NeuralCA(weights, mulberry32(4));
    ca.seed();
    const t0 = performance.now();
    ca.step(100);
    expect(performance.now() - t0).toBeLessThan(2000);
  });

  test('the shipped weights stay small', () => {
    expect(readFileSync('public/nca/gr.bin').length).toBeLessThan(150_000);
  });
});
