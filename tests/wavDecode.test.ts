import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wavSampleRateHint } from '../src/audio/wavRate';
import { decodeAudioFile } from '../src/audio/decode';

const ascii = (text: string) => Uint8Array.from(text, character => character.charCodeAt(0));
function chunk(id: string, data: Uint8Array): Uint8Array {
  const result = new Uint8Array(8 + data.length + data.length % 2);
  result.set(ascii(id)); new DataView(result.buffer).setUint32(4, data.length, true); result.set(data, 8);
  return result;
}
function format(rate: number, size = 16): Uint8Array {
  const data = new Uint8Array(size);
  const view = new DataView(data.buffer);
  if (size >= 8) { view.setUint16(0, 1, true); view.setUint16(2, 2, true); view.setUint32(4, rate, true); }
  if (size >= 16) { view.setUint32(8, rate * 4, true); view.setUint16(12, 4, true); view.setUint16(14, 16, true); }
  return chunk('fmt ', data);
}
function riff(...chunks: Uint8Array[]): ArrayBuffer {
  const data = new Uint8Array(12 + chunks.reduce((sum, value) => sum + value.length, 0));
  data.set(ascii('RIFF')); new DataView(data.buffer).setUint32(4, data.length - 8, true); data.set(ascii('WAVE'), 8);
  let offset = 12; for (const value of chunks) { data.set(value, offset); offset += value.length; }
  return data.buffer;
}
const wav = (rate: number) => riff(format(rate), chunk('data', new Uint8Array(8)));

describe('bounded WAV sample-rate hint', () => {
  it.each([44100, 48000])('reads %i Hz through padded unknown chunks without relying on an extension', rate => {
    const encoded = riff(chunk('JUNK', new Uint8Array([1, 2, 3])), format(rate, 18), chunk('data', new Uint8Array(8)));
    const before = new Uint8Array(encoded).slice();
    expect(wavSampleRateHint(encoded)).toBe(rate);
    expect(new Uint8Array(encoded)).toEqual(before);
  });

  it.each([8000, 16000, 32000, 96000, 0, 0xffffffff])('retains default decoding for unsupported encoded rate %i', rate => {
    expect(wavSampleRateHint(wav(rate))).toBeNull();
  });

  it('rejects non-WAV, truncated headers, short fmt, missing padding and ambiguous fmt', () => {
    for (let size = 0; size < 12; size += 1) expect(wavSampleRateHint(new ArrayBuffer(size))).toBeNull();
    const wrongContainer = wav(44100); new DataView(wrongContainer).setUint8(0, 0);
    const wrongType = wav(44100); new DataView(wrongType).setUint8(8, 0);
    const oversizedRiff = wav(44100); new DataView(oversizedRiff).setUint32(4, 0xffffffff, true);
    const oversizedChunk = wav(44100); new DataView(oversizedChunk).setUint32(16, 0xffffffff, true);
    const trailingPartialHeader = riff(format(44100), new Uint8Array(4));
    const missingPadding = riff(format(44100), chunk('JUNK', new Uint8Array(1))).slice(0, -1);
    new DataView(missingPadding).setUint32(4, missingPadding.byteLength - 8, true);
    for (const encoded of [wrongContainer, wrongType, oversizedRiff, oversizedChunk, trailingPartialHeader, missingPadding,
      riff(format(44100, 15)), riff(format(44100), format(48000)), riff(format(44100), format(44100))]) {
      expect(wavSampleRateHint(encoded)).toBeNull();
    }
  });

  it('does not scan beyond RIFF bounds or more than 4096 chunks', () => {
    const encoded = riff(chunk('JUNK', new Uint8Array(0)), format(44100));
    new DataView(encoded).setUint32(4, 12, true); // RIFF ends before fmt
    expect(wavSampleRateHint(encoded)).toBeNull();
    expect(wavSampleRateHint(riff(...Array.from({ length: 4096 }, () => chunk('JUNK', new Uint8Array(0))), format(44100)))).toBeNull();
  });
});

