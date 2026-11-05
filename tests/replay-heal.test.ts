// The visitor's cut on the replay's mini GR regrows on the real shipped weights (src/scripts/replay/heal.ts).
// A cut that was cancelled (the film came back) must never deliver a verdict, even when the cancel lands
// while the weights are still loading and the monogram is still growing: a stale verdict would flip the
// card back to YOUR RUN after the visitor already returned to the film.
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createHealer } from '../src/scripts/replay/heal';

// A guard against a hang, not a speed check: a slow runner is not a failure (CI: nca.yml).
setDefaultTimeout(300_000);

const realFetch = globalThis.fetch;
beforeAll(() => {
  const bin = readFileSync('public/nca/gr.bin');
  // A slow network: the weights arrive a little after the cut was asked for.
  globalThis.fetch = (async () => {
    await new Promise((r) => setTimeout(r, 30));
    return new Response(bin);
  }) as unknown as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

const VERTICAL: [number, number, number, number][] = [[0.5, 0, 0.5, 1]];

describe('the live GR cut (heal.ts)', () => {
  test('cancelled while the weights load and the GR grows: no frames, no verdict', async () => {
    const h = createHealer('/nca/gr.bin');
    let frames = 0;
    const pending = h.cut(VERTICAL, () => frames++);
    h.cancel();
    expect(await pending).toBeNull();
    expect(frames).toBe(0);
  });

  test('a cut left alone gets its verdict from the real model', async () => {
    const h = createHealer('/nca/gr.bin');
    let frames = 0;
    const r = await h.cut(VERTICAL, () => frames++);
    expect(r).not.toBeNull();
    expect(r!.mse).toBeLessThan(0.01);
    expect(frames).toBeGreaterThan(0);
  });

  test('a newer cut supersedes an older one still loading', async () => {
    const h = createHealer('/nca/gr.bin');
    const first = h.cut(VERTICAL, () => {});
    const second = h.cut([[0, 0.5, 1, 0.5]], () => {});
    expect(await first).toBeNull();
    expect(await second).not.toBeNull();
  });
});
