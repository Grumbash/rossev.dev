// The VAD demo's AudioWorklet (src/scripts/vad/demo.ts): copies each 128-sample render quantum to
// the worker's port, batched to ~1024 samples. A file on this origin, so the CSP needs no blob:.
registerProcessor('vad-tap', class extends AudioWorkletProcessor {
  constructor() { super(); this.out = null; this.buf = new Float32Array(1024); this.n = 0;
    this.port.onmessage = (e) => { this.out = e.data; }; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch || !this.out) return true;
    if (this.n + ch.length > this.buf.length) { this.out.postMessage(this.buf.slice(0, this.n)); this.n = 0; }
    this.buf.set(ch, this.n); this.n += ch.length;
    return true;
  }
});
