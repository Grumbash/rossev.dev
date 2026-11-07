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
// From mic permission to the model listening (download, worker, worklet); past this it's an error.
const SETUP_MS = 30_000;
// The model's input is 16 kHz; a context below that (an 8 kHz headset) can't feed it.
const MIN_RATE = 16_000;

let styled = false;

async function download(url: string, signal: AbortSignal, onProgress: (loaded: number) => void): Promise<ArrayBuffer> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  if (!res.body) {
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength !== WEIGHTS_BYTES) throw new Error('Incomplete VAD weights');
    return bytes;
  }
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
  if (loaded !== WEIGHTS_BYTES) throw new Error('Incomplete VAD weights');
  return out.buffer;
}

export async function runVadDemo(root: HTMLElement, ctx: AudioContext, mic: Mic, dispatch: (e: VadEvent) => State) {
  if (!styled) {
    document.head.appendChild(document.createElement('style')).textContent = css;
    styled = true;
  }
  const { stream, error } = mic;
  let worker: Worker | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let tap: AudioWorkletNode | null = null;
  let timer = 0;
  let stopped = false;
  const transfer = new AbortController();
  const stop = () => {
    if (stopped) return;
    stopped = true;
    transfer.abort();
    clearTimeout(timer);
    stream?.getTracks().forEach((t) => t.stop());
    tap?.port.postMessage(null);
    tap?.disconnect();
    source?.disconnect();
    worker?.terminate();
    ctx.close().catch(() => {});
    window.removeEventListener('pagehide', leave);
  };
  // A page restored from the back/forward cache must not show a run that is no longer there.
  const leave = () => {
    stop();
    dispatch({ type: 'stop' });
  };
  window.addEventListener('pagehide', leave);
  const fail = () => {
    if (stopped) return;
    stop();
    dispatch({ type: 'fail' });
  };
  // Every way out releases the mic: setup that hangs fails, and listening ends after QUIET_MS.
  const arm = (ms: number, end: () => void) => {
    clearTimeout(timer);
    timer = window.setTimeout(end, ms);
  };

  if (dispatch({ type: 'mic', error: stream ? undefined : (error ?? 'Error') }).phase !== 'loading') return stop();

  arm(SETUP_MS, fail);
  try {
    if (ctx.sampleRate < MIN_RATE) throw new Error(`sample rate ${ctx.sampleRate}`);
    const weights = await download(WEIGHTS_URL, transfer.signal, (loaded) => {
      if (!stopped) dispatch({ type: 'progress', loaded, total: WEIGHTS_BYTES });
    });
    if (stopped) return;
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onerror = fail;

    // The tap worklet (public/vad/tap-worklet.js) copies the mic to the worker's port.
    await ctx.audioWorklet.addModule('/vad/tap-worklet.js');
    if (stopped) return;
    if (ctx.state === 'suspended') await ctx.resume();
    if (stopped) return;
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

  const onsetTimer = createOnsetTimer();
  const meter = root.querySelector<HTMLElement>('[data-vad-meter]');
  const infer = root.querySelector<HTMLElement>('[data-vad-infer]');
  worker.onmessage = (event: MessageEvent<FromWorker>) => {
    const msg = event.data;
    if (stopped) return;
    if (msg.type === 'error') return fail();
    if (msg.type === 'ready') {
      dispatch({ type: 'loaded' });
      // Covers the room check too: a room that never goes quiet, or a mic that sends nothing, ends here.
      arm(QUIET_MS, () => {
        stop();
        dispatch({ type: 'timeout' });
      });
      return;
    }
    // The home fragment can be replaced mid-run; nobody is looking, so let go of the mic.
    if (!root.isConnected) return leave();
    const wasReady = onsetTimer.ready;
    const onset = onsetTimer.push(msg);
    if (!wasReady && onsetTimer.ready) dispatch({ type: 'ready' });
    meter?.style.setProperty('--vad-p', msg.prob.toFixed(2));
    if (onset) {
      if (infer) infer.textContent = onset.inferMs.toFixed(1);
      stop();
      dispatch({ type: 'onset', ms: onset.ms });
    }
  };
}
