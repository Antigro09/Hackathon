import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptureCollector, filterDeviceSettings } from '../src/audio/chunks';
import { startCapture } from '../src/audio/capture';
import { decodeAudioFile, MAX_FILE_BYTES } from '../src/audio/decode';
import workletSource from '../public/capture-worklet.js?raw';

class MockTrack extends EventTarget {
  readyState = 'live';
  stop = vi.fn(() => { this.readyState = 'ended'; });
  getSettings = () => ({ sampleRate: 48000, channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false, deviceId: 'private-device', groupId: 'private-group' });
}

class MockNode {
  connect = vi.fn();
  disconnect = vi.fn();
}

class MockContext extends EventTarget {
  static instances: MockContext[] = [];
  static decodeFailure: Error | null = null;
  static captureSampleRate = 48000;
  state = 'suspended';
  sampleRate = MockContext.captureSampleRate;
  destination = {};
  audioWorklet = { addModule: vi.fn(async () => {}) };
  source = new MockNode();
  gain = Object.assign(new MockNode(), { gain: { value: 1 } });
  resume = vi.fn(async () => { this.state = 'running'; });
  close = vi.fn(async () => { this.state = 'closed'; });
  createMediaStreamSource = () => this.source;
  createGain = () => this.gain;
  decodeAudioData = vi.fn(async () => {
    if (MockContext.decodeFailure) throw MockContext.decodeFailure;
    return decodedBuffer;
  });
  constructor() { super(); MockContext.instances.push(this); }
}

class MockWorklet extends MockNode {
  static latest: MockWorklet | undefined;
  onprocessorerror: (() => void) | null = null;
  port: { onmessage: ((event: { data: unknown }) => void) | null; close: ReturnType<typeof vi.fn> } = { onmessage: null, close: vi.fn() };
  constructor() { super(); MockWorklet.latest = this; }
}

let track: MockTrack;
let getUserMedia: ReturnType<typeof vi.fn>;
let documentMock: EventTarget & { visibilityState: string };
let decodedBuffer: { sampleRate: number; numberOfChannels: number; length: number; getChannelData: (channel: number) => Float32Array };

function streamFor(value: MockTrack) { return { getTracks: () => [value], getAudioTracks: () => [value] }; }

beforeEach(() => {
  track = new MockTrack();
  getUserMedia = vi.fn(async () => streamFor(track));
  documentMock = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  MockContext.instances = [];
  MockContext.decodeFailure = null;
  MockContext.captureSampleRate = 48000;
  MockWorklet.latest = undefined;
  decodedBuffer = { sampleRate: 48000, numberOfChannels: 2, length: 48000 * 7, getChannelData: channel => new Float32Array(48000 * 7).fill(channel === 0 ? 0.25 : -0.25) };
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia, getSupportedConstraints: () => ({ echoCancellation: true, noiseSuppression: true, autoGainControl: true }) } });
  vi.stubGlobal('document', documentMock);
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('AudioContext', MockContext);
  vi.stubGlobal('AudioWorkletNode', MockWorklet);
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('sample collector', () => {
  it.each([44100, 48000])('discards exactly .5 s and crops five seconds at %i Hz across irregular chunks', fs => {
    const collector = new CaptureCollector(fs);
    const total = Math.round(5.5 * fs);
    let start = 0;
    for (const length of [100, 333, 2048, 4097, total]) {
      const data = Float32Array.from({ length }, (_, index) => start + index);
      collector.push({ startSample: start, samples: data });
      start += length;
    }
    expect(collector.complete).toBe(true);
    expect(collector.pcm.length).toBe(fs * 5);
    expect(collector.pcm[0]).toBe(fs * 0.5);
    expect(collector.pcm.at(-1)).toBe(fs * 5.5 - 1);
  });

  it('rejects missing or duplicated chunks instead of filling the gap', () => {
    const collector = new CaptureCollector(48000);
    collector.push({ startSample: 0, samples: new Float32Array(2048) });
    expect(() => collector.push({ startSample: 4096, samples: new Float32Array(2048) })).toThrow(/samples were lost/);
    expect(() => collector.push({ startSample: 0, samples: new Float32Array(2048) })).toThrow(/samples were lost/);
    expect(collector.complete).toBe(false);
  });

  it('only retains safe device settings', () => {
    expect(filterDeviceSettings(track.getSettings())).toEqual({ sampleRate: 48000, channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false });
  });
});

