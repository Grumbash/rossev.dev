// Records public/replay/pr11-gr.json: the G→R mis-heal from PR #11, re-run from the real round-1
// weights (scripts/nca/gr-round1.bin). Grow GR from one cell, cut it down the middle, let the
// round-1 network regrow it: the G comes back with a lime block, a second R. Frames are quantized to
// the three monogram colours (src/scripts/replay/frames.ts); tests/replay-data.test.ts re-runs them
// exactly and checks the shipped public/nca/gr.bin heals the same cut on the same seed.
//
// Usage: bun scripts/replay/record-gr.ts   (rerun only if the weights, the model or the codec change)
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NeuralCA } from '../../src/scripts/nca/model';
import { decodeWeights } from '../../src/scripts/nca/weights';
import { PALETTE, cut, encodeFrame, mulberry32, quantize } from '../../src/scripts/replay/frames';

const ROOT = resolve(import.meta.dir, '../..');
const WEIGHTS = 'scripts/nca/gr-round1.bin';
const OUT = 'public/replay/pr11-gr.json';

/** Seed 4 shows the mis-heal plainly; the shipped weights heal it (MSE ~2e-4 by the last frame). */
const RNG_SEED = 4;
/** Steps to grow GR before the cut, as tests/nca.test.ts grows it. */
const GROW = 300;
const CUT: [number, number, number, number][] = [[0.5, 0, 0.5, 1]];
/** Steps after the cut at which a frame is kept (0 twice: grown, then just cut). Denser early, when most changes. */
const STEPS = [0, 0, 10, 25, 45, 70, 100, 140, 200, 280, 380, 500, 680, 900, 1200];

const bin = readFileSync(resolve(ROOT, WEIGHTS));
const ca = new NeuralCA(decodeWeights(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)), mulberry32(RNG_SEED));
ca.seed();
ca.step(GROW);

let at = 0;
const frames = STEPS.map((step, i) => {
  if (i === 1) for (const [x0, y0, x1, y1] of CUT) cut(ca, x0, y0, x1, y1);
  if (step > at) ca.step(step - at);
  at = Math.max(at, step);
  return { step, data: encodeFrame(quantize(ca.rgba())) };
});

const rec = {
  size: ca.size,
  palette: PALETTE,
  weights: WEIGHTS,
  source: {
    en: "Pre-fix weights from PR #11, round 1 (recovered from the agent run's working files; not in git before)",
    ru: 'Веса из первого раунда PR #11, до исправления (восстановлены из рабочих файлов прогона агентов; раньше их не было в git)',
  },
  rngSeed: RNG_SEED,
  grow: GROW,
  cut: CUT,
  frames,
};
writeFileSync(resolve(ROOT, OUT), JSON.stringify(rec) + '\n');
console.log(`wrote ${OUT} (${frames.length} frames)`);