describe('WAV-rate browser decoding', () => {
  let failHint: boolean;
  let rejectDecode: boolean;
  let decodeRateOverride: number | null;
  let pendingDecode: Promise<never> | null;
  let contexts: Array<{ sampleRate: number; state: string; decodeAudioData: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }>;
  let construct: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    failHint = false; rejectDecode = false; decodeRateOverride = null; pendingDecode = null; contexts = [];
    construct = vi.fn(function (options?: AudioContextOptions) {
      if (options && failHint) throw new Error('Requested sample rate unavailable');
      const rate = options?.sampleRate ?? 48000;
      const context = { sampleRate: rate, state: 'suspended', close: vi.fn(async () => { context.state = 'closed'; }),
        decodeAudioData: vi.fn(async () => {
          if (rejectDecode) throw new Error('Invalid encoded waveform');
          if (pendingDecode) return await pendingDecode;
          const effective = decodeRateOverride ?? rate;
          return { sampleRate: effective, numberOfChannels: 2, length: effective * 31,
            getChannelData: (channel: number) => new Float32Array(effective * 31).fill(channel === 0 ? 0.25 : -0.25) };
        }) };
      contexts.push(context); return context;
    });
    vi.stubGlobal('AudioContext', construct);
  });
  afterEach(() => vi.unstubAllGlobals());
  const file = (encoded: ArrayBuffer) => ({ name: 'recording.data', size: encoded.byteLength, arrayBuffer: async () => encoded }) as File;

  it.each([[44100, 5], [44100, 15], [44100, 30], [48000, 5], [48000, 15], [48000, 30]] as const)('requests encoded %i Hz and retains exact %i-second first-channel cropping', async (rate, duration) => {
    const encoded = wav(rate);
    const result = await decodeAudioFile(file(encoded), undefined, duration);
    expect(construct).toHaveBeenCalledExactlyOnceWith({ sampleRate: rate });
    expect(contexts[0].decodeAudioData).toHaveBeenCalledExactlyOnceWith(encoded);
    expect(result.fs).toBe(rate); expect(result.pcm).toHaveLength(rate * duration);
    expect(result.pcm[0]).toBe(0.25); expect(result.pcm.at(-1)).toBe(0.25);
    expect(result.meta.deviceSettings).toMatchObject({ wavSampleRateHintHz: rate, effectiveSampleRateHz: rate,
      sampleRateHintMatched: true, decodeRateRequestFallback: false, cropOffsetSeconds: 0, cropDurationSeconds: duration });
    expect(contexts[0].close).toHaveBeenCalledOnce();
  });

  it('keeps unrecognized containers on the disclosed default browser path', async () => {
    const result = await decodeAudioFile(file(new ArrayBuffer(8)));
    expect(construct.mock.calls[0]).toEqual([]);
    expect(result.meta.deviceSettings).toMatchObject({ wavSampleRateHintHz: null, sampleRateHintMatched: null, effectiveSampleRateHz: 48000 });
  });

  it('falls back honestly if the requested context cannot be created', async () => {
    failHint = true;
    const result = await decodeAudioFile(file(wav(44100)));
    expect(construct.mock.calls).toEqual([[{ sampleRate: 44100 }], []]);
    expect(result.fs).toBe(48000);
    expect(result.meta.deviceSettings).toMatchObject({ wavSampleRateHintHz: 44100, requestedDecodeSampleRateHz: 44100,
      decodeRateRequestFallback: true, sampleRateHintMatched: false, effectiveSampleRateHz: 48000 });
    expect(contexts[0].close).toHaveBeenCalledOnce();
  });

  it('uses the actual decoded rate if a browser does not match the hint', async () => {
    decodeRateOverride = 48000;
    const result = await decodeAudioFile(file(wav(44100)));
    expect(result.fs).toBe(48000); expect(result.pcm).toHaveLength(240000);
    expect(result.meta.deviceSettings).toMatchObject({ wavSampleRateHintHz: 44100, sampleRateHintMatched: false });
  });

  it('leaves format validation to the browser and closes a rejected decode', async () => {
    rejectDecode = true;
    await expect(decodeAudioFile(file(wav(44100)))).rejects.toMatchObject({ code: 'decode-failed' });
    expect(contexts[0].close).toHaveBeenCalledOnce();
  });

  it('closes a hinted decoder when its pending decode is cancelled', async () => {
    pendingDecode = new Promise<never>(() => {});
    const controller = new AbortController();
    const pending = decodeAudioFile(file(wav(44100)), controller.signal);
    const outcome = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(contexts[0]?.decodeAudioData).toHaveBeenCalledOnce());
    controller.abort(); await outcome;
    expect(contexts[0].close).toHaveBeenCalledOnce();
  });
});
