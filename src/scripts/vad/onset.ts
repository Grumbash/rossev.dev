// The voice demo's number: milliseconds from the start of your voice to the model's "speech".
// The model sees audio in 32 ms frames (512 samples at 16 kHz). Your voice starts at the first
// frame, looking back from the model's first speech frame, whose energy is more than twice the
// room's noise floor. The number counts every frame from there through the decision frame, plus
// that frame's compute time. The voice can start anywhere inside its first frame, so it may read
// up to 32 ms high; the look-back stops at about a second; microphone and OS buffering before the
// page gets the audio are not counted.

export const FRAME_MS = 32;
// Silero's own default for "speech".
export const THRESHOLD = 0.5;
// Frames below this probability may update the noise floor.
const QUIET_PROB = 0.3;
// Quiet frames needed before a result counts (about a quarter of a second).
const CALIBRATION = 8;
// How far back the voice start may be (about a second).
const LOOKBACK = 31;
// Noise floor: median of the last ~3 s of quiet frames.
const FLOOR_WINDOW = 94;
// Below this a frame is digital silence (a mic stream starting up), not a room: it can't calibrate.
const SILENT_RMS = 1e-5;
// The floor never drops below about -80 dBFS, so "twice the floor" always means something.
const MIN_FLOOR = 1e-4;

export type Frame = { rms: number; prob: number; inferMs: number };
export type Onset = { ms: number; voiceFrame: number; speechFrame: number; inferMs: number };

export function frameRms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

export function createOnsetTimer() {
  const rms: number[] = [];
  const quiet: number[] = [];
  let floor = 0;
  let calibrated = 0;

  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s[s.length >> 1];
  };

  return {
    get ready() {
      return calibrated >= CALIBRATION;
    },
    push(f: Frame): Onset | null {
      const k = rms.push(f.rms) - 1;
      if (calibrated < CALIBRATION) {
        // Until the room is measured every frame the model calls quiet counts, loud or not.
        if (f.prob < QUIET_PROB && f.rms > SILENT_RMS) {
          calibrated++;
          quiet.push(f.rms);
          floor = Math.max(MIN_FLOOR, median(quiet));
        }
        return null;
      }
      if (f.prob < THRESHOLD) {
        // A loud frame the model doesn't call speech (a knock, a voice building up) leaves the floor alone.
        if (f.prob < QUIET_PROB && f.rms <= 2 * floor) {
          quiet.push(f.rms);
          if (quiet.length > FLOOR_WINDOW) quiet.shift();
          floor = Math.max(MIN_FLOOR, median(quiet));
        }
        return null;
      }
      let v = k;
      while (v > 0 && k - v < LOOKBACK && rms[v - 1] > 2 * floor) v--;
      return { ms: (k - v + 1) * FRAME_MS + f.inferMs, voiceFrame: v, speechFrame: k, inferMs: f.inferMs };
    },
  };
}
