// Neural cellular automaton inference (Mordvintsev et al., "Growing Neural
// Cellular Automata", Distill 2020). Every cell holds `channels` floats: RGBA
// (premultiplied, alpha in channel 3) and hidden state. One step:
//   1. perceive: each channel through identity, Sobel-x and Sobel-y 3x3
//      filters (cross-correlation, zero padding), giving 3*channels inputs
//      ordered channel-major (c*3 + filter);
//   2. a random subset of cells (probability fireRate) adds
//      w2 · relu(w1 · perception + b1) to its state;
//   3. a cell survives only if its 3x3 neighbourhood held a cell with
//      alpha > aliveThreshold before the update and also holds one after it
//      (not necessarily the same neighbour; updated, unmasked alphas count).
// This mirrors NCA.step in scripts/nca/train.py exactly; change both or neither.

export interface NcaWeights {
  size: number;
  channels: number;
  hidden: number;
  fireRate: number;
  aliveThreshold: number;
  /** hidden × (3·channels), row-major */
  w1: number[];
  b1: number[];
  /** channels × hidden, row-major */
  w2: number[];
}

const ALPHA = 3;

export class NeuralCA {
  readonly size: number;
  private readonly ch: number;
  private readonly hidden: number;
  private readonly fireRate: number;
  private readonly aliveThreshold: number;
  // Weights are rounded to float32, the precision torch trained them in, then
  // held as doubles: mixing float32 loads into double arithmetic is slower.
  private readonly w1: Float64Array;
  private readonly b1: Float64Array;
  private readonly w2: Float64Array;
  private readonly rng: () => number;

  private state: Float32Array;
  private next: Float32Array;
  private readonly preAlive: Uint8Array;
  private readonly postAlive: Uint8Array;
  private readonly region: Uint8Array;
  private readonly perception: Float64Array;
  private readonly h: Float64Array;
  private readonly on: Int32Array;

  constructor(weights: NcaWeights, rng: () => number = Math.random) {
    const { size, channels, hidden } = weights;
    if (weights.w1.length !== hidden * 3 * channels || weights.b1.length !== hidden || weights.w2.length !== channels * hidden) {
      throw new Error('NeuralCA: weight shapes do not match size/channels/hidden');
    }
    this.size = size;
    this.ch = channels;
    this.hidden = hidden;
    this.fireRate = weights.fireRate;
    this.aliveThreshold = weights.aliveThreshold;
    this.w1 = asFloat32Doubles(weights.w1);
    this.b1 = asFloat32Doubles(weights.b1);
    this.w2 = asFloat32Doubles(weights.w2);
    this.rng = rng;

    this.state = new Float32Array(size * size * channels);
    this.next = new Float32Array(size * size * channels);
    this.preAlive = new Uint8Array(size * size);
    this.postAlive = new Uint8Array(size * size);
    this.region = new Uint8Array(size * size);
    this.perception = new Float64Array(3 * channels);
    this.h = new Float64Array(hidden);
    this.on = new Int32Array(hidden);
  }

  /** Empty grid with one live cell in the centre: alpha and hidden channels at 1. */
  seed(): void {
    this.state.fill(0);
    const c = Math.floor(this.size / 2);
    const base = (c * this.size + c) * this.ch;
    for (let k = ALPHA; k < this.ch; k++) this.state[base + k] = 1;
  }

