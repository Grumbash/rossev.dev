// Mic audio (usually 44.1 or 48 kHz) -> the model's 16 kHz, in 512-sample frames.
// Each output sample is the mean of the input samples that fall in its 1/16000 s slot: a box
// low-pass and decimation in one, plenty for voice activity. At 16 kHz it passes samples through.

export const RATE = 16_000;
export const FRAME = 512;

export class Resampler {
  private readonly ratio: number;
  private readonly frame = new Float32Array(FRAME);
  private filled = 0;
  private seen = 0;
  private slot = 0;
  private sum = 0;
  private count = 0;

  constructor(inRate: number) {
    this.ratio = inRate / RATE;
  }

  /** Feeds input samples; calls onFrame with each full frame (the array is reused: copy to keep it). */
  push(input: Float32Array, onFrame: (frame: Float32Array) => void): void {
    for (let i = 0; i < input.length; i++) {
      const slot = Math.floor(this.seen++ / this.ratio);
      if (slot !== this.slot && this.count > 0) {
        this.emit(this.sum / this.count, onFrame);
        this.sum = 0;
        this.count = 0;
      }
      this.slot = slot;
      this.sum += input[i];
      this.count++;
    }
    // At 16 kHz every sample is its own slot: don't hold the last one back a whole call.
    if (this.ratio === 1 && this.count > 0) {
      this.emit(this.sum, onFrame);
      this.sum = 0;
      this.count = 0;
      this.slot++;
    }
  }

  private emit(sample: number, onFrame: (frame: Float32Array) => void) {
    this.frame[this.filled++] = sample;
    if (this.filled === FRAME) {
      this.filled = 0;
      onFrame(this.frame);
    }
  }
}
