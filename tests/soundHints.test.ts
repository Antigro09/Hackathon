import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SOUND_HINT_LABELS } from '../src/ai/labels';
import { SOUND_HINT_MODEL } from '../src/ai/model';
import { pinSoundHintDownloads } from '../src/ai/environment';
import { evaluateSoundHintRankings, soundHintsBlockedReason, validateSoundHintPcm } from '../src/ai/policy';
import { resampleForSoundHints, soundHintResampleLength } from '../src/ai/resample';
import type { SoundHintsRequest, SoundHintsResponse } from '../src/ai/types';
import type { QualityCode } from '../src/types';

const library = vi.hoisted(() => ({
  pipeline: vi.fn(),
  env: { allowLocalModels: true, useBrowserCache: false, remoteHost: '', remotePathTemplate: '', backends: { onnx: { wasm: { numThreads: 8, proxy: true } } } },
}));
vi.mock('@huggingface/transformers', () => library);

function comparison(top = 0.7, second = 0.2) {
  return SOUND_HINT_LABELS.map((label, index) => ({ label, score: index === 0 ? top : index === 1 ? second : (1 - top - second) / 6 }));
}

function signal(fs = 48000) {
  return Float32Array.from({ length: fs * 5 }, (_, n) => 0.1 * Math.sin(2 * Math.PI * 1000 * n / fs));
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('experimental comparison policy', () => {
  it('freezes all eight alternatives, including speech, wind, traffic, household equipment and quiet', () => {
    expect(SOUND_HINT_LABELS).toHaveLength(8);
    expect(new Set(SOUND_HINT_LABELS).size).toBe(8);
    expect(SOUND_HINT_LABELS.join(' ')).toMatch(/light fixture.*transformer.*industrial.*household.*traffic.*wind.*talking.*quiet/);
  });

  it('shows at most two relative rankings without promoting a strong score into a confirmed source', () => {
    const raw = comparison().reverse();
    const original = structuredClone(raw);
    const decision = evaluateSoundHintRankings(raw);
    expect(decision).toMatchObject({ status: 'uncertain', reason: 'not-validated', provisionalGatePassed: true });
    expect(decision.rankings).toEqual(comparison().slice(0, 2));
    expect(raw).toEqual(original);
  });

  it.each([[0.54, 0.1], [0.55, 0.4], [0.125, 0.125]])('abstains when provisional separation is weak (%f, %f)', (top, second) => {
    expect(evaluateSoundHintRankings(comparison(top, second))).toMatchObject({ status: 'uncertain', reason: 'weak-separation', provisionalGatePassed: false });
  });

  it.each([
    comparison().slice(1),
    [...comparison().slice(1), comparison()[1]],
    [{ label: 'a data center', score: 0.7 }, ...comparison().slice(1)],
    comparison().map((item, i) => i === 0 ? { ...item, score: NaN } : item),
    comparison().map((item, i) => i === 0 ? { ...item, score: 1.1 } : item),
  ].map(raw => ({ raw })))('rejects incomplete, duplicated, unknown or invalid model outputs', ({ raw }) => {
    expect(() => evaluateSoundHintRankings(raw)).toThrow(/invalid comparison/);
  });

  it.each<QualityCode>(['near-zero', 'clipped', 'near-full-scale', 'incomplete', 'unsupported-rate', 'non-finite', 'no-band-power'])('blocks %s before a model request', code => {
    expect(soundHintsBlockedReason([code])).toMatch(/quality/);
    expect(() => validateSoundHintPcm(signal(), 48000, [code])).toThrow(/quality/);
  });

  it('retains microphone/import processing warnings without pretending they prove an unusable recording', () => {
    expect(soundHintsBlockedReason(['processing-active', 'processing-unknown', 'imported-processing-unknown'])).toBeNull();
  });

  it('independently rejects silence, invalid values, clipping, wrong duration and relabeled samples', () => {
    expect(() => validateSoundHintPcm(new Float32Array(240000), 48000, [])).toThrow(/too little signal/);
    for (const bad of [NaN, Infinity, 1, -1]) {
      const pcm = signal(); pcm[100] = bad;
      expect(() => validateSoundHintPcm(pcm, 48000, [])).toThrow(/invalid or clipped/);
    }
    expect(() => validateSoundHintPcm(signal(44100), 48000, [])).toThrow(/five-second/);
    expect(() => validateSoundHintPcm(signal(), 44100, [])).toThrow(/48 kHz/);
    expect(() => validateSoundHintPcm(signal(), 48000, [])).not.toThrow();
  });
});

describe('separate model resampling', () => {
  it('copies 48 kHz data without detaching or mutating the DSP input', async () => {
    const pcm = signal();
    const output = await resampleForSoundHints(pcm, 48000);
    expect(output).toEqual(pcm);
    expect(output.buffer).not.toBe(pcm.buffer);
    output[1] = 0.9;
    expect(pcm[1]).not.toBe(output[1]);
  });

  it.each([[220500, 44100, 240000], [240000, 48000, 240000], [7, 44100, 8]])('uses ceil(%i × 48000 / %i) = %i samples', (length, fs, expected) => {
    expect(soundHintResampleLength(length, fs)).toBe(expected);
  });

  it('converts the true source rate locally without Web Audio or DSP mutation', async () => {
    vi.stubGlobal('OfflineAudioContext', undefined);
    const pcm = signal(44100);
    const before = pcm.slice();
    const rendered = await resampleForSoundHints(pcm, 44100);
    expect(rendered.length / 48000).toBe(5);
    expect(pcm).toEqual(before);
    expect(rendered.buffer).not.toBe(pcm.buffer);
    expect(rendered[12012]).toBeCloseTo(0.1 * Math.sin(2 * Math.PI * 1000 * 12012 / 48000), 3);
  });

  it('rejects invalid samples and duration before requesting a model', async () => {
    await expect(resampleForSoundHints(new Float32Array([NaN]), 48000)).rejects.toThrow(/invalid audio/);
    await expect(resampleForSoundHints(signal(44100), 48000)).rejects.toThrow(/exactly five seconds/);
    expect(() => soundHintResampleLength(0, 44100)).toThrow(/invalid/);
    expect(() => soundHintResampleLength(44100, 0)).toThrow(/invalid/);
  });
});

describe('local worker lifecycle', () => {
  let messages: SoundHintsResponse[];
  let worker: { onmessage: null | ((event: { data: SoundHintsRequest }) => Promise<void>); postMessage: (value: SoundHintsResponse) => void };
  let classify: ReturnType<typeof vi.fn> & { dispose: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.resetModules();
    messages = [];
    worker = { onmessage: null, postMessage: value => messages.push(value) };
    vi.stubGlobal('self', worker);
    classify = Object.assign(vi.fn(async () => comparison()), { dispose: vi.fn(async () => {}) });
    library.pipeline.mockReset().mockResolvedValue(classify);
    await import('../src/ai/soundHints.worker');
  });

  const request = (sessionId = 42): SoundHintsRequest => ({
    type: 'classify', sessionId, pcm: signal(), sampleRateHz: 48000,
    originalSampleRateHz: 44100, originalSampleCount: 220500, qualityCodes: [],
  });

  it('does not load a library/model on worker creation or invalid input', async () => {
    expect(library.pipeline).not.toHaveBeenCalled();
    await worker.onmessage!({ data: { ...request(), qualityCodes: ['clipped'] } });
    expect(library.pipeline).not.toHaveBeenCalled();
    expect(messages).toEqual([expect.objectContaining({ type: 'error', sessionId: 42, code: 'invalid-input' })]);
  });

  it('pins quantized WASM, uses local PCM, preserves preprocessing and reuses a warm model', async () => {
    await worker.onmessage!({ data: request() });
    expect(library.pipeline).toHaveBeenCalledWith('zero-shot-audio-classification', SOUND_HINT_MODEL.id,
      expect.objectContaining({ revision: SOUND_HINT_MODEL.revision, dtype: 'q8', device: 'wasm' }));
    expect(library.env.backends.onnx.wasm).toEqual({ numThreads: 1, proxy: false });
    expect(library.env.remotePathTemplate).toBe(`{model}/resolve/${SOUND_HINT_MODEL.revision}/`);
    expect(classify).toHaveBeenCalledWith(expect.any(Float32Array), [...SOUND_HINT_LABELS], { hypothesis_template: '{}' });
    expect(messages.find(message => message.type === 'result')).toMatchObject({
      type: 'result', sessionId: 42,
      result: { status: 'uncertain', reason: 'not-validated', preprocessing: { originalSampleRateHz: 44100, originalSampleCount: 220500, observationSeconds: 5, modelSampleRateHz: 48000, modelInputSamples: 240000, processorSeconds: 10, padding: 'zero-pad', configuredPadding: 'repeatpad', featureBandHz: [50, 14000] }, timing: { reusedModel: false } },
    });
    await worker.onmessage!({ data: request(43) });
    expect(library.pipeline).toHaveBeenCalledOnce();
    expect(classify).toHaveBeenCalledTimes(2);
    expect(messages.at(-1)).toMatchObject({ type: 'result', sessionId: 43, result: { timing: { reusedModel: true } } });
  });

  it('isolates download failure and allows a fresh retry', async () => {
    library.pipeline.mockRejectedValueOnce(new Error('Network error'));
    await worker.onmessage!({ data: request() });
    expect(messages.at(-1)).toMatchObject({ type: 'error', sessionId: 42, code: 'unavailable', message: expect.stringContaining('Standard analysis and reports are still available') });
    await worker.onmessage!({ data: request(43) });
    expect(messages.at(-1)).toMatchObject({ type: 'result', sessionId: 43 });
  });

  it('disposes a failed inference before retrying with a fresh runtime', async () => {
    classify.mockRejectedValueOnce(new Error('Out of memory'));
    await worker.onmessage!({ data: request() });
    expect(classify.dispose).toHaveBeenCalledOnce();
    expect(messages.at(-1)).toMatchObject({ type: 'error', sessionId: 42, code: 'runtime' });
    await worker.onmessage!({ data: request(43) });
    expect(library.pipeline).toHaveBeenCalledTimes(2);
    expect(messages.at(-1)).toMatchObject({ type: 'result', sessionId: 43 });
  });
});

