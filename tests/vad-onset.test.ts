// The voice demo's number: how long after your voice started the model said "speech".
// Voice start = the first 32 ms frame (looking back from the model's first speech frame) whose
// energy rose above the room's noise floor; the number adds the decision frame's compute time.
// Runs on a mocked probability stream, then on the fixture audio with the real model's probabilities.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { FRAME_MS, createOnsetTimer, frameRms, type Frame } from '../src/scripts/vad/onset';
import { latencyBucket } from '../src/scripts/vad/states';

const quiet = (n: number): Frame[] => Array.from({ length: n }, () => ({ rms: 0.002, prob: 0.02, inferMs: 0.4 }));
const run = (frames: Frame[]) => {
  const timer = createOnsetTimer();
  for (const f of frames) {
    const onset = timer.push(f);
    if (onset) return onset;
  }
  return null;
};

describe('onset timer on a mocked VAD stream', () => {
  test('silence then speech: counts from the frame where the voice got louder than the room', () => {
    const speech: Frame[] = [
      { rms: 0.01, prob: 0.1, inferMs: 0.4 },
      { rms: 0.05, prob: 0.3, inferMs: 0.4 },
      { rms: 0.08, prob: 0.7, inferMs: 0.6 },
      { rms: 0.08, prob: 0.95, inferMs: 0.4 },
    ];
    const onset = run([...quiet(20), ...speech]);
    expect(onset).not.toBeNull();
    expect(onset!.voiceFrame).toBe(20);
    expect(onset!.speechFrame).toBe(22);
    // Frames 20, 21 and 22 heard, plus frame 22's compute.
    expect(onset!.ms).toBeCloseTo(3 * FRAME_MS + 0.6, 5);
  });

  test('speech in the very frame the voice starts costs one frame plus compute', () => {
    const onset = run([...quiet(12), { rms: 0.1, prob: 0.9, inferMs: 1.5 }]);
    expect(onset!.voiceFrame).toBe(onset!.speechFrame);
    expect(onset!.ms).toBeCloseTo(FRAME_MS + 1.5, 5);
  });

  test('a loud noise the model does not call speech never triggers', () => {
    const frames = [...quiet(12), { rms: 0.3, prob: 0.2, inferMs: 0.4 }, ...quiet(30)];
    expect(run(frames)).toBeNull();
  });

  test('stays silent while it measures the room, even if the model hears speech', () => {
    const timer = createOnsetTimer();
    expect(timer.ready).toBe(false);
    for (let i = 0; i < 4; i++) expect(timer.push({ rms: 0.1, prob: 0.9, inferMs: 0.4 })).toBeNull();
    // The calibration needs quiet frames; speech during it doesn't count as quiet.
    expect(timer.ready).toBe(false);
    for (const f of quiet(8)) expect(timer.push(f)).toBeNull();
    expect(timer.ready).toBe(true);
    expect(timer.push({ rms: 0.1, prob: 0.9, inferMs: 0.4 })).not.toBeNull();
  });

  test('a long loud run-up is capped at one second of look-back', () => {
    const loud: Frame[] = Array.from({ length: 100 }, () => ({ rms: 0.05, prob: 0.1, inferMs: 0.4 }));
    const onset = run([...quiet(12), ...loud, { rms: 0.05, prob: 0.8, inferMs: 0.4 }]);
    expect(onset!.speechFrame - onset!.voiceFrame).toBe(31);
    expect(onset!.ms).toBeCloseTo(32 * FRAME_MS + 0.4, 5);
  });

  test('the noise floor follows the room: a louder room needs a louder voice', () => {
    const room: Frame[] = Array.from({ length: 20 }, () => ({ rms: 0.02, prob: 0.02, inferMs: 0.4 }));
    const onset = run([...room, { rms: 0.03, prob: 0.1, inferMs: 0.4 }, { rms: 0.09, prob: 0.8, inferMs: 0.4 }]);
    // 0.03 is under 2x the floor of 0.02, so the voice starts at the 0.09 frame.
    expect(onset!.voiceFrame).toBe(21);
  });

  test('frameRms', () => {
    expect(frameRms(new Float32Array(512))).toBe(0);
    expect(frameRms(new Float32Array(512).fill(0.5))).toBeCloseTo(0.5, 6);
  });

  test('latency buckets for analytics', () => {
    expect(latencyBucket(12)).toBe('<100');
    expect(latencyBucket(99.9)).toBe('<100');
    expect(latencyBucket(100)).toBe('100-199');
    expect(latencyBucket(250)).toBe('200-399');
    expect(latencyBucket(400)).toBe('400-799');
    expect(latencyBucket(15000)).toBe('800+');
  });
});

describe('onset timer on the fixture audio (1 s of room noise, then "Hello, is this the clinic?")', () => {
  const wav = readFileSync('tests/fixtures/vad/hello.wav');
  const pcm = new Int16Array(wav.buffer.slice(wav.byteOffset + 44, wav.byteOffset + wav.byteLength));
  const probs: number[] = JSON.parse(readFileSync('tests/fixtures/vad/hello.json', 'utf8')).probs;

  test('finds the voice right after the first second, within a few frames of the model', () => {
    const timer = createOnsetTimer();
    let onset = null;
    for (let k = 0; k < probs.length && !onset; k++) {
      const chunk = Float32Array.from(pcm.subarray(k * 512, (k + 1) * 512), (s) => s / 32768);
      onset = timer.push({ rms: frameRms(chunk), prob: probs[k], inferMs: 0.5 });
    }
    expect(onset).not.toBeNull();
    // Speech starts at sample 16000, i.e. inside frame 31 (samples 15872-16383).
    expect(onset!.voiceFrame).toBeGreaterThanOrEqual(31);
    expect(onset!.voiceFrame).toBeLessThanOrEqual(33);
    expect(onset!.speechFrame).toBe(33);
    expect(onset!.ms).toBeGreaterThan(FRAME_MS);
    expect(onset!.ms).toBeLessThan(200);
  });
});
