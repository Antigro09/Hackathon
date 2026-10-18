import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createSoundHintsSessionV3, SoundHintsPanelV3, type SoundHintsViewV3 } from '../src/components/SoundHintsPanelV3';
import { SOUND_HINT_MODEL_V3 } from '../src/ai/modelV3';
import type { AnalysisResult, QualityCode } from '../src/types';

function result(fs = 44100, qualityCodes: QualityCode[] = []): AnalysisResult {
  return { id: 'observation-one', algorithmVersion: 'test', inputKind: 'microphone', fixtureId: null,
    analysisCreatedUtc: '2026-10-18T12:00:00Z', recordedAtUtc: '2026-10-18T12:00:00Z', sampleRateHz: fs,
    sampleCount: fs * 15, durationSeconds: 15, channelPolicy: 'mono-capture', fftSize: 8192, hopSize: 4096,
    analyzedBandHz: [20, 20000], frameCount: 160, aDigitalDb: -30, cDigitalDb: -25, cMinusADb: 5,
    lowFrequencyScreen: 'not-indicated', peakScreen: 'not-indicated', peakCandidate: null,
    qualityCodes, deviceSettings: null, spectrum: { hz: [], powerDb: [] } };
}
const input = (fs = 44100) => ({ fs, pcm: Float32Array.from({ length: fs * 15 }, (_, n) => n % 700 < 350 ? 0.0625 : -0.0625) });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(value => { resolve = value; });
  return { promise, resolve };
}

class FakeWorker {
  onmessage: Worker['onmessage'] = null;
  onerror: Worker['onerror'] = null;
  received: { type: string; requestId: string; pcm: Float32Array; sampleRateHz: number } | null = null;
  terminate = vi.fn();
  postMessage = vi.fn((value: NonNullable<FakeWorker['received']>, transfer: Transferable[]) => {
    // Exercise real transfer semantics: only the panel's separate copy detaches.
    this.received = structuredClone(value, { transfer });
  });
  emit(data: unknown) { this.onmessage?.call(this as unknown as Worker, { data } as MessageEvent); }
}

function harness(prediction = { accepted: true, label: 'traffic' }) {
  const states: SoundHintsViewV3[] = [], workers: FakeWorker[] = [], signals: AbortSignal[] = [];
  const head = { predict: vi.fn(() => ({ ...prediction, integerScores: [901, 1, 2, 3, 4, 5], guardedMargin: 456 })) };
  const loadHead = vi.fn(async (signal: AbortSignal) => { signals.push(signal); return head; });
  const createWorker = vi.fn(() => { const worker = new FakeWorker(); workers.push(worker); return worker as unknown as Worker; });
  const session = createSoundHintsSessionV3({ onChange: value => states.push(value), loadHead, createWorker });
  return { states, workers, signals, head, loadHead, createWorker, session };
}

function embedding(worker: FakeWorker, overrides: Record<string, unknown> = {}) {
  const pcm = worker.received!;
  const vector = new Float32Array(512); vector[0] = 1;
  return { type: 'embedding', requestId: pcm.requestId, embedding: vector,
    provenance: { selfTestPassed: true, dimension: 512, sampleRateHz: pcm.sampleRateHz,
      sampleCount: pcm.pcm.length, durationSeconds: 5, classifierIncluded: false, promotionAllowed: false,
      modelSha256: SOUND_HINT_MODEL_V3.modelSha256, runtimeFingerprintSha256: SOUND_HINT_MODEL_V3.runtimeFingerprintSha256,
      preprocessingContractSha256: SOUND_HINT_MODEL_V3.preprocessingContractSha256 }, ...overrides };
}

