// Under prefers-reduced-motion the hero canvas has nothing to animate once it settles,
// so the render loop must stop asking for frames until something wakes it.
import { describe, expect, test } from 'bun:test';
import { SETTLE_EPS, settleResidual, shouldKeepAnimating } from '../src/scripts/iso-loop';

const idle = { reducedMotion: true, dragging: false, traceActive: false, faultActive: false, residual: 0 };

describe('shouldKeepAnimating', () => {
  test('always animates without reduced motion (ambient sway and packets)', () => {
    expect(shouldKeepAnimating({ ...idle, reducedMotion: false })).toBe(true);
  });

  test('idles under reduced motion once nothing moves', () => {
    expect(shouldKeepAnimating(idle)).toBe(false);
    expect(shouldKeepAnimating({ ...idle, residual: SETTLE_EPS / 2 })).toBe(false);
  });

  test('keeps going while a drag, trace wave or fault sim is in progress', () => {
    expect(shouldKeepAnimating({ ...idle, dragging: true })).toBe(true);
    expect(shouldKeepAnimating({ ...idle, traceActive: true })).toBe(true);
    expect(shouldKeepAnimating({ ...idle, faultActive: true })).toBe(true);
  });

  test('keeps going until the camera, explode and flash have settled', () => {
    expect(shouldKeepAnimating({ ...idle, residual: SETTLE_EPS * 2 })).toBe(true);
  });
});

describe('settleResidual', () => {
  const still: [number, number][] = [[0.64, 0.64], [0.54, 0.54], [0.86, 0.86]];
  const zeros = [0, 0, 0];

  test('is zero when the camera is on target and no node is exploded or flashing', () => {
    expect(settleResidual(still, zeros, zeros, -1)).toBe(0);
  });

  test('counts a camera still easing toward its target', () => {
    expect(settleResidual([...still, [0, 80]], zeros, zeros, -1)).toBe(80);
  });

  test('counts a locked node that has not fully exploded, and a collapsing one', () => {
    expect(settleResidual(still, [0, 0.4, 0], zeros, 1)).toBeCloseTo(0.6);
    expect(settleResidual(still, [0, 0.4, 0], zeros, -1)).toBeCloseTo(0.4);
    expect(settleResidual(still, [0, 1, 0], zeros, 1)).toBe(0);
  });

  test('counts a flash that is still fading', () => {
    expect(settleResidual(still, zeros, [0, 0, 0.3], -1)).toBe(0.3);
  });
});
