// Below this the remaining camera/explode/flash motion is sub-pixel: safe to stop drawing.
export const SETTLE_EPS = 1e-3;

export interface LoopState {
  reducedMotion: boolean;
  dragging: boolean;
  traceActive: boolean;
  faultActive: boolean;
  // Largest distance any eased value (camera, node explode, node flash) still has to travel.
  residual: number;
}

// Without reduced motion the scene always sways and streams packets, so it never settles.
// With it, the last frame stays on the canvas until an interaction wakes the loop.
export function shouldKeepAnimating(s: LoopState): boolean {
  if (!s.reducedMotion) return true;
  return s.dragging || s.traceActive || s.faultActive || s.residual > SETTLE_EPS;
}

// Distance still to travel: camera [current, target] pairs, node explode (1 for the locked node,
// 0 elsewhere) and node flash (decays to 0).
export function settleResidual(
  camera: [number, number][],
  explode: number[],
  flash: number[],
  lockedNode: number
): number {
  let r = 0;
  for (const [cur, target] of camera) r = Math.max(r, Math.abs(target - cur));
  for (let i = 0; i < explode.length; i++) r = Math.max(r, Math.abs((lockedNode === i ? 1 : 0) - explode[i]));
  for (const f of flash) r = Math.max(r, f);
  return r;
}
