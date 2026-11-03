// Decodes public/nca/gr.bin, the float16 weights file written by scripts/nca/train.py.
// Little-endian:
//   "NCA1"                                  4-byte magic
//   uint16 size, channels, hidden           6 bytes
//   float32 fireRate, aliveThreshold        8 bytes
//   float16 w1 [hidden][3*channels], b1 [hidden], w2 [channels][hidden]
import type { NcaWeights } from './model';

const MAGIC = 'NCA1';
const HEADER_BYTES = 18;

export function decodeWeights(buf: ArrayBuffer): NcaWeights {
  const view = new DataView(buf);
  const magic = String.fromCharCode(...new Uint8Array(buf, 0, 4));
  if (magic !== MAGIC) throw new Error(`weights: bad magic ${JSON.stringify(magic)}`);
  const size = view.getUint16(4, true);
  const channels = view.getUint16(6, true);
  const hidden = view.getUint16(8, true);
  const fireRate = view.getFloat32(10, true);
  const aliveThreshold = view.getFloat32(14, true);

  const n1 = hidden * 3 * channels;
  const n2 = channels * hidden;
  if (buf.byteLength !== HEADER_BYTES + 2 * (n1 + hidden + n2)) throw new Error('weights: wrong length');
  let offset = HEADER_BYTES;
  const read = (n: number): number[] => {
    const out = new Array<number>(n);
    for (let i = 0; i < n; i++, offset += 2) out[i] = halfToFloat(view.getUint16(offset, true));
    return out;
  };
  const w1 = read(n1);
  const b1 = read(hidden);
  const w2 = read(n2);
  return { size, channels, hidden, fireRate, aliveThreshold, w1, b1, w2 };
}

/** IEEE 754 binary16 bits to a number (exact). */
export function halfToFloat(h: number): number {
  const sign = h & 0x8000 ? -1 : 1;
  const exp = (h >> 10) & 0x1f;
  const frac = h & 0x3ff;
  if (exp === 0) return sign * frac * 2 ** -24; // zero and subnormals
  if (exp === 0x1f) return frac ? NaN : sign * Infinity;
  return sign * (1 + frac / 1024) * 2 ** (exp - 15);
}
