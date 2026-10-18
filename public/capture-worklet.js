/* AudioWorklet render thread: copy first channel only, keep every output silent. */
class TonalWatchCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunkSize = 2048;
    this.chunk = new Float32Array(this.chunkSize);
    this.used = 0;
    this.chunkStart = 0;
    this.originFrame = null;
    this.expectedFrame = null;
    this.interrupted = false;
  }

  process(inputs, outputs) {
    for (const output of outputs) {
      for (const channel of output) channel.fill(0);
    }
    if (this.interrupted) return true;
    const input = inputs[0]?.[0];
    if (!input || input.length === 0) {
      if (this.originFrame !== null) this.interrupt();
      return true;
    }
    if (this.originFrame === null) this.originFrame = currentFrame;
    if (this.expectedFrame !== null && currentFrame !== this.expectedFrame) {
      this.interrupt();
      return true;
    }
    this.expectedFrame = currentFrame + input.length;
    let offset = 0;
    while (offset < input.length) {
      if (this.used === 0) this.chunkStart = currentFrame - this.originFrame + offset;
      const take = Math.min(input.length - offset, this.chunkSize - this.used);
      this.chunk.set(input.subarray(offset, offset + take), this.used);
      this.used += take;
      offset += take;
      if (this.used === this.chunkSize) {
        this.port.postMessage({ type: 'chunk', startSample: this.chunkStart, samples: this.chunk }, [this.chunk.buffer]);
        this.chunk = new Float32Array(this.chunkSize);
        this.used = 0;
      }
    }
    return true;
  }

  interrupt() {
    this.interrupted = true;
    this.port.postMessage({ type: 'interrupted' });
  }
}

registerProcessor('tonalwatch-capture', TonalWatchCaptureProcessor);
