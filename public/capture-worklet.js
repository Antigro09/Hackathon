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
    this.hasPostedChunk = false;
    this.interrupted = false;
  }

  process(inputs, outputs) {
    for (const output of outputs) {
      for (const channel of output) channel.fill(0);
    }
    if (this.interrupted) return true;
    const input = inputs[0]?.[0];
    if (!input || input.length === 0) {
      if (this.hasPostedChunk) this.interrupt();
      else this.resetStartup();
      return true;
    }
    if (this.expectedFrame !== null && currentFrame !== this.expectedFrame) {
      if (this.hasPostedChunk) {
        this.interrupt();
        return true;
      }
      this.resetStartup();
    }
    if (this.originFrame === null) this.originFrame = currentFrame;
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
        this.hasPostedChunk = true;
        this.chunk = new Float32Array(this.chunkSize);
        this.used = 0;
      }
    }
    return true;
  }

  resetStartup() {
    // Before the first committed chunk, the media graph can start unevenly.
    // Discard provisional samples; never join or fill a discontinuity. The
    // first contiguous chunk starts at zero and the caller's watchdog still
    // bounds a graph that never supplies a complete chunk.
    this.used = 0;
    this.chunkStart = 0;
    this.originFrame = null;
    this.expectedFrame = null;
  }

  interrupt() {
    this.interrupted = true;
    this.port.postMessage({ type: 'interrupted' });
  }
}

registerProcessor('tonalwatch-capture', TonalWatchCaptureProcessor);