describe('render-thread recorder', () => {
  function makeProcessor() {
    const messages: Array<{ type: string; startSample?: number; samples?: Float32Array }> = [];
    class WorkletBase { port = { postMessage: (message: typeof messages[number]) => messages.push(message) }; }
    let Processor!: new () => { process: (inputs: Float32Array[][], outputs: Float32Array[][]) => boolean };
    let frame = 0;
    const load = new Function('AudioWorkletProcessor', 'registerProcessor', 'getFrame', workletSource.replaceAll('currentFrame', 'getFrame()'));
    load(WorkletBase, (_name: string, value: typeof Processor) => { Processor = value; }, () => frame);
    const processor = new Processor();
    return { messages, processor, setFrame: (value: number) => { frame = value; } };
  }

  it('handles variable render block sizes, indexes fixed chunks, and outputs silence', () => {
    const { messages, processor, setFrame } = makeProcessor();
    let frame = 5000;
    for (const length of [128, 512, 1000, 2048, 512]) {
      setFrame(frame);
      const output = new Float32Array(length).fill(1);
      expect(processor.process([[new Float32Array(length).fill(0.25)]], [[output]])).toBe(true);
      expect(output.every(value => value === 0)).toBe(true);
      frame += length;
    }
    expect(messages).toHaveLength(2);
    expect(messages.map(message => message.startSample)).toEqual([0, 2048]);
    expect(messages.every(message => message.samples?.length === 2048)).toBe(true);
    expect(messages.every(message => message.samples?.every(value => value === 0.25))).toBe(true);
  });

  it.each(['render gap', 'missing input', 'empty input'] as const)('discards provisional startup samples after %s and commits only fresh contiguous chunks', interruption => {
    const { messages, processor, setFrame } = makeProcessor();
    setFrame(5000);
    const provisionalOutput = new Float32Array(128).fill(1);
    processor.process([[new Float32Array(128).fill(-0.75)]], [[provisionalOutput]]);
    expect(provisionalOutput.every(value => value === 0)).toBe(true);
    expect(messages).toHaveLength(0);
    if (interruption !== 'render gap') {
      setFrame(5128);
      const output = new Float32Array(128).fill(1);
      processor.process(interruption === 'missing input' ? [] : [[new Float32Array(0)]], [[output]]);
      expect(output.every(value => value === 0)).toBe(true);
      expect(messages).toHaveLength(0);
    }
    let frame = 9000;
    let sample = 0;
    for (const length of [1536, 768, 1792]) {
      setFrame(frame);
      const input = Float32Array.from({ length }, (_, index) => 100 + sample + index);
      const outputs = [[new Float32Array(length).fill(1), new Float32Array(length).fill(1)]];
      processor.process([[input, new Float32Array(length).fill(-1)]], outputs);
      expect(outputs.flat().every(channel => channel.every(value => value === 0))).toBe(true);
      sample += length;
      frame += length;
    }
    expect(messages.map(message => message.type)).toEqual(['chunk', 'chunk']);
    expect(messages.map(message => message.startSample)).toEqual([0, 2048]);
    expect(Array.from(messages[0].samples!)).toEqual(Array.from({ length: 2048 }, (_, index) => 100 + index));
    expect(Array.from(messages[1].samples!)).toEqual(Array.from({ length: 2048 }, (_, index) => 2148 + index));
  });

  it('can discard repeated uncommitted starts without sending a chunk or filling missing audio', () => {
    const { messages, processor, setFrame } = makeProcessor();
    for (let frame = 0; frame < 4096; frame += 512) {
      setFrame(frame);
      processor.process([[new Float32Array(128).fill(0.75)]], [[]]);
    }
    expect(messages).toHaveLength(0);
    setFrame(8192);
    processor.process([[new Float32Array(2048).fill(0.25)]], [[]]);
    expect(messages).toHaveLength(1);
    expect(messages[0].startSample).toBe(0);
    expect(messages[0].samples?.every(value => value === 0.25)).toBe(true);
  });

  it('detects render gaps after the first committed chunk rather than joining discontinuous audio', () => {
    const { messages, processor, setFrame } = makeProcessor();
    processor.process([[new Float32Array(2048)]], [[]]);
    setFrame(2176);
    const output = new Float32Array(128).fill(1);
    processor.process([[new Float32Array(128)]], [[output]]);
    expect(output.every(value => value === 0)).toBe(true);
    expect(messages.map(message => message.type)).toEqual(['chunk', 'interrupted']);
    setFrame(2304);
    processor.process([[new Float32Array(4096)]], [[]]);
    expect(messages).toHaveLength(2);
  });

  it.each(['missing input', 'empty input'] as const)('fails closed on %s immediately after the first committed chunk', interruption => {
    const { messages, processor, setFrame } = makeProcessor();
    processor.process([[new Float32Array(2048)]], [[]]);
    setFrame(2048);
    const output = new Float32Array(128).fill(1);
    processor.process(interruption === 'missing input' ? [] : [[new Float32Array(0)]], [[output]]);
    expect(output.every(value => value === 0)).toBe(true);
    expect(messages.map(message => message.type)).toEqual(['chunk', 'interrupted']);
    setFrame(2176);
    processor.process([[new Float32Array(4096)]], [[]]);
    expect(messages).toHaveLength(2);
  });
});

