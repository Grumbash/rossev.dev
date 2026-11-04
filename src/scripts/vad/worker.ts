/// <reference lib="webworker" />
// Runs the voice-activity model off the main thread. The page hands it the weights (already
// downloaded) and a MessagePort wired straight to the AudioWorklet, so mic samples go
// worklet -> worker in memory and never pass through the page or anywhere else. It has no
// network code: everything it needs arrives in the init message.
import { SileroVad } from './model';
import { frameRms } from './onset';
import { Resampler } from './resample';

export type ToWorker = { type: 'init'; weights: ArrayBuffer; rate: number; audio: MessagePort };
export type FromWorker =
  | { type: 'ready' }
  | { type: 'frame'; prob: number; rms: number; inferMs: number }
  | { type: 'error' };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<ToWorker>) => {
  const post = (msg: FromWorker) => scope.postMessage(msg);
  try {
    const { weights, rate, audio } = event.data;
    const vad = new SileroVad(weights);
    const resampler = new Resampler(rate);
    audio.onmessage = (e: MessageEvent<Float32Array>) => {
      try {
        resampler.push(e.data, (frame) => {
          const t0 = performance.now();
          const prob = vad.process(frame);
          post({ type: 'frame', prob, rms: frameRms(frame), inferMs: performance.now() - t0 });
        });
      } catch {
        post({ type: 'error' });
      }
    };
    post({ type: 'ready' });
  } catch {
    post({ type: 'error' });
  }
};
