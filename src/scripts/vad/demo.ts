// The voice demo, loaded on the "Say hello" click by loader.ts (which already holds the
// AudioContext and the pending mic request, both started inside the click for Safari).
// Order: mic answer -> download the weights (the one request this demo makes) -> worker ->
// AudioWorklet tap -> frames until the model hears speech, 15 s pass, or something fails.
// The mic is released at every end. Audio lives only in memory: worklet -> worker -> a number.
import css from './demo.css?inline';
import { WEIGHTS_BYTES } from './model';
import { createOnsetTimer } from './onset';
import type { State, VadEvent } from './states';
import type { FromWorker, ToWorker } from './worker';

export type Mic = { stream?: MediaStream; error?: string };

const WEIGHTS_URL = '/vad/silero-vad-v6.2.3.bin';
// As long as a Sully caller sat in silence before the fix.
const QUIET_MS = 15_000;
// Copies each 128-sample render quantum to the worker's port, batched to ~1024 samples.
const WORKLET = `registerProcessor('vad-tap', class extends AudioWorkletProcessor {
  constructor() { super(); this.out = null; this.buf = new Float32Array(1024); this.n = 0;
    this.port.onmessage = (e) => { this.out = e.data; }; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch || !this.out) return true;
    if (this.n + ch.length > this.buf.length) { this.out.postMessage(this.buf.slice(0, this.n)); this.n = 0; }
    this.buf.set(ch, this.n); this.n += ch.length;
    return true;
  }
});`;

let styled = false;

async function download(url: string, onProgress: (loaded: number) => void): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  if (!res.body) return res.arrayBuffer();
  // Content-Length is the compressed size on the wire, so count decoded bytes against the known total.
  const out = new Uint8Array(WEIGHTS_BYTES);
  const reader = res.body.getReader();
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (loaded + value.length > out.length) throw new Error('weights too large');
    out.set(value, loaded);
    loaded += value.length;
    onProgress(loaded);
  }
  return out.buffer;
}

export async function runVadDemo(root: HTMLElement, ctx: AudioContext, mic: Promise<Mic>, dispatch: (e: VadEvent) => State) {
  if (!styled) {
    document.head.appendChild(document.createElement('style')).textContent = css;
    styled = true;
  }
  const { stream, error } = await mic;
  let worker: Worker | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let tap: AudioWorkletNode | null = null;
  let quiet = 0;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(quiet);
    stream?.getTracks().forEach((t) => t.stop());
    tap?.port.postMessage(null);
    tap?.disconnect();
    source?.disconnect();
    worker?.terminate();
    ctx.close().catch(() => {});
    window.removeEventListener('pagehide', stop);
  };
  window.addEventListener('pagehide', stop);
  const fail = () => {
    stop();
    dispatch({ type: 'fail' });
  };

  if (dispatch({ type: 'mic', error: stream ? undefined : (error ?? 'Error') }).phase !== 'loading') return stop();

  try {
    const weights = await download(WEIGHTS_URL, (loaded) => dispatch({ type: 'progress', loaded, total: WEIGHTS_BYTES }));
    if (stopped) return;
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onerror = fail;

    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    if (ctx.state === 'suspended') await ctx.resume();
    source = ctx.createMediaStreamSource(stream!);
    tap = new AudioWorkletNode(ctx, 'vad-tap');
    // Wired to the output so the graph runs; the tap writes nothing, so nothing is played.
    source.connect(tap).connect(ctx.destination);

    const channel = new MessageChannel();
    tap.port.postMessage(channel.port1, [channel.port1]);
    const init: ToWorker = { type: 'init', weights, rate: ctx.sampleRate, audio: channel.port2 };
    worker.postMessage(init, [weights, channel.port2]);
  } catch {
    return fail();
  }

  const timer = createOnsetTimer();
  const meter = root.querySelector<HTMLElement>('[data-vad-meter]');
  const infer = root.querySelector<HTMLElement>('[data-vad-infer]');
  worker.onmessage = (event: MessageEvent<FromWorker>) => {
    const msg = event.data;
    if (stopped) return;
    if (msg.type === 'error') return fail();
    if (msg.type === 'ready') {
      dispatch({ type: 'loaded' });
      return;
    }
    const wasReady = timer.ready;
    const onset = timer.push(msg);
    if (!wasReady && timer.ready) {
      dispatch({ type: 'ready' });
      quiet = window.setTimeout(() => {
        stop();
        dispatch({ type: 'timeout' });
      }, QUIET_MS);
    }
    meter?.style.setProperty('--vad-p', msg.prob.toFixed(2));
    if (onset) {
      if (infer) infer.textContent = onset.inferMs.toFixed(1);
      stop();
      dispatch({ type: 'onset', ms: onset.ms });
    }
  };
}