describe('microphone lifetime', () => {
  it.each([
    [44100, 15], [44100, 30], [48000, 15], [48000, 30],
  ] as const)('records the selected duration at %i Hz for %i seconds rather than stopping at five', async (fs, durationSeconds) => {
    MockContext.captureSampleRate = fs;
    const progress = vi.fn();
    const settled = vi.fn();
    const pending = startCapture({ durationSeconds, onProgress: progress, signal: new AbortController().signal });
    void pending.then(settled);
    await vi.waitFor(() => expect(MockWorklet.latest?.port.onmessage).toBeTypeOf('function'));
    const worklet = MockWorklet.latest!;
    const firstSamples = Math.round(5.5 * fs);
    worklet.port.onmessage!({ data: { type: 'chunk', startSample: 0, samples: new Float32Array(firstSamples).fill(0.1) } });
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    expect(track.stop).not.toHaveBeenCalled();
    expect(progress).toHaveBeenLastCalledWith('recording', 5 / durationSeconds);
    for (let startSample = firstSamples; startSample < fs * (durationSeconds + 0.5); startSample += 2048) {
      worklet.port.onmessage?.({ data: { type: 'chunk', startSample, samples: new Float32Array(2048).fill(0.2) } });
    }
    const result = await pending;
    expect(result.pcm).toHaveLength(fs * durationSeconds);
    expect(result.pcm[0]).toBeCloseTo(0.1, 6);
    expect(result.pcm.at(-1)).toBeCloseTo(0.2, 6);
    expect(result.meta.deviceSettings).toMatchObject({ requestedCaptureDurationSeconds: durationSeconds, captureWarmupSeconds: 0.5 });
    expect(progress).toHaveBeenLastCalledWith('recording', 1);
    expect(progress.mock.calls.every(([, fraction]) => fraction >= 0 && fraction <= 1)).toBe(true);
    expect(track.stop).toHaveBeenCalledOnce();
    expect(worklet.port.close).toHaveBeenCalledOnce();
    expect(MockContext.instances[0].close).toHaveBeenCalledOnce();
  });

  it.each([15, 30] as const)('releases an unfinished %i-second recording after cancellation beyond the first five seconds', async durationSeconds => {
    const controller = new AbortController();
    const pending = startCapture({ durationSeconds, onProgress: () => {}, signal: controller.signal });
    const outcome = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(MockWorklet.latest?.port.onmessage).toBeTypeOf('function'));
    MockWorklet.latest!.port.onmessage!({ data: { type: 'chunk', startSample: 0, samples: new Float32Array(48000 * 6.5).fill(0.1) } });
    expect(track.stop).not.toHaveBeenCalled();
    controller.abort();
    await outcome;
    expect(track.stop).toHaveBeenCalledOnce();
    expect(MockWorklet.latest!.port.onmessage).toBeNull();
    expect(MockWorklet.latest!.port.close).toHaveBeenCalledOnce();
    expect(MockContext.instances[0].close).toHaveBeenCalledOnce();
  });

  it('rejects unsupported duration before requesting microphone access', async () => {
    await expect(startCapture({ durationSeconds: 10 as never, onProgress: () => {}, signal: new AbortController().signal })).rejects.toMatchObject({ code: 'invalid-duration' });
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(MockContext.instances).toHaveLength(0);
  });

  it('previews actual warm-up and recording chunks and ignores callbacks after completion', async () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const onMeter = vi.fn();
    const onProgress = vi.fn();
    const pending = startCapture({ onProgress, onMeter, signal: new AbortController().signal });
    await vi.waitFor(() => expect(MockWorklet.latest?.port.onmessage).toBeTypeOf('function'));
    const handler = MockWorklet.latest!.port.onmessage!;
    for (let startSample = 0; startSample < 48000 * 5.5; startSample += 2048) {
      handler({ data: { type: 'chunk', startSample, samples: new Float32Array(2048).fill(startSample < 24000 ? 0.1 : 0.5) } });
      now += 50;
    }
    await pending;
    expect(onMeter.mock.calls[0][0].rms).toBeCloseTo(0.1, 6);
    expect(onMeter.mock.calls.at(-1)![0].rms).toBeCloseTo(0.5, 6);
    expect(onMeter.mock.calls.at(-1)![0].levelDb).toBeCloseTo(-6.0206, 4);
    expect(onProgress).toHaveBeenCalledWith('warming-up', 0);
    expect(onProgress).toHaveBeenLastCalledWith('recording', 1);
    const count = onMeter.mock.calls.length;
    handler({ data: { type: 'chunk', startSample: 999999, samples: new Float32Array([1]) } });
    expect(onMeter).toHaveBeenCalledTimes(count);
  });

  it('stops preview callbacks immediately when cancellation is requested', async () => {
    const onMeter = vi.fn();
    const controller = new AbortController();
    const pending = startCapture({ onProgress: () => {}, onMeter, signal: controller.signal });
    const outcome = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(MockWorklet.latest?.port.onmessage).toBeTypeOf('function'));
    const handler = MockWorklet.latest!.port.onmessage!;
    handler({ data: { type: 'chunk', startSample: 0, samples: new Float32Array(2048).fill(0.1) } });
    expect(onMeter).toHaveBeenCalledOnce();
    controller.abort();
    handler({ data: { type: 'chunk', startSample: 2048, samples: new Float32Array(2048).fill(1) } });
    await outcome;
    expect(onMeter).toHaveBeenCalledOnce();
    expect(MockWorklet.latest!.port.onmessage).toBeNull();
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it('records a fresh exact sample count through a silent graph and releases every resource', async () => {
    const progress = vi.fn();
    const pending = startCapture({ onProgress: progress, signal: new AbortController().signal });
    await vi.waitFor(() => expect(MockWorklet.latest?.port.onmessage).toBeTypeOf('function'));
    const worklet = MockWorklet.latest!;
    for (let startSample = 0; startSample < 48000 * 5.5; startSample += 2048) {
      worklet.port.onmessage?.({ data: { type: 'chunk', startSample, samples: new Float32Array(2048).fill(0.1) } });
    }
    const result = await pending;
    expect(result.pcm.length).toBe(240000);
    expect(result.fs).toBe(48000);
    expect(result.meta.qualityCodes).toEqual([]);
    expect(result.meta.deviceSettings).not.toHaveProperty('deviceId');
    expect(progress).toHaveBeenCalledWith('permission-pending', 0);
    expect(progress).toHaveBeenLastCalledWith('recording', 1);
    expect(getUserMedia).toHaveBeenCalledWith({ audio: { channelCount: { ideal: 1 }, echoCancellation: { ideal: false }, noiseSuppression: { ideal: false }, autoGainControl: { ideal: false } }, video: false });
    expect(MockContext.instances[0].gain.gain.value).toBe(0);
    expect(MockContext.instances[0].source.disconnect).toHaveBeenCalledOnce();
    expect(worklet.disconnect).toHaveBeenCalledOnce();
    expect(worklet.port.close).toHaveBeenCalledOnce();
    expect(MockContext.instances[0].close).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it('cancels an unanswered permission request and stops a stream granted later', async () => {
    let grant!: (value: ReturnType<typeof streamFor>) => void;
    getUserMedia.mockImplementation(() => new Promise(resolve => { grant = resolve; }));
    const controller = new AbortController();
    const pending = startCapture({ onProgress: () => {}, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(MockContext.instances[0].close).toHaveBeenCalledOnce();
    grant(streamFor(track));
    await Promise.resolve();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(MockWorklet.latest).toBeUndefined();
  });

  it('fails an interrupted visible-tab recording and closes the device', async () => {
    const pending = startCapture({ onProgress: () => {}, signal: new AbortController().signal });
    await vi.waitFor(() => expect(MockWorklet.latest).toBeDefined());
    const outcome = expect(pending).rejects.toMatchObject({ code: 'incomplete' });
    documentMock.visibilityState = 'hidden';
    documentMock.dispatchEvent(new Event('visibilitychange'));
    await outcome;
    expect(track.stop).toHaveBeenCalledOnce();
    expect(MockContext.instances[0].close).toHaveBeenCalledOnce();
  });

  it('explains denied permission and closes the context', async () => {
    getUserMedia.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    await expect(startCapture({ onProgress: () => {}, signal: new AbortController().signal })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(MockContext.instances[0].close).toHaveBeenCalledOnce();
  });

  it('warns separately about active and unavailable processing settings', async () => {
    track.getSettings = () => ({ sampleRate: 48000, channelCount: 1, echoCancellation: true } as ReturnType<MockTrack['getSettings']>);
    const pending = startCapture({ onProgress: () => {}, signal: new AbortController().signal });
    await vi.waitFor(() => expect(MockWorklet.latest?.port.onmessage).toBeTypeOf('function'));
    for (let startSample = 0; startSample < 48000 * 5.5; startSample += 2048) {
      MockWorklet.latest!.port.onmessage?.({ data: { type: 'chunk', startSample, samples: new Float32Array(2048) } });
    }
    expect((await pending).meta.qualityCodes).toEqual(['processing-active', 'processing-unknown']);
  });
});

describe('local import', () => {
  const file = (size = 2000) => ({ name: 'resident.wav', size, arrayBuffer: async () => new ArrayBuffer(8) }) as File;

  it.each([
    [44100, 15], [44100, 30], [48000, 15], [48000, 30],
  ] as const)('crops the first channel from zero for %i Hz and %i selected seconds', async (fs, durationSeconds) => {
    const firstChannel = Float32Array.from({ length: fs * 31 }, (_, index) => index / (fs * 100));
    const getChannelData = vi.fn((channel: number) => channel === 0 ? firstChannel : Float32Array.from(firstChannel, value => -value));
    decodedBuffer = { sampleRate: fs, numberOfChannels: 2, length: firstChannel.length, getChannelData };
    const result = await decodeAudioFile(file(), undefined, durationSeconds);
    expect(result.pcm).toHaveLength(fs * durationSeconds);
    expect(result.pcm[0]).toBe(firstChannel[0]);
    expect(result.pcm.at(-1)).toBe(firstChannel[fs * durationSeconds - 1]);
    expect(getChannelData).toHaveBeenCalledExactlyOnceWith(0);
    expect(result.pcm.buffer).not.toBe(firstChannel.buffer);
    expect(result.meta.deviceSettings).toMatchObject({ effectiveSampleRateHz: fs, cropOffsetSeconds: 0, cropDurationSeconds: durationSeconds, decodedDurationSeconds: 31 });
    expect(MockContext.instances[0].close).toHaveBeenCalledOnce();
  });

  it.each([15, 30] as const)('explains the selected %i-second minimum without padding a shorter file', async durationSeconds => {
    decodedBuffer.length = 48000 * (durationSeconds - 1);
    await expect(decodeAudioFile(file(), undefined, durationSeconds)).rejects.toMatchObject({ code: 'file-too-short', message: expect.stringContaining(`at least ${durationSeconds} seconds`) });
    expect(MockContext.instances[0].close).toHaveBeenCalledOnce();
  });

  it('rejects unsupported file duration before reading the file or creating a decoder', async () => {
    const source = file();
    const read = vi.spyOn(source, 'arrayBuffer');
    await expect(decodeAudioFile(source, undefined, 10 as never)).rejects.toMatchObject({ code: 'invalid-duration' });
    expect(read).not.toHaveBeenCalled();
    expect(MockContext.instances).toHaveLength(0);
  });

  it('takes first-channel samples from offset zero and retains effective decode provenance', async () => {
    const result = await decodeAudioFile(file());
    expect(result.pcm).toHaveLength(240000);
    expect(result.pcm[0]).toBe(0.25);
    expect(result.meta.channelPolicy).toBe('first-channel');
    expect(result.meta.recordedAtUtc).toBeNull();
    expect(result.meta.qualityCodes).toEqual(['imported-processing-unknown']);
    expect(result.meta.deviceSettings).toMatchObject({ effectiveSampleRateHz: 48000, decodedChannels: 2, cropOffsetSeconds: 0 });
    expect(MockContext.instances[0].close).toHaveBeenCalledOnce();
  });

  it('rejects files shorter than five seconds without looping or padding', async () => {
    decodedBuffer.length = 48000 * 4;
    await expect(decodeAudioFile(file())).rejects.toMatchObject({ code: 'file-too-short' });
    expect(MockContext.instances[0].close).toHaveBeenCalledOnce();
  });

  it('rejects files over 10 MB before reading or creating a decoder', async () => {
    await expect(decodeAudioFile(file(MAX_FILE_BYTES + 1))).rejects.toMatchObject({ code: 'file-too-large' });
    expect(MockContext.instances).toHaveLength(0);
  });

  it('releases the decoder when decoding fails', async () => {
    MockContext.decodeFailure = new Error('Unsupported encoding');
    await expect(decodeAudioFile(file())).rejects.toMatchObject({ code: 'decode-failed' });
    expect(MockContext.instances[0].close).toHaveBeenCalledOnce();
  });
});
