// More of the recovery guard on the shipped weights; the story is in nca-regrow.test.ts.
import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { grown, mse, mulberry32, runUntilSettled } from './fixtures/nca-regrow';

setDefaultTimeout(60_000);

// A third judge: the "heal looks like the pre-damage frame" escape hatch ratchets. A heal accepted
// only because it resembles the previous rest frame becomes the new rest frame, so a clean GR walks
// into a crooked one bite by bite and stays there (seed 21: MSE 0.0007 → 0.0059 at bite 2, kept for
// 10 more bites; seed 10: one vertical cut settles at MSE 0.0139). Whatever a heal settles on must
// be a clean GR, or the guard regrows.
describe('a sequence of damage never settles on a crooked GR', () => {
  test('random bites on seeds 4, 10 and 21: every settle without a regrow is a clean GR', () => {
    for (const seed of [4, 10, 21]) {
      const rnd = mulberry32(seed * 31 + 7);
      const { ca, healer } = grown(seed);
      for (let k = 0; k < 12; k++) {
        const r = (0.12 + rnd() * 0.08) * ca.size;
        healer.damage([{ x: (0.15 + rnd() * 0.7) * ca.size, y: (0.25 + rnd() * 0.5) * ca.size }], r);
        runUntilSettled(healer, 5000);
        expect(mse(ca), `seed ${seed} bite ${k}`).toBeLessThan(0.005);
      }
    }
  });

  test('a vertical cut down the middle on seed 10 ends as a clean GR', () => {
    const { ca, healer } = grown(10);
    const cut: { x: number; y: number }[] = [];
    for (let i = 0; i <= 40; i++) cut.push({ x: 0.5 * ca.size, y: (i / 40) * ca.size });
    healer.damage(cut, 0.12 * ca.size);
    runUntilSettled(healer, 5000);
    expect(mse(ca)).toBeLessThan(0.005);
  });
});
