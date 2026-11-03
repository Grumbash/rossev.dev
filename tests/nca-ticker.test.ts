// The NCA worker's loop must never run two timer chains at once: a tick that
// restarts the pattern (full wipe) wakes the loop from inside the tick.
import { describe, expect, test } from 'bun:test';
import { createTicker } from '../src/scripts/nca/ticker';

function fakeTimers() {
  const queue: (() => void)[] = [];
  return { queue, schedule: (fn: () => void) => queue.push(fn), runNext: () => queue.shift()!() };
}

describe('createTicker', () => {
  test('a wake from inside a tick does not start a second chain', () => {
    const t = fakeTimers();
    const ticker = createTicker(() => {
      ticker.wake(); // what reset() does when the pattern dies mid-tick
      return true;
    }, 33, t.schedule);
    ticker.wake();
    for (let i = 0; i < 5; i++) {
      expect(t.queue.length).toBe(1);
      t.runNext();
    }
    expect(t.queue.length).toBe(1);
  });

  test('repeated wakes while pending schedule once; a tick returning false stops it', () => {
    const t = fakeTimers();
    let keepGoing = true;
    const ticker = createTicker(() => keepGoing, 33, t.schedule);
    ticker.wake();
    ticker.wake();
    expect(t.queue.length).toBe(1);
    keepGoing = false;
    t.runNext();
    expect(t.queue.length).toBe(0);
    expect(ticker.pending).toBe(false);
  });
});
