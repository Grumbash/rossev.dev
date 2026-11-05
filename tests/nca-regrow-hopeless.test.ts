// More of the recovery guard on the shipped weights; the story is in nca-regrow.test.ts.
import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { eraseBelow, grown, mse } from './fixtures/nca-regrow';

setDefaultTimeout(60_000);

// The same judge: losses leaving 42-63% alive never heal (lost by step ~200: distance 0.32,
// MSE 0.056), yet the guard waited out the whole 1000-step deadline before regrowing.
describe('a hopeless heal is given up early', () => {
  for (const keep of [0.5, 0.55, 0.6]) {
    test(`keeping the top ${Math.round(keep * 100)}%: regrows within ~10 s, once, and ends clean`, () => {
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const { ca, healer } = grown(seed);
        healer.damage(eraseBelow(ca, keep), 2.5);
        let decidedAt = -1;
        for (let steps = 4; steps <= 4000; steps += 4) {
          const s = healer.step(4);
          if (decidedAt < 0 && (s === 'settled' || s === 'regrowing')) decidedAt = steps;
          if (s === 'settled') break;
        }
        expect(decidedAt, `seed ${seed}`).toBeGreaterThan(0);
        expect(decidedAt, `seed ${seed}`).toBeLessThanOrEqual(400);
        expect(healer.regrows, `seed ${seed}`).toBeLessThanOrEqual(1);
        expect(mse(ca), `seed ${seed}`).toBeLessThan(0.005);
      }
    });
  }
});
