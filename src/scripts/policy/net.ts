// The learned policy: a tiny MLP (ReLU between layers) decoded from public/policy/policy.bin, the
// float16 weights file written by scripts/policy/train.py. Pure, no DOM: the page, the tests and the
// DAgger exporter run the same forward pass. Little-endian:
//   "POL1"                         4-byte magic
//   uint16 layers                  number of weight layers L
//   uint16 dims[L + 1]             inputs, hidden…, outputs
//   per layer: float16 w [out][in], b [out]
import { halfToFloat } from '../nca/weights';

export interface Layer {
  inputs: number;
  outputs: number;
  w: Float32Array;
  b: Float32Array;
}
export interface Policy {
  inputs: number;
  outputs: number;
  layers: Layer[];
}

const MAGIC = 'POL1';

export function decodePolicy(buf: ArrayBuffer): Policy {
  const view = new DataView(buf);
  const magic = String.fromCharCode(...new Uint8Array(buf, 0, 4));
  if (magic !== MAGIC) throw new Error(`policy: bad magic ${JSON.stringify(magic)}`);
  const n = view.getUint16(4, true);
  const dims = Array.from({ length: n + 1 }, (_, i) => view.getUint16(6 + 2 * i, true));
  let offset = 6 + 2 * (n + 1);
  const read = (count: number) => {
    const out = new Float32Array(count);
    for (let i = 0; i < count; i++, offset += 2) out[i] = halfToFloat(view.getUint16(offset, true));
    return out;
  };
  const layers: Layer[] = [];
  for (let l = 0; l < n; l++) {
    const inputs = dims[l];
    const outputs = dims[l + 1];
    if (offset + 2 * (inputs * outputs + outputs) > buf.byteLength) throw new Error('policy: truncated');
    layers.push({ inputs, outputs, w: read(inputs * outputs), b: read(outputs) });
  }
  if (offset !== buf.byteLength) throw new Error('policy: wrong length');
  return { inputs: dims[0], outputs: dims[n], layers };
}

export const paramCount = (p: Policy): number => p.layers.reduce((a, l) => a + l.w.length + l.b.length, 0);

/** Logits, softmax probabilities and the argmax action for one observation. */
export function act(p: Policy, obs: Float32Array): { action: number; probs: number[]; logits: number[] } {
  let x: ArrayLike<number> = obs;
  p.layers.forEach((l, li) => {
    const y = new Array<number>(l.outputs);
    for (let o = 0; o < l.outputs; o++) {
      let v = l.b[o];
      const row = o * l.inputs;
      for (let i = 0; i < l.inputs; i++) v += l.w[row + i] * x[i];
      y[o] = li < p.layers.length - 1 ? Math.max(0, v) : v;
    }
    x = y;
  });
  const logits = Array.from(x);
  const max = Math.max(...logits);
  const exps = logits.map((v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  const probs = exps.map((e) => e / sum);
  return { action: logits.indexOf(max), probs, logits };
}
