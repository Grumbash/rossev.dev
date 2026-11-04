// Silero VAD v6.2.3 (https://github.com/snakers4/silero-vad, MIT), 16 kHz model, ported from
// silero_vad_16k_op15.onnx so the page needs no ONNX runtime. scripts/vad/export.py documents the
// graph and writes the float16 weights; tests/vad-model.test.ts holds this port to the ONNX
// model's output on fixture audio. One call = one 32 ms chunk (512 samples) -> P(speech).

// [name, element count] in the order export.py writes them.
const LAYOUT: [string, number][] = [
  ['conv1.w', 128 * 129 * 3], ['conv1.b', 128],
  ['conv2.w', 64 * 128 * 3], ['conv2.b', 64],
  ['conv3.w', 64 * 64 * 3], ['conv3.b', 64],
  ['conv4.w', 128 * 64 * 3], ['conv4.b', 128],
  ['lstm.wih', 512 * 128], ['lstm.whh', 512 * 128], ['lstm.bih', 512], ['lstm.bhh', 512],
  ['out.w', 128], ['out.b', 1],
];
export const WEIGHTS_BYTES = LAYOUT.reduce((n, [, size]) => n + size * 2, 0);

const CHUNK = 512;
const CONTEXT = 64;
const WINDOW = 256;
const HOP = 128;
const BINS = WINDOW / 2 + 1;
const FRAMES = 4; // (576 + 64 reflect-padded - 256) / 128 + 1
const HIDDEN = 128;

function halfToFloat(h: number): number {
  const sign = h & 0x8000 ? -1 : 1;
  const exp = (h >> 10) & 0x1f;
  const frac = h & 0x3ff;
  if (exp === 0) return sign * frac * 2 ** -24;
  if (exp === 31) return frac ? NaN : sign * Infinity;
  return sign * (1 + frac / 1024) * 2 ** (exp - 15);
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** Conv1d, kernel 3, padding 1, then ReLU. `x` is [inC][inT] row-major. */
function convRelu(x: Float32Array, inC: number, inT: number, w: Float32Array, b: Float32Array, outC: number, stride: number) {
  const outT = Math.floor((inT - 1) / stride) + 1;
  const y = new Float32Array(outC * outT);
  for (let o = 0; o < outC; o++) {
    for (let t = 0; t < outT; t++) {
      let acc = b[o];
      for (let k = 0; k < 3; k++) {
        const ti = t * stride + k - 1;
        if (ti < 0 || ti >= inT) continue;
        for (let c = 0; c < inC; c++) acc += w[(o * inC + c) * 3 + k] * x[c * inT + ti];
      }
      y[o * outT + t] = acc > 0 ? acc : 0;
    }
  }
  return y;
}

export class SileroVad {
  private readonly w: Record<string, Float32Array> = {};
  private readonly cos = new Float32Array(BINS * WINDOW);
  private readonly sin = new Float32Array(BINS * WINDOW);
  private readonly input = new Float32Array(CONTEXT + CHUNK + CONTEXT);
  private readonly mag = new Float32Array(BINS * FRAMES);
  private readonly gates = new Float32Array(4 * HIDDEN);
  private h = new Float32Array(HIDDEN);
  private c = new Float32Array(HIDDEN);

  constructor(weights: ArrayBuffer) {
    if (weights.byteLength !== WEIGHTS_BYTES) throw new Error(`VAD weights: ${weights.byteLength} B, expected ${WEIGHTS_BYTES}`);
    const half = new DataView(weights);
    let at = 0;
    for (const [name, size] of LAYOUT) {
      const arr = new Float32Array(size);
      for (let i = 0; i < size; i++, at += 2) arr[i] = halfToFloat(half.getUint16(at, true));
      this.w[name] = arr;
    }
    // The STFT basis: periodic Hann window times the DFT (equal to the ONNX buffer to 1e-7).
    for (let n = 0; n < WINDOW; n++) {
      const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / WINDOW);
      for (let f = 0; f < BINS; f++) {
        const a = (2 * Math.PI * f * n) / WINDOW;
        this.cos[f * WINDOW + n] = hann * Math.cos(a);
        this.sin[f * WINDOW + n] = hann * Math.sin(a);
      }
    }
  }

  reset(): void {
    this.input.fill(0);
    this.h = new Float32Array(HIDDEN);
    this.c = new Float32Array(HIDDEN);
  }

  /** P(speech) for the next 512 samples at 16 kHz, in [-1, 1]. Keeps context and LSTM state. */
  process(chunk: Float32Array): number {
    const x = this.input;
    const n = CONTEXT + CHUNK;
    x.copyWithin(0, CHUNK, n); // the previous chunk's last 64 samples
    x.set(chunk.subarray(0, CHUNK), CONTEXT);
    for (let j = 0; j < CONTEXT; j++) x[n + j] = x[n - 2 - j]; // reflect-pad the right edge

    for (let t = 0; t < FRAMES; t++) {
      const start = t * HOP;
      for (let f = 0; f < BINS; f++) {
        let re = 0;
        let im = 0;
        const row = f * WINDOW;
        for (let i = 0; i < WINDOW; i++) {
          re += this.cos[row + i] * x[start + i];
          im += this.sin[row + i] * x[start + i];
        }
        this.mag[f * FRAMES + t] = Math.sqrt(re * re + im * im);
      }
    }

    const w = this.w;
    let y = convRelu(this.mag, BINS, FRAMES, w['conv1.w'], w['conv1.b'], 128, 1);
    y = convRelu(y, 128, 4, w['conv2.w'], w['conv2.b'], 64, 2);
    y = convRelu(y, 64, 2, w['conv3.w'], w['conv3.b'], 64, 2);
    y = convRelu(y, 64, 1, w['conv4.w'], w['conv4.b'], 128, 1);

    // LSTM cell, PyTorch gate order: input, forget, cell, output.
    const g = this.gates;
    const { h, c } = this;
    for (let r = 0; r < 4 * HIDDEN; r++) {
      let acc = w['lstm.bih'][r] + w['lstm.bhh'][r];
      const row = r * HIDDEN;
      for (let i = 0; i < HIDDEN; i++) acc += w['lstm.wih'][row + i] * y[i] + w['lstm.whh'][row + i] * h[i];
      g[r] = acc;
    }
    let out = w['out.b'][0];
    for (let i = 0; i < HIDDEN; i++) {
      c[i] = sigmoid(g[HIDDEN + i]) * c[i] + sigmoid(g[i]) * Math.tanh(g[2 * HIDDEN + i]);
      h[i] = sigmoid(g[3 * HIDDEN + i]) * Math.tanh(c[i]);
      out += w['out.w'][i] * (h[i] > 0 ? h[i] : 0);
    }
    return sigmoid(out);
  }
}
