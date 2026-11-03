// The neural cellular automaton grows the GR monogram from one cell and
// regrows it after damage. This runs the same NeuralCA the browser runs, on the
// shipped weights, against the target the model was trained on.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { NeuralCA, type NcaWeights } from '../src/scripts/nca/model';

const weights: NcaWeights = JSON.parse(readFileSync('public/nca/gr.json', 'utf8'));
const target: { size: number; rgba: number[] } = JSON.parse(
  readFileSync('scripts/nca/target.json', 'utf8')
);

// The browser seeds from Math.random; tests use a fixed stream so a run is repeatable.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

  test('stays stable long after it has grown', () => {
    const ca = grown(3);
    ca.step(1000);
    expect(mse(ca)).toBeLessThan(0.015);
  });

  test('100 steps run in under two seconds on one CPU core', () => {
    const ca = new NeuralCA(weights, mulberry32(4));
    ca.seed();
    const t0 = performance.now();
    ca.step(100);
    expect(performance.now() - t0).toBeLessThan(2000);
  });

  test('the shipped weights stay small', () => {
    expect(readFileSync('public/nca/gr.json').length).toBeLessThan(150_000);
  });
});
