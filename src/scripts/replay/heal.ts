// The visitor's own cut on the replay's mini GR, run on the real, shipped model (public/nca/gr.bin,
// the GR monogram's weights) right here in the replay chunk. Grows the monogram once (again if it
// came out crooked, as the GR monogram does: ../nca/healer.ts grow()), then for each
// cut: the same brush the recorded frames used (./frames.ts cut), HEAL_STEPS steps in small batches
// that each stop after BATCH_MS so the page never stalls, a palette frame after every batch, and the
// error against the uncut monogram at the end.
import { NeuralCA } from '../nca/model';
import { decodeWeights } from '../nca/weights';
import { grownCleanly, measureShape, SILENT_GROW_RETRIES } from '../nca/healer';
import { cut, quantize } from './frames';

const GROW_STEPS = 300;
/** Bounded, so every cut gets a verdict: healing a cut takes up to ~600 steps on the shipped weights. */
const HEAL_STEPS = 600;
/** Main-thread time per batch: well under a 50 ms long task, even on a phone. */
const BATCH_MS = 12;

const yieldNow = () => new Promise<void>((r) => setTimeout(r, 0));

/** Steps in batches of up to BATCH_MS (at least one step each), yielding between them. Returns false
 * if `stop` cut it short. */
async function stepFor(ca: NeuralCA, steps: number, onBatch?: () => void, stop = () => false): Promise<boolean> {
  let left = steps;
  while (left > 0) {
    if (stop()) return false;
    const until = performance.now() + BATCH_MS;
    do {
      ca.step(1);
      left--;
    } while (left > 0 && performance.now() < until);
    onBatch?.();
    await yieldNow();
  }
  return !stop();
}

export function createHealer(weightsUrl: string) {
  let ready: Promise<{ ca: NeuralCA; grown: Float32Array }> | null = null;
  let job = 0;

  return {
    cancel: () => void job++,
    /** Applies the strokes (0..1 coordinates) and regrows. A newer cut (or cancel) stops this one: null. */
    async cut(
      strokes: [number, number, number, number][],
      onFrame: (idx: Uint8Array) => void
    ): Promise<{ mse: number } | null> {
      // Taken before any await: a cancel() while the weights load or the GR grows must still win.
      const mine = ++job;
      const stale = () => mine !== job;
      ready ??= fetch(weightsUrl)
        .then((res) => {
          if (!res.ok) throw new Error(`weights: HTTP ${res.status}`);
          return res.arrayBuffer();
        })
        .then(async (buf) => {
          const ca = new NeuralCA(decodeWeights(buf));
          // Every cut is judged against this frame: a crooked one would score a clean heal as unhealed.
          for (let tries = 0; ; tries++) {
            ca.seed();
            await stepFor(ca, GROW_STEPS);
            const grown = ca.rgba();
            if (tries >= SILENT_GROW_RETRIES || grownCleanly(measureShape(grown, ca.size, ca.aliveThreshold))) return { ca, grown };
          }
        });
      const { ca, grown } = await ready;
      if (stale()) return null;
      for (const [x0, y0, x1, y1] of strokes) cut(ca, x0, y0, x1, y1);
      if (!(await stepFor(ca, HEAL_STEPS, () => onFrame(quantize(ca.rgba())), stale))) return null;
      const rgba = ca.rgba();
      let sum = 0;
      for (let i = 0; i < rgba.length; i++) sum += (rgba[i] - grown[i]) ** 2;
      return { mse: sum / rgba.length };
    },
  };
}
