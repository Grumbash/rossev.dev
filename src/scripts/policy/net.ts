// The learned policy: a tiny MLP decoded from float16 weights. Not implemented yet.
export interface Policy {
  inputs: number;
  outputs: number;
}
const todo = (): never => {
  throw new Error('not implemented');
};
export const decodePolicy = (_buf: ArrayBuffer): Policy => todo();
export const paramCount = (_p: Policy): number => todo();
export const act = (_p: Policy, _obs: Float32Array): { action: number; probs: number[]; logits: number[] } => todo();
