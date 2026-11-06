// Shadows from real light. The hard shadows (--shadow-sm/md/lg in brutalism.css) are offset by --lx
// and --ly, 1 and 1 without JS. Here the cursor is the light: shadows fall away from it, always the
// same length, and with the cursor in the middle of the screen they fall down-right as before. On a
// phone the tilt is the light, where the browser gives it without a permission prompt (not iOS: a
// prompt for a shadow is too much). Loaded on the first pointer move; still under reduced motion.

// Toward down-right: the middle of the screen keeps the shadows where they always were.
const BIAS = 0.3;

/** The shadow for a light at `nx`, `ny` from the middle (-1…1 each way): √2 long, away from it. */
function away(nx: number, ny: number) {
  const x = BIAS - nx;
  const y = BIAS - ny;
  const k = Math.SQRT2 / (Math.hypot(x, y) || 1);
  return { x: x * k, y: y * k };
}

/** The shadow offset (×1 is the usual one) for a cursor at `px`, `py` on a `w` × `h` screen. */
export const light = (px: number, py: number, w: number, h: number) => away((2 * px) / w - 1, (2 * py) / h - 1);

const clamp = (v: number) => Math.max(-1, Math.min(1, v));
/** The same for a phone tilted `beta` toward the reader (45° is how it is usually held) and `gamma` sideways. */
export const tilt = (beta: number, gamma: number) => away(clamp(gamma / 40), clamp((beta - 45) / 40));

/** `first`: the pointer move that loaded this module, so the light starts where the cursor is. */
export function initLight(first?: PointerEvent) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const root = document.documentElement.style;
  let next: { x: number; y: number } | null = null;
  const set = (v: { x: number; y: number }) => {
    if (!next) requestAnimationFrame(() => {
      root.setProperty('--lx', next!.x.toFixed(2));
      root.setProperty('--ly', next!.y.toFixed(2));
      next = null;
    });
    next = v;
  };
  const follow = (e: PointerEvent) => e.pointerType === 'mouse' && set(light(e.clientX, e.clientY, innerWidth, innerHeight));
  if (first) follow(first);
  addEventListener('pointermove', follow, { passive: true });
  const D = window.DeviceOrientationEvent as unknown as { requestPermission?: unknown } | undefined;
  if (D && typeof D.requestPermission !== 'function')
    addEventListener('deviceorientation', (e) => e.beta !== null && e.gamma !== null && set(tilt(e.beta, e.gamma)));
}
