// Recorded GR frames for the topology replay. Not implemented yet: tests/replay-data.test.ts is red first.
import type { NeuralCA } from '../nca/model';

export const PALETTE = ['transparent', '#0A0A0A', '#C8FF00'] as const;

const todo = (): never => {
  throw new Error('not implemented');
};

export const quantize = (_rgba: Float32Array): Uint8Array => todo();
export const encodeFrame = (_idx: Uint8Array): string => todo();
export const decodeFrame = (_data: string, _size: number): Uint8Array => todo();
export const cut = (_ca: NeuralCA, _x0: number, _y0: number, _x1: number, _y1: number): void => todo();
export const mulberry32 = (_seed: number): (() => number) => todo();