describe('pinned model preprocessing behavior', () => {
  it('verifies the actual 4.3.1 processor pads an exact five-second input with zeros, despite the repeatpad setting', async () => {
    const { ClapFeatureExtractor, Tensor, env } = await vi.importActual<typeof import('@huggingface/transformers')>('@huggingface/transformers');
    expect(env.version).toBe(SOUND_HINT_MODEL.packageVersion);
    const extractor = new ClapFeatureExtractor({
      nb_frequency_bins: 513, feature_size: 64, frequency_min: 50, frequency_max: 14000,
      sampling_rate: 48000, fft_window_size: 1024, hop_length: 480, nb_max_samples: 480000,
      truncation: 'rand_trunc', padding: 'repeatpad',
    });
    let padded: Float32Array | Float64Array | undefined;
    // Inspect the real processor's padding without running a model or the FFT.
    const features = vi.spyOn(extractor, '_extract_fbank_features').mockImplementation(async waveform => {
      padded = waveform.slice();
      return new Tensor('float32', new Float32Array(1), [1]);
    });
    const pcm = signal();
    await extractor._call(pcm);
    expect(features).toHaveBeenCalledOnce();
    expect(padded).toHaveLength(480000);
    expect(Array.from(padded!.subarray(0, 240000))).toEqual(Array.from(pcm));
    expect(padded!.subarray(240000).every(sample => sample === 0)).toBe(true);
    expect(pcm).toHaveLength(240000);
  });
});

