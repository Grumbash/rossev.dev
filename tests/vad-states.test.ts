// The voice demo's states, from the "Say hello" click to a result or a graceful stop.
// Pure: the page's eager loader and the lazy demo both drive this and render what it returns.
import { describe, expect, test } from 'bun:test';
import { analyticsFor, envOf, initial, micErrorPhase, next, type Env, type State, type VadEvent } from '../src/scripts/vad/states';

const ok: Env = { saveData: false, getUserMedia: true, audioWorklet: true, worker: true };
const play = (events: VadEvent[], env: Env = ok, from: State = initial) => events.reduce((s, e) => next(s, e, env), from);

describe('vad demo state machine', () => {
  test('happy path: click, permission, download with progress, room check, onset', () => {
    let s = next(initial, { type: 'start' }, ok);
    expect(s.phase).toBe('asking');
    s = next(s, { type: 'mic' }, ok);
    expect(s.phase).toBe('loading');
    s = next(s, { type: 'progress', loaded: 243_585, total: 487_170 }, ok);
    expect(s).toMatchObject({ phase: 'loading', progress: 0.5 });
    s = next(s, { type: 'loaded' }, ok);
    expect(s.phase).toBe('calibrating');
    s = next(s, { type: 'ready' }, ok);
    expect(s.phase).toBe('listening');
    s = next(s, { type: 'onset', ms: 87.4 }, ok);
    expect(s).toMatchObject({ phase: 'detected', ms: 87.4 });
  });

  test('Save-Data or 2G: a static explanation, nothing asked, nothing downloaded', () => {
    const s = next(initial, { type: 'start' }, { ...ok, saveData: true });
    expect(s.phase).toBe('savedata');
    // A late event from nowhere can't start a download from here.
    expect(next(s, { type: 'mic' }, { ...ok, saveData: true }).phase).toBe('savedata');
  });

  for (const missing of ['getUserMedia', 'audioWorklet', 'worker'] as const) {
    test(`unsupported browser (no ${missing}): says so before asking for the mic`, () => {
      expect(next(initial, { type: 'start' }, { ...ok, [missing]: false }).phase).toBe('unsupported');
    });
  }

  test('permission denied, no microphone, insecure context, busy mic', () => {
    expect(micErrorPhase('NotAllowedError')).toBe('denied');
    expect(micErrorPhase('SecurityError')).toBe('denied');
    expect(micErrorPhase('NotFoundError')).toBe('nomic');
    expect(micErrorPhase('OverconstrainedError')).toBe('nomic');
    expect(micErrorPhase('TypeError')).toBe('unsupported');
    expect(micErrorPhase('NotReadableError')).toBe('error');
    expect(micErrorPhase(undefined)).toBe('error');
    expect(play([{ type: 'start' }, { type: 'mic', error: 'NotAllowedError' }]).phase).toBe('denied');
    expect(play([{ type: 'start' }, { type: 'mic', error: 'NotFoundError' }]).phase).toBe('nomic');
  });

  test('a failed model download or worker is an error, never a hang', () => {
    expect(play([{ type: 'start' }, { type: 'mic' }, { type: 'fail' }]).phase).toBe('error');
    expect(play([{ type: 'start' }, { type: 'mic' }, { type: 'loaded' }, { type: 'ready' }, { type: 'fail' }]).phase).toBe('error');
  });

  test('15 s without speech ends quietly', () => {
    expect(play([{ type: 'start' }, { type: 'mic' }, { type: 'loaded' }, { type: 'ready' }, { type: 'timeout' }]).phase).toBe('quiet');
  });

  test('a second click while busy is ignored; after a result it starts again', () => {
    const busy = play([{ type: 'start' }, { type: 'mic' }]);
    expect(next(busy, { type: 'start' }, ok)).toEqual(busy);
    for (const end of ['detected', 'quiet', 'denied', 'nomic', 'error'] as const) {
      expect(next({ ...initial, phase: end }, { type: 'start' }, ok).phase).toBe('asking');
    }
  });

  test('events out of order do nothing', () => {
    expect(next(initial, { type: 'onset', ms: 5 }, ok)).toEqual(initial);
    expect(next(initial, { type: 'loaded' }, ok)).toEqual(initial);
    expect(play([{ type: 'start' }, { type: 'onset', ms: 5 }]).phase).toBe('asking');
  });

  test('analytics: start, denied, detected with a latency bucket, error', () => {
    const asking = next(initial, { type: 'start' }, ok);
    expect(analyticsFor(initial, asking)).toEqual({ action: 'start' });
    expect(analyticsFor(asking, next(asking, { type: 'mic', error: 'NotAllowedError' }, ok))).toEqual({ action: 'denied' });
    expect(analyticsFor(asking, next(asking, { type: 'mic', error: 'NotFoundError' }, ok))).toEqual({ action: 'error' });
    const listening = play([{ type: 'mic' }, { type: 'loaded' }, { type: 'ready' }], ok, asking);
    expect(analyticsFor(listening, next(listening, { type: 'onset', ms: 140 }, ok))).toEqual({ action: 'detected', ms: '100-199' });
    expect(analyticsFor(listening, next(listening, { type: 'fail' }, ok))).toEqual({ action: 'error' });
    // Progress, room check, Save-Data and quiet send nothing.
    expect(analyticsFor(initial, next(initial, { type: 'start' }, { ...ok, saveData: true }))).toBeNull();
    expect(analyticsFor(listening, next(listening, { type: 'timeout' }, ok))).toBeNull();
  });

  test('envOf reads Save-Data, 2G and missing APIs from the browser', () => {
    const win = (nav: object, extra: object = {}) =>
      ({ navigator: { mediaDevices: { getUserMedia() {} }, ...nav }, AudioWorkletNode: class {}, Worker: class {}, ...extra }) as never;
    expect(envOf(win({}))).toEqual(ok);
    expect(envOf(win({ connection: { saveData: true } })).saveData).toBe(true);
    expect(envOf(win({ connection: { effectiveType: '2g' } })).saveData).toBe(true);
    expect(envOf(win({ connection: { effectiveType: 'slow-2g' } })).saveData).toBe(true);
    expect(envOf(win({ mediaDevices: undefined })).getUserMedia).toBe(false);
    expect(envOf(win({}, { AudioWorkletNode: undefined })).audioWorklet).toBe(false);
    expect(envOf(win({}, { Worker: undefined })).worker).toBe(false);
  });
});
