// More of the recovery guard on the shipped weights; the story is in nca-regrow.test.ts.
import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { eraseBelow, grown, mse, mulberry32, runUntilSettled } from './fixtures/nca-regrow';

setDefaultTimeout(60_000);

// The final judge: ~6% of silent first grows come out crooked, which is what forced a fragile
// "heal back to the crooked start" exception. The first grow is invisible (the static SVG is up),
// so a crooked one is simply grown again before anything is shown: the page never starts crooked.
describe('the page never starts from a crooked GR', () => {
  test('on the seeds whose first grow came out crooked or with a swinging box, grow() ends clean, with no visible regrow', () => {
    for (const seed of [25, 109, 168, 182, 203, 213, 260, 275, 278, 281, 301, 308, 372]) {
      const { ca, healer } = grown(seed);
      expect(mse(ca), `seed ${seed}`).toBeLessThan(0.005);
      expect(healer.regrows, `seed ${seed}`).toBe(0);
    }
  });

  test('a bite on those seeds then heals clean, in place', () => {
    for (const seed of [25, 203, 260, 278, 301]) {
      const { ca, healer } = grown(seed);
      healer.damage([{ x: 0.3 * ca.size, y: 0.5 * ca.size }], 0.15 * ca.size);
      runUntilSettled(healer, 2000);
      expect(healer.regrows, `seed ${seed}`).toBe(0);
      expect(mse(ca), `seed ${seed}`).toBeLessThan(0.005);
    }
  });
});

// The final judge also froze a heal mid-way: at the deadline a frame that only just passed the
// shape check was settled while still changing (seed 54, bite after a wipe: MSE 0.0072 left on
// screen, 0.0003 had it kept going).
describe('a heal is never frozen half-done at the deadline', () => {
  test('seed 54: bite, cut, wipe, bite, bite ends every settle as a clean GR', () => {
    const { ca, healer } = grown(54);
    const n = ca.size;
    const rnd = mulberry32(54 * 97 + 3);
    const line = (x0: number, y0: number, x1: number, y1: number) =>
      Array.from({ length: 41 }, (_, i) => ({ x: (x0 + ((x1 - x0) * i) / 40) * n, y: (y0 + ((y1 - y0) * i) / 40) * n }));
    const bite = () => healer.damage([{ x: (0.2 + rnd() * 0.6) * n, y: (0.3 + rnd() * 0.4) * n }], 0.18 * n);
    const steps: [string, () => unknown][] = [
      ['bite', bite],
      ['vcut', () => healer.damage(line(0.5, 0, 0.5, 1), 0.12 * n)],
      ['wipe', () => healer.damage(eraseBelow(ca, 0), 0.12 * n)],
      ['bite', bite],
      ['bite', bite],
    ];
    for (const [name, act] of steps) {
      act();
      runUntilSettled(healer, 8000);
      expect(mse(ca), name).toBeLessThan(0.005);
    }
  });
});
