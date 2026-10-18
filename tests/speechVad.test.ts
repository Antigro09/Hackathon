import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSpeechVadScanner, SPEECH_VAD_MODEL, SPEECH_VAD_RUNTIME, type SpeechVadResult } from '../src/ai/speechVad';
import { resampleForSpeechVad } from '../src/ai/speechVadResample';
import { speechVadIntervals } from '../src/ai/speechVadIntervals';
import { runSpeechVadFrames, speechVadSelfTestPassed, SPEECH_VAD_SELF_TEST } from '../src/ai/speechVadInference';
import type { SpeechVadOrt, SpeechVadSession, SpeechVadTensor } from '../src/ai/speechVadInference';

const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
class FakeWorker {
  onmessage: Worker['onmessage'] = null;
  onerror: Worker['onerror'] = null;
  onmessageerror: Worker['onmessageerror'] = null;
  request: { requestId: string; pcm: Float32Array; sampleRateHz: number } | null = null;
  terminate = vi.fn();
  postMessage = vi.fn((data, transfer: Transferable[]) => { this.request = structuredClone(data, { transfer }); });
  emit(data: unknown) { this.onmessage?.call(this as unknown as Worker, { data } as MessageEvent); }
}
function result(duration = 5): SpeechVadResult {
  return { speechDetected: false, intervals: [], captureDurationSeconds: duration, frameCount: Math.ceil(duration * 16_000 / 512),
    coverage: 'full-recording', sampleRateHz: 16_000, modelId: SPEECH_VAD_MODEL.id, modelRevision: SPEECH_VAD_MODEL.revision,
    modelSha256: SPEECH_VAD_MODEL.sha256, policyVersion: SPEECH_VAD_MODEL.policyVersion, selfTestPassed: true };
}
function harness(timeoutMs = 120_000) {
  const workers: FakeWorker[] = [];
  const createWorker = vi.fn(() => { const worker = new FakeWorker(); workers.push(worker); return worker as unknown as Worker; });
  return { workers, createWorker, scan: createSpeechVadScanner({ createWorker, timeoutMs }) };
}
afterEach(() => vi.useRealTimers());