  /** Zero every channel of the cells whose centre (x+0.5, y+0.5) lies inside the circle. */
  damage(cx: number, cy: number, r: number): void {
    const { size, ch, state } = this;
    const r2 = r * r;
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(size - 1, Math.ceil(cy + r));
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(size - 1, Math.ceil(cx + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy < r2) state.fill(0, (y * size + x) * ch, (y * size + x + 1) * ch);
      }
    }
  }

  step(n = 1): void {
    for (let i = 0; i < n; i++) this.stepOnce();
  }

  /** RGBA in 0..1 (premultiplied alpha), row-major, size*size*4. Pass `out` to reuse a buffer. */
  rgba(out: Float32Array = new Float32Array(this.size * this.size * 4)): Float32Array {
    const { state, ch } = this;
    const cells = this.size * this.size;
    for (let i = 0; i < cells; i++) {
      for (let k = 0; k < 4; k++) {
        const v = state[i * ch + k];
        out[i * 4 + k] = v < 0 ? 0 : v > 1 ? 1 : v;
      }
    }
    return out;
  }

  /** Writes 1 into `mask` for every cell with alpha > threshold somewhere in its 3x3 neighbourhood. */
  private aliveMask(src: Float32Array, mask: Uint8Array): void {
    const { size, ch, aliveThreshold } = this;
    mask.fill(0);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (src[(y * size + x) * ch + ALPHA] > aliveThreshold) markNeighbourhood(mask, size, x, y);
      }
    }
  }

  private stepOnce(): void {
    const { size, ch, state, next, preAlive, postAlive, region } = this;
    this.aliveMask(state, preAlive);

    // Only cells in the pre-alive mask can survive the step, and a survivor's
    // post-update check reads its neighbours' updated alpha. So the update is
    // needed on the pre-alive cells plus a one-cell ring around them; the rest
    // of the grid ends the step at zero whatever the network would say.
    region.fill(0);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) if (preAlive[y * size + x]) markNeighbourhood(region, size, x, y);
    }

    next.fill(0);
    for (let cell = 0; cell < size * size; cell++) {
      if (!region[cell]) continue;
      const base = cell * ch;
      if (this.rng() < this.fireRate) this.update(cell, next);
      else next.set(state.subarray(base, base + ch), base);
    }

    // Keep a cell only where it was alive before and has a live neighbour after.
    // The post mask is built in full before any zeroing, since zeroing in place
    // would hide a neighbour's updated alpha from the cells checked after it.
    this.aliveMask(next, postAlive);
    for (let cell = 0; cell < size * size; cell++) {
      if (region[cell] && !(preAlive[cell] && postAlive[cell])) next.fill(0, cell * ch, (cell + 1) * ch);
    }
    this.next = state;
    this.state = next;
  }

  /** dst[cell] = state[cell] + w2 · relu(w1 · perceive(state, cell) + b1). */
  private update(cell: number, dst: Float32Array): void {
    const { size, ch, hidden, w1, b1, w2, state, perception: p, h, on } = this;
    const nIn = 3 * ch;
    const y = Math.floor(cell / size);
    const x = cell - y * size;
    const base = cell * ch;

    // Perception. Out-of-grid neighbours read as zero.
    const up = y > 0 ? base - size * ch : -1;
    const down = y < size - 1 ? base + size * ch : -1;
    const hasL = x > 0;
    const hasR = x < size - 1;
    for (let c = 0; c < ch; c++) {
      const tl = up >= 0 && hasL ? state[up - ch + c] : 0;
      const t = up >= 0 ? state[up + c] : 0;
      const tr = up >= 0 && hasR ? state[up + ch + c] : 0;
      const l = hasL ? state[base - ch + c] : 0;
      const r = hasR ? state[base + ch + c] : 0;
      const bl = down >= 0 && hasL ? state[down - ch + c] : 0;
      const b = down >= 0 ? state[down + c] : 0;
      const br = down >= 0 && hasR ? state[down + ch + c] : 0;
      p[c * 3] = state[base + c];
      p[c * 3 + 1] = (tr + 2 * r + br - tl - 2 * l - bl) / 8;
      p[c * 3 + 2] = (bl + 2 * b + br - tl - 2 * t - tr) / 8;
    }

    // Dense layers. Several accumulators per dot product: a single running sum is
    // bound by floating-point add latency, and this loop is nearly all the cost.
    let active = 0;
    for (let j = 0; j < hidden; j++) {
      const row = j * nIn;
      let s0 = b1[j], s1 = 0, s2 = 0, s3 = 0, s4 = 0, s5 = 0, s6 = 0, s7 = 0;
      let i = 0;
      for (; i + 7 < nIn; i += 8) {
        const r = row + i;
        s0 += w1[r] * p[i];
        s1 += w1[r + 1] * p[i + 1];
        s2 += w1[r + 2] * p[i + 2];
        s3 += w1[r + 3] * p[i + 3];
        s4 += w1[r + 4] * p[i + 4];
        s5 += w1[r + 5] * p[i + 5];
        s6 += w1[r + 6] * p[i + 6];
        s7 += w1[r + 7] * p[i + 7];
      }
      for (; i < nIn; i++) s0 += w1[row + i] * p[i];
      const v = s0 + s1 + s2 + s3 + s4 + s5 + s6 + s7;
      if (v > 0) {
        h[active] = v; // relu: only positive units reach the output layer
        on[active++] = j;
      }
    }
    for (let c = 0; c < ch; c++) {
      const row = c * hidden;
      let s0 = 0, s1 = 0;
      let k = 0;
      for (; k + 1 < active; k += 2) {
        s0 += w2[row + on[k]] * h[k];
        s1 += w2[row + on[k + 1]] * h[k + 1];
      }
      if (k < active) s0 += w2[row + on[k]] * h[k];
      dst[base + c] = state[base + c] + s0 + s1;
    }
  }
}

function asFloat32Doubles(values: number[]): Float64Array {
  return Float64Array.from(Float32Array.from(values));
}

/** Sets mask to 1 on the 3x3 block around (x, y), clipped to the grid. */
function markNeighbourhood(mask: Uint8Array, size: number, x: number, y: number): void {
  for (let yy = Math.max(0, y - 1); yy <= Math.min(size - 1, y + 1); yy++) {
    for (let xx = Math.max(0, x - 1); xx <= Math.min(size - 1, x + 1); xx++) mask[yy * size + xx] = 1;
  }
}
