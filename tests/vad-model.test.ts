// The voice demo runs Silero VAD v6.2.3 (MIT) through a TypeScript port in a worker, no ONNX
// runtime. This pins the port to the original: the fixture's probabilities come from the
// official ONNX file in onnxruntime (scripts/vad/export.py); the page ships float16 weights.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { SileroVad, WEIGHTS_BYTES } from '../src/scripts/vad/model';
import { Resampler } from '../src/scripts/vad/resample';

const bin = readFileSync('public/vad/silero-vad-v6.2.3.bin');
const weights = () => bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
const wav = readFileSync('tests/fixtures/vad/hello.wav');
const pcm = new Int16Array(wav.buffer.slice(wav.byteOffset + 44, wav.byteOffset + wav.byteLength));
const audio = Float32Array.from(pcm, (s) => s / 32768);
const reference: number[] = JSON.parse(readFileSync('tests/fixtures/vad/hello.json', 'utf8')).probs;

describe('Silero VAD port', () => {
  test('the shipped weights are the exported float16 file and stay small', () => {
    expect(bin.length).toBe(WEIGHTS_BYTES);
    expect(bin.length).toBeLessThan(500_000);
    expect(() => new SileroVad(new ArrayBuffer(1000))).toThrow();
  });

  test('matches the ONNX model on every 32 ms chunk of the fixture', () => {
    const vad = new SileroVad(weights());
    let worst = 0;
    for (let k = 0; k < reference.length; k++) {
      const p = vad.process(audio.subarray(k * 512, (k + 1) * 512));
      worst = Math.max(worst, Math.abs(p - reference[k]));
    }
    expect(worst).toBeLessThan(0.005);
  });

  test('reset clears the recurrent state', () => {
    const vad = new SileroVad(weights());
    const first = vad.process(audio.subarray(40 * 512, 41 * 512));
    vad.process(audio.subarray(41 * 512, 42 * 512));
    vad.reset();
    expect(vad.process(audio.subarray(40 * 512, 41 * 512))).toBeCloseTo(first, 6);
  });

  test('a chunk takes well under a frame (32 ms) on one core', () => {
    const vad = new SileroVad(weights());
    const t0 = performance.now();
    for (let k = 0; k < 60; k++) vad.process(audio.subarray(k * 512, (k + 1) * 512));
    expect((performance.now() - t0) / 60).toBeLessThan(8);
  });

  test('at 48 kHz mic rate, resampled in the page, it still hears speech start in frame 33', () => {
    // Linear upsample to 48 kHz, fed in 128-sample render quanta like an AudioWorklet.
    const up = new Float32Array(audio.length * 3);
    for (let i = 0; i < up.length; i++) {
      const x = i / 3, j = Math.floor(x), f = x - j;
      up[i] = audio[j] * (1 - f) + (audio[Math.min(j + 1, audio.length - 1)] ?? 0) * f;
    }
    const vad = new SileroVad(weights());
    const probs: number[] = [];
    const rs = new Resampler(48_000);
    for (let i = 0; i < up.length; i += 128) rs.push(up.subarray(i, i + 128), (frame) => probs.push(vad.process(frame)));
    expect(probs.findIndex((p) => p >= 0.5)).toBe(33);
  });
});

describe('Resampler', () => {
  test('16 kHz passes through in 512-sample frames', () => {
    const frames: Float32Array[] = [];
    const rs = new Resampler(16_000);
    for (let i = 0; i < 2048; i += 100) rs.push(audio.subarray(i, Math.min(i + 100, 2048)), (f) => frames.push(f.slice()));
    expect(frames.length).toBe(4);
    expect(Array.from(frames[2])).toEqual(Array.from(audio.subarray(1024, 1536)));
  });

  test('3 s at 48 kHz become 93 full frames with the level kept', () => {
    const tone = Float32Array.from({ length: 144_000 }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / 48_000));
    const frames: Float32Array[] = [];
    const rs = new Resampler(48_000);
    for (let i = 0; i < tone.length; i += 128) rs.push(tone.subarray(i, i + 128), (f) => frames.push(f.slice()));
    expect(frames.length).toBe(93);
    const rms = Math.sqrt(frames[50].reduce((s, x) => s + x * x, 0) / 512);
    expect(rms).toBeGreaterThan(0.34);
    expect(rms).toBeLessThan(0.36);
  });

  test('44.1 kHz (most Macs and iPhones) gives 16 kHz worth of frames', () => {
    const frames: number[] = [];
    const rs = new Resampler(44_100);
    const block = new Float32Array(128);
    for (let i = 0; i < 44_100 * 2; i += 128) rs.push(block, () => frames.push(1));
    expect(frames.length).toBe(Math.floor((2 * 16_000) / 512));
  });
});