describe('immutable model downloads', () => {
  it('pins actual library discovery requests even when v4 metadata helpers omit the revision', async () => {
    const { ModelRegistry, AutoConfig, env } = await vi.importActual<typeof import('@huggingface/transformers')>('@huggingface/transformers');
    const previous = {
      remoteHost: env.remoteHost, remotePathTemplate: env.remotePathTemplate, allowLocalModels: env.allowLocalModels,
      allowRemoteModels: env.allowRemoteModels, useBrowserCache: env.useBrowserCache,
      useFS: env.useFS, useFSCache: env.useFSCache, fetch: env.fetch,
    };
    const requests: string[] = [];
    try {
      pinSoundHintDownloads(env);
      env.allowRemoteModels = true;
      env.useFS = false;
      env.useFSCache = false;
      env.useBrowserCache = false;
      env.fetch = async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        requests.push(url);
        expect(init?.method ?? 'GET').toBe('GET');
        expect(init?.body).toBeUndefined();
        expect(url).toContain(`/${SOUND_HINT_MODEL.id}/resolve/${SOUND_HINT_MODEL.revision}/`);
        expect(url).not.toContain('/resolve/main/');
        if (new Headers(init?.headers).has('Range')) {
          return new Response(new Uint8Array([0]), { status: 206, headers: { 'Content-Range': 'bytes 0-0/100', 'Content-Type': 'application/octet-stream' } });
        }
        return new Response(JSON.stringify({ model_type: 'clap', architectures: ['ClapModel'] }), { headers: { 'Content-Type': 'application/json' } });
      };
      // These are the actual metadata helpers used by pipeline(), deliberately
      // called without revision to reproduce its otherwise mutable discovery.
      const files = await ModelRegistry.get_pipeline_files('zero-shot-audio-classification', SOUND_HINT_MODEL.id, { dtype: 'q8', device: 'wasm' });
      await Promise.all(files.map(file => ModelRegistry.get_file_metadata(SOUND_HINT_MODEL.id, file)));
      // The final component loader uses an explicit revision. Both paths must
      // address exactly the same immutable URL rather than separate cache keys.
      await AutoConfig.from_pretrained(SOUND_HINT_MODEL.id, { revision: SOUND_HINT_MODEL.revision });
      expect(files).toContain('onnx/model_quantized.onnx');
      expect(requests).toContain(`https://huggingface.co/${SOUND_HINT_MODEL.id}/resolve/${SOUND_HINT_MODEL.revision}/onnx/model_quantized.onnx`);
      expect(requests.length).toBeGreaterThan(2);
      expect(requests.every(url => url.startsWith(`https://huggingface.co/${SOUND_HINT_MODEL.id}/resolve/${SOUND_HINT_MODEL.revision}/`))).toBe(true);
    } finally {
      Object.assign(env, previous);
    }
  });
});
