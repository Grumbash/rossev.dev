// Recorded GR frames for the topology replay: a grown monogram, a cut, and what the
// network regrew, quantized to the three monogram colours and packed 2 bits per pixel.
// Small and dependency-free: the page decodes these lazily in the browser.
import type { NeuralCA } from '../nca/model';

/** Palette index → colour: 0 empty, 1 near-black (the letters), 2 lime (the block behind R). */
export const PALETTE = ['transparent', '#0A0A0A', '#C8FF00'] as const;

// Opaque palette colours as linear 0..1 RGB, matched against the un-premultiplied pixel.
const INK: [number, number, number][] = [
  [0x0a / 255, 0x0a / 255, 0x0a / 255],
  [0xc8 / 255, 0xff / 255, 0x00 / 255],
];
/** Below this alpha a pixel reads as empty. */
const ALPHA_CUTOFF = 0.3;

/** Premultiplied RGBA (row-major, 4 floats per pixel) → one palette index per pixel. */
export function quantize(rgba: Float32Array): Uint8Array {
  const out = new Uint8Array(rgba.length >> 2);
  for (let i = 0; i < out.length; i++) {
    const a = rgba[i * 4 + 3];
    if (!(a >= ALPHA_CUTOFF)) continue;
    let best = 0;
    let bestD = Infinity;
    for (let k = 0; k < INK.length; k++) {
      let d = 0;
      for (let c = 0; c < 3; c++) d += (rgba[i * 4 + c] / a - INK[k][c]) ** 2;
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    out[i] = best + 1;
  }
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Palette indices → base64 of 2 bits per pixel, first pixel in the high bits of each byte. */
export function encodeFrame(idx: Uint8Array): string {
  const bytes = new Uint8Array(Math.ceil(idx.length / 4));
  for (let i = 0; i < idx.length; i++) bytes[i >> 2] |= (idx[i] & 3) << (6 - 2 * (i & 3));
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    s += B64[n >> 18] + B64[(n >> 12) & 63];
    s += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    s += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return s;
}

/** Inverse of encodeFrame for a size×size frame. */
export function decodeFrame(data: string, size: number): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    const v = [0, 1, 2, 3].map((k) => (data[i + k] === '=' ? -1 : B64.indexOf(data[i + k])));
    const n = (v[0] << 18) | (v[1] << 12) | (Math.max(v[2], 0) << 6) | Math.max(v[3], 0);
    bytes.push(n >> 16);
    if (v[2] >= 0) bytes.push((n >> 8) & 255);
    if (v[3] >= 0) bytes.push(n & 255);
  }
  const out = new Uint8Array(size * size);
  for (let i = 0; i < out.length; i++) out[i] = ((bytes[i >> 2] ?? 0) >> (6 - 2 * (i & 3))) & 3;
  return out;
}

/**
 * A drag across the monogram, in 0..1 coordinates: the brush (radius 0.12·size)
 * stamped every ~3 cells along the line, the way the pointer handler stamps it.
 */
export function cut(ca: NeuralCA, x0: number, y0: number, x1: number, y1: number): void {
  const n = ca.size;
  const len = Math.hypot(x1 - x0, y1 - y0) * n;
  const stamps = Math.ceil(len / 3);
  for (let i = 0; i <= stamps; i++) {
    const t = i / stamps;
    ca.damage((x0 + (x1 - x0) * t) * n, (y0 + (y1 - y0) * t) * n, 0.12 * n);
  }
}

/** Seeded PRNG (mulberry32): the browser seeds from Math.random, tests and the recorder from this. */
export function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