describe('speech scanner capture ownership and release', () => {
  it.each([44100, 48000].flatMap(rate => [5, 15, 30].map(duration => [rate, duration])))('copies the full%iHz/%is capture, reports all frames and terminates before resolving', async (rate, duration) => {
    const h = harness(), pcm = new Float32Array(rate * duration).fill(.125), original = pcm.slice(), progress = vi.fn();
    const pending = h.scan(pcm, rate, { onProgress: progress }), worker = h.workers[0];
    const expectedBytes = hash(new Uint8Array(original.buffer));
    expect(hash(new Uint8Array(worker.request!.pcm.buffer))).toBe(expectedBytes); expect(worker.request!.pcm.buffer).not.toBe(pcm.buffer);
    expect(hash(new Uint8Array(pcm.buffer))).toBe(expectedBytes); expect(pcm.byteLength).toBe(original.byteLength);
    worker.emit({ type: 'progress', requestId: worker.request!.requestId, progress: { phase: 'analyzing', completedFrames: 16, totalFrames: result(duration).frameCount } });
    expect(progress).toHaveBeenCalledOnce();
    worker.emit({ type: 'result', requestId: worker.request!.requestId, result: result(duration) });
    const output = await pending;
    expect(output).toEqual(result(duration)); expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.onmessage).toBeNull(); expect(worker.onerror).toBeNull(); expect(worker.onmessageerror).toBeNull();
  });

  it('preserves possible speech times without claiming source accuracy', async () => {
    const h = harness(), pending = h.scan(new Float32Array(48_000 * 30), 48_000), worker = h.workers[0];
    const detected = { ...result(30), speechDetected: true, intervals: [{ startSeconds: 20.066, endSeconds: 22.174 }] };
    worker.emit({ type: 'result', requestId: worker.request!.requestId, result: detected });
    expect(await pending).toEqual(detected);
  });

  it('makes no worker for an invalid, incomplete, nonfinite or pre-cancelled recording', async () => {
    const h = harness();
    for (const [pcm, rate] of [[new Float32Array(48_000 * 4), 48_000], [new Float32Array(8_000 * 5), 8_000], [new Float32Array(44_100 * 31), 44_100]] as const) {
      await expect(h.scan(pcm, rate)).rejects.toMatchObject({ code: 'invalid-input' });
    }
    const invalid = new Float32Array(44_100 * 5); invalid[10] = NaN;
    await expect(h.scan(invalid, 44_100)).rejects.toMatchObject({ code: 'invalid-input' });
    invalid[10] = 1.01;
    await expect(h.scan(invalid, 44_100)).rejects.toMatchObject({ code: 'invalid-input' });
    const controller = new AbortController(); controller.abort();
    await expect(h.scan(new Float32Array(44_100 * 5), 44_100, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(h.createWorker).not.toHaveBeenCalled();
  });

  it('cancels an active scan, terminates it and ignores a saved stale handler', async () => {
    const h = harness(), controller = new AbortController();
    const pending = h.scan(new Float32Array(44_100 * 15), 44_100, { signal: controller.signal }), worker = h.workers[0], handler = worker.onmessage!;
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort(); await rejection;
    handler.call(worker as unknown as Worker, { data: { type: 'result', requestId: worker.request!.requestId, result: result(15) } } as MessageEvent);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('ignores a different operation ID and rejects unsupported or forged result provenance', async () => {
    const h = harness(), pending = h.scan(new Float32Array(44_100 * 5), 44_100), worker = h.workers[0];
    worker.emit({ type: 'result', requestId: 'old', result: result() }); expect(worker.terminate).not.toHaveBeenCalled();
    worker.emit({ type: 'result', requestId: worker.request!.requestId, result: { ...result(), modelSha256: 'other-model' } });
    await expect(pending).rejects.toMatchObject({ code: 'invalid-result' }); expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it.each([
    { speechDetected: true },
    { selfTestPassed: false },
    { frameCount: 1 },
    { intervals: [{ startSeconds: 1, endSeconds: 8 }], speechDetected: true },
    { intervals: [{ startSeconds: 2, endSeconds: 3 }, { startSeconds: 1, endSeconds: 2 }], speechDetected: true },
    { intervals: [{ startSeconds: NaN, endSeconds: 2 }], speechDetected: true },
  ])('rejects incoherent interval or coverage results %#', async overrides => {
    const h = harness(), pending = h.scan(new Float32Array(44_100 * 5), 44_100), worker = h.workers[0];
    worker.emit({ type: 'result', requestId: worker.request!.requestId, result: { ...result(), ...overrides } });
    await expect(pending).rejects.toMatchObject({ code: 'invalid-result' }); expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('fails closed on model errors, worker crashes, bad progress and expiry', async () => {
    for (const mode of ['model', 'worker', 'progress'] as const) {
      const h = harness(), pending = h.scan(new Float32Array(44_100 * 5), 44_100), worker = h.workers[0];
      if (mode === 'model') worker.emit({ type: 'error', requestId: worker.request!.requestId, code: 'asset-mismatch', message: 'untrusted details' });
      if (mode === 'worker') worker.onerror?.call(worker as unknown as Worker, {} as ErrorEvent);
      if (mode === 'progress') worker.emit({ type: 'progress', requestId: worker.request!.requestId, progress: { phase: 'analyzing', completedFrames: 10000, totalFrames: 157 } });
      await expect(pending).rejects.toBeInstanceOf(Error); expect(worker.terminate).toHaveBeenCalledOnce();
    }
    vi.useFakeTimers(); const h = harness(100), pending = h.scan(new Float32Array(44_100 * 5), 44_100);
    const rejected = expect(pending).rejects.toMatchObject({ code: 'timeout' }); await vi.advanceTimersByTimeAsync(100); await rejected;
    expect(h.workers[0].terminate).toHaveBeenCalledOnce();
  });
});

describe('independent anti-aliasing speech preprocessing', () => {
  it.each([
    [44100, 92, '9e801052c2d8e2dd2bc91523693fb8d2e246f44836f3204b793b03b4194892ad'],
    [48000, 85, '8881f00d9c607b13e22ce328f6b3d52338c1acc13d10c3e25756fc45cac37e61'],
  ] as const)('matches independent SciPy1.15.3 Float32 resample_poly at%iHz', (rate, length, expected) => {
    // Independent references generated by ml/browser/speech-vad/compact-reference.py before app tests.
    const pcm = Float32Array.from({ length: 253 }, (_, index) => ((index * 1103515245 + 12345) % 65536) / 65536 - .5), before = pcm.slice();
    const actual = resampleForSpeechVad(pcm, rate);
    expect(actual.length).toBe(length); expect(hash(new Uint8Array(actual.buffer))).toBe(expected); expect(pcm).toEqual(before);
  });

  it.each([44100, 48000])('rejects12kHz aliasing instead of naive decimation at%iHz', rate => {
    const pcm = Float32Array.from({ length: rate }, (_, index) => .5 * Math.sin(2 * Math.PI * 12_000 * index / rate));
    const interior = resampleForSpeechVad(pcm, rate).subarray(1600, 14400);
    expect(Math.sqrt(interior.reduce((sum, value) => sum + value * value, 0) / interior.length)).toBeLessThan(.001);
  });
});

describe('fixed upstream speech interval policy', () => {
  const trace = (seconds: number, start: number, end: number): number[] => Array.from({ length: Math.ceil(seconds * 16000 / 512) }, (_, index) => index * .032 >= start && index * .032 < end ? .8 : .1);
  it('finds speech after20 seconds and clamps the final padded frame to actual audio', () => {
    expect(speechVadIntervals(trace(30, 20, 22), 480000)).toEqual([{ startSeconds: 19.97, endSeconds: 22.046 }]);
    expect(speechVadIntervals(trace(5, 4.5, 5), 80000)).toEqual([{ startSeconds: 4.482, endSeconds: 5 }]);
  });
  it('drops brief sub250ms events and uses negative hysteresis rather than requiring every frame above threshold', () => {
    expect(speechVadIntervals(trace(5, 1, 1.15), 80000)).toEqual([]);
    const values = trace(5, 1, 2); for (let index = 35; index < 45; index += 1) values[index] = .4;
    expect(speechVadIntervals(values, 80000)).toEqual([{ startSeconds: .994, endSeconds: 2.046 }]);
    expect(speechVadIntervals(new Array(157).fill(.1), 80000)).toEqual([]);
  });
  it('rejects invalid probability ranges and incomplete coverage', () => {
    expect(() => speechVadIntervals([.9], 80000)).toThrow();
    expect(() => speechVadIntervals(new Array(157).fill(NaN), 80000)).toThrow();
    expect(() => speechVadIntervals(new Array(157).fill(1.01), 80000)).toThrow();
  });
});

describe('stateful inference resource and tensor contracts', () => {
  function inferenceHarness() {
    const tensors: { value: SpeechVadTensor; original: Float32Array | BigInt64Array; type: string; disposed: boolean }[] = [];
    class Tensor implements SpeechVadTensor {
      data: ArrayLike<number>; dims: number[];
      constructor(type: string, original: Float32Array | BigInt64Array, dims: number[]) {
        this.data = original as Float32Array; this.dims = dims;
        tensors.push({ value: this, original, type, disposed: false });
      }
      dispose() { tensors.find(item => item.value === this)!.disposed = true; }
    }
    const calls: Record<string, SpeechVadTensor>[] = [];
    const run = vi.fn(async (feeds: Record<string, SpeechVadTensor>) => {
      calls.push(feeds);
      return { output: new Tensor('float32', Float32Array.from([.1]), [1, 1]), stateN: new Tensor('float32', new Float32Array(256).fill(calls.length), [2, 1, 128]) };
    });
    const session: SpeechVadSession = { inputNames: ['input', 'state', 'sr'], outputNames: ['output', 'stateN'], run, release: vi.fn(async () => {}) };
    const ort = { Tensor } as unknown as SpeechVadOrt;
    return { tensors, calls, session, ort, run };
  }
  it('carries64 context samples/state, pads only the last frame and resets before each recording', async () => {
    const h = inferenceHarness(), pcm = Float32Array.from({ length: 1000 }, (_, i) => i / 1000), before = pcm.slice();
    expect((await runSpeechVadFrames(h.ort, h.session, pcm)).probabilities).toEqual([expect.any(Number), expect.any(Number)]);
    expect(Array.from(h.calls[0].input.data).slice(0, 64)).toEqual(new Array(64).fill(0));
    expect(Array.from(h.calls[1].input.data).slice(0, 64)).toEqual(Array.from(pcm.subarray(448, 512)));
    expect(Array.from(h.calls[1].input.data).slice(-24)).toEqual(new Array(24).fill(0));
    expect(Array.from(h.calls[0].state.data)).toEqual(new Array(256).fill(0));
    expect(Array.from(h.calls[1].state.data)).toEqual(new Array(256).fill(1));
    expect(h.calls[0].sr.dims).toEqual([]); expect(h.tensors[2].original).toEqual(BigInt64Array.from([16000n]));
    expect(h.tensors.every(value => value.disposed)).toBe(true); expect(pcm).toEqual(before);
    await runSpeechVadFrames(h.ort, h.session, pcm);
    expect(Array.from(h.calls[2].state.data)).toEqual(new Array(256).fill(0));
  });
  it('disposes input and output tensors even when the model violates the expected schema', async () => {
    const h = inferenceHarness();
    h.run.mockImplementationOnce(async () => ({ output: { data: [NaN], dims: [1, 1], dispose: vi.fn() }, stateN: { data: [0], dims: [2, 1, 128], dispose: vi.fn() } }));
    await expect(runSpeechVadFrames(h.ort, h.session, new Float32Array(512))).rejects.toThrow();
    expect(h.tensors.every(value => value.disposed)).toBe(true);
  });
  it('fails startup on missing, nonfinite or changed self-test output', () => {
    expect(speechVadSelfTestPassed(SPEECH_VAD_SELF_TEST)).toBe(true);
    expect(speechVadSelfTestPassed([])).toBe(false); expect(speechVadSelfTestPassed(SPEECH_VAD_SELF_TEST.map(() => NaN))).toBe(false);
    expect(speechVadSelfTestPassed(SPEECH_VAD_SELF_TEST.map(value => value + .001))).toBe(false);
  });
  it('preserves downloaded model bytes and existing runtime pins', () => {
    const model = readFileSync('public/ai/speech-vad/silero_vad_16k_op15.onnx');
    expect(model.byteLength).toBe(1289603); expect(hash(model)).toBe(SPEECH_VAD_MODEL.sha256);
    for (const [name, pin] of Object.entries(SPEECH_VAD_RUNTIME)) {
      const asset = readFileSync(`public/ai/canonical-v3/${name}`); expect(asset.byteLength).toBe(pin.bytes); expect(hash(asset)).toBe(pin.sha256);
    }
  });
});