describe('inactive broad-family panel disclosure', () => {
  it('renders consent and full-window limits without creating a worker or fetching anything', () => {
    const fetch = vi.fn(); const Worker = vi.fn();
    vi.stubGlobal('fetch', fetch); vi.stubGlobal('Worker', Worker);
    try {
      const html = renderToStaticMarkup(createElement(SoundHintsPanelV3, { result: result(), input: input() }));
      expect(html).toContain('Limited / experimental');
      expect(html).toContain('About 51 MB is downloaded when you start the local model');
      expect(html).toContain('No download starts until you choose Explore');
      expect(html).not.toContain('caching across reloads');
      expect(html).toContain('first 5 seconds of this 15.00-second observation');
      expect(html).toContain('report use the full 15.00 seconds');
      expect(html).toContain('excluded from exported reports');
      expect(html).toContain('buzz family includes insect recordings');
      expect(html).not.toContain('relative score'); expect(html).not.toContain('%');
      expect(fetch).not.toHaveBeenCalled(); expect(Worker).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });

  it('blocks absent audio and non-microphone input without offering guesses', () => {
    for (const props of [{ result: result(), input: null }, { result: { ...result(), inputKind: 'synthetic' as const }, input: input() }]) {
      const html = renderToStaticMarkup(createElement(SoundHintsPanelV3, props));
      expect(html).toContain('disabled'); expect(html).not.toContain('No sound family suggested');
    }
  });
});

describe('local v3 session ownership and abstention', () => {
  it.each([44100, 48000])('sends an independently transferred native-rate first-five-second copy (%i)', async fs => {
    const h = harness(), audio = input(fs), before = audio.pcm.slice();
    expect(h.loadHead).not.toHaveBeenCalled(); expect(h.createWorker).not.toHaveBeenCalled();
    await h.session.run(result(fs), audio);
    const sent = h.workers[0].received!;
    expect(sent.requestId).toMatch(/^r\d+$/); expect(sent.type).toBe('extract');
    expect(sent.sampleRateHz).toBe(fs); expect(sent.pcm.length).toBe(fs * 5);
    expect(sent.pcm).toEqual(before.subarray(0, fs * 5));
    expect(sent.pcm.buffer).not.toBe(audio.pcm.buffer);
    expect(audio.pcm).toEqual(before); expect(audio.pcm.byteLength).toBe(fs * 15 * 4);
    expect(h.createWorker).toHaveBeenCalledOnce();
    h.session.dispose(); expect(h.workers[0].terminate).toHaveBeenCalledOnce();
  });

  it.each<QualityCode>(['near-zero', 'clipped', 'near-full-scale', 'incomplete', 'unsupported-rate', 'non-finite', 'no-band-power'])('full-observation %s flags block head and worker requests', async code => {
    const h = harness(); await h.session.run(result(44100, [code]), input());
    expect(h.loadHead).not.toHaveBeenCalled(); expect(h.createWorker).not.toHaveBeenCalled();
    expect(h.session.getState()).toMatchObject({ phase: 'error', family: null });
  });

  it('rejects invalid retained native data before any download', async () => {
    for (const audio of [{ fs: 44100, pcm: new Float32Array(44100) }, { fs: 48000, pcm: new Float32Array(240000) }]) {
      const h = harness(); await h.session.run(result(), audio);
      expect(h.loadHead).not.toHaveBeenCalled(); expect(h.createWorker).not.toHaveBeenCalled();
    }
  });

  it.each(['buzz', 'mechanical_fan', 'speech', 'traffic', 'wind'])('retains only the accepted broad family %s, never scores or vectors', async label => {
    const h = harness({ accepted: true, label }); await h.session.run(result(), input());
    const worker = h.workers[0]; worker.emit(embedding(worker));
    expect(h.session.getState()).toEqual({ phase: 'ready', family: label, error: '' });
    expect(JSON.stringify(h.states)).not.toMatch(/integerScores|guardedMargin|embedding|901|456/);
    h.session.cancel('idle'); expect(h.session.getState()).toEqual({ phase: 'idle', family: null, error: '' });
    expect(worker.terminate).toHaveBeenCalledOnce(); expect(h.signals[0].aborted).toBe(true);
  });

  it.each([{ accepted: false, label: 'buzz' }, { accepted: true, label: '__unknown__' }, { accepted: true, label: 'transformer' }, { accepted: true, label: 'toString' }])('abstains without exposing a rejected or unknown label (%j)', async prediction => {
    const h = harness(prediction); await h.session.run(result(), input());
    h.workers[0].emit(embedding(h.workers[0]));
    expect(h.session.getState()).toEqual({ phase: 'ready', family: null, error: '' });
  });

  it('ignores stale IDs and passes only bounded loading/startup status', async () => {
    const h = harness(); await h.session.run(result(), input());
    const worker = h.workers[0], requestId = worker.received!.requestId;
    worker.emit({ type: 'status', requestId, phase: 'self-test' }); expect(h.session.getState().phase).toBe('self-test');
    worker.emit({ ...embedding(worker), requestId: 'r9999' }); expect(h.head.predict).not.toHaveBeenCalled();
    worker.emit({ type: 'status', requestId, phase: 'arbitrary' }); expect(h.session.getState().phase).toBe('self-test');
    worker.emit(embedding(worker)); expect(h.head.predict).toHaveBeenCalledOnce();
  });

  it.each(['modelSha256', 'runtimeFingerprintSha256', 'preprocessingContractSha256', 'sampleRateHz', 'sampleCount', 'durationSeconds', 'selfTestPassed'])('fails closed on incompatible worker provenance: %s', async field => {
    const h = harness(); await h.session.run(result(), input());
    const worker = h.workers[0], message = embedding(worker);
    worker.emit({ ...message, provenance: { ...message.provenance, [field]: 'wrong' } });
    expect(h.session.getState()).toMatchObject({ phase: 'error', family: null });
    expect(h.head.predict).not.toHaveBeenCalled(); expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('fails closed on malformed vectors and isolates scorer failures from the standard report', async () => {
    for (const bad of [new Float32Array(1), Float64Array.from({ length: 512 }, () => 0), Float32Array.from({ length: 512 }, () => NaN)]) {
      const h = harness(); await h.session.run(result(), input());
      h.workers[0].emit(embedding(h.workers[0], { embedding: bad }));
      expect(h.head.predict).not.toHaveBeenCalled(); expect(h.session.getState().phase).toBe('error');
    }
    const h = harness(); h.head.predict.mockImplementation(() => { throw new Error('private debug value'); });
    await h.session.run(result(), input()); h.workers[0].emit(embedding(h.workers[0]));
    expect(h.session.getState().error).toContain('standard indicators and report remain available');
    expect(h.session.getState().error).not.toContain('private debug');
  });

  it('cancels a pending head load and ignores its late result without creating a worker', async () => {
    const gate = deferred<{ predict: () => { accepted: boolean; label: string } }>();
    const createWorker = vi.fn(), states: SoundHintsViewV3[] = []; let signal!: AbortSignal;
    const session = createSoundHintsSessionV3({ onChange: value => states.push(value), createWorker,
      loadHead: value => { signal = value; return gate.promise; } });
    const pending = session.run(result(), input()); session.cancel();
    gate.resolve({ predict: () => ({ accepted: true, label: 'traffic' }) }); await pending;
    expect(signal.aborted).toBe(true); expect(createWorker).not.toHaveBeenCalled();
    expect(session.getState()).toEqual({ phase: 'canceled', family: null, error: '' });
  });

  it('clear/reset/unmount disposal suppresses saved callbacks and stops ownership permanently', async () => {
    const h = harness(); await h.session.run(result(), input()); const worker = h.workers[0], callback = worker.onmessage!;
    const message = embedding(worker); h.session.dispose();
    callback.call(worker as unknown as Worker, { data: message } as MessageEvent);
    await h.session.run({ ...result(), id: 'later' }, input());
    expect(h.head.predict).not.toHaveBeenCalled(); expect(h.createWorker).toHaveBeenCalledOnce();
    expect(h.session.getState()).toEqual({ phase: 'idle', family: null, error: '' });
    expect(worker.onmessage).toBeNull(); expect(worker.onerror).toBeNull(); expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('a runtime error releases both resources and a retry cannot accept the old callback', async () => {
    const h = harness(); await h.session.run(result(), input()); const first = h.workers[0], old = first.onmessage!;
    const oldMessage = embedding(first); first.onerror?.call(first as unknown as Worker, {} as ErrorEvent);
    expect(h.session.getState().phase).toBe('error'); expect(first.terminate).toHaveBeenCalledOnce();
    await h.session.run(result(), input()); const second = h.workers[1];
    old.call(first as unknown as Worker, { data: oldMessage } as MessageEvent);
    expect(h.head.predict).not.toHaveBeenCalled(); second.emit(embedding(second));
    expect(h.head.predict).toHaveBeenCalledOnce(); expect(h.session.getState().family).toBe('traffic');
  });
});
