import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createSoundHintsSessionV3, SoundHintsPanelV3, type SoundHintsViewV3 } from '../src/components/SoundHintsPanelV3';
import { SOUND_HINT_MODEL_V3 } from '../src/ai/modelV3';
import type { AnalysisResult, QualityCode } from '../src/types';

function result(fs = 44100, qualityCodes: QualityCode[] = [], duration = 5): AnalysisResult {
  return { id: 'observation-one', algorithmVersion: 'test', inputKind: 'microphone', fixtureId: null,
    analysisCreatedUtc: '2026-10-18T12:00:00Z', recordedAtUtc: '2026-10-18T12:00:00Z', sampleRateHz: fs,
    sampleCount: fs * duration, durationSeconds: duration, channelPolicy: 'mono-capture', fftSize: 8192, hopSize: 4096,
    analyzedBandHz: [20, 20000], frameCount: 1 + Math.floor((fs * duration - 8192) / 4096), aDigitalDb: -30, cDigitalDb: -25, cMinusADb: 5,
    lowFrequencyScreen: 'not-indicated', peakScreen: 'not-indicated', peakCandidate: null,
    qualityCodes, deviceSettings: null, spectrum: { hz: [], powerDb: [] } };
}
const input = (fs = 44100, duration = 5) => ({ fs, pcm: Float32Array.from({ length: fs * duration }, (_, n) =>
  (1 + Math.floor(n / (fs * 5))) * (n % 700 < 350 ? 0.03125 : -0.03125)) });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(value => { resolve = value; });
  return { promise, resolve };
}

class FakeWorker {
  onmessage: Worker['onmessage'] = null;
  onerror: Worker['onerror'] = null;
  received: { type: string; requestId: string; pcm: Float32Array; sampleRateHz: number } | null = null;
  requests: NonNullable<FakeWorker['received']>[] = [];
  terminate = vi.fn();
  postMessage = vi.fn((value: NonNullable<FakeWorker['received']>, transfer: Transferable[]) => {
    // Exercise real transfer semantics: only the panel's separate copy detaches.
    this.received = structuredClone(value, { transfer });
    this.requests.push(this.received);
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
      const html = renderToStaticMarkup(createElement(SoundHintsPanelV3, { result: result(44100, [], 15), input: input(44100, 15) }));
      expect(html).toContain('Limited / experimental');
      expect(html).toContain('Data-center sound comparison: not validated.');
      expect(html).toContain('Use the separate Recording check');
      expect(html).toContain('Recording usability');
      expect(html).toContain('Use with limitations');
      expect(html).toContain('The browser did not fully report its audio processing');
      expect(html).toContain('aria-controls="recording-check"');
      expect(html).toContain('Review recording check');
      expect(html).toContain('Digital capture checks, separate from AI sound hints');
      expect(html).toContain('About 51 MB is downloaded when you start the local model');
      expect(html).toContain('No download starts until you choose Explore');
      expect(html).not.toContain('caching across reloads');
      expect(html).toContain('AI scan: the full 15.00-second capture');
      expect(html).toContain('non-overlapping five-second windows');
      expect(html).toContain('Short sounds, overlapping voices and events spanning window boundaries can be missed');
      expect(html).toContain('equipment-noise target check');
      expect(html).toContain('report use the full 15.00 seconds');
      expect(html).toContain('excluded from exported reports');
      expect(html).toContain('buzz family includes insect recordings');
      expect(html).not.toContain('relative score'); expect(html).not.toContain('%');
      expect(fetch).not.toHaveBeenCalled(); expect(Worker).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });

  it('shows the actual capture status beside Explore without presenting a source-accuracy score', () => {
    const off = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
    const ready = renderToStaticMarkup(createElement(SoundHintsPanelV3, {
      result: { ...result(), deviceSettings: off }, input: input(),
    }));
    expect(ready).toContain('No obvious digital capture problem');
    expect(ready).toContain('They do not validate faithful acoustic capture');
    expect(ready).toContain('Microphone fidelity and a data-center source remain unverified');
    const clipped = renderToStaticMarkup(createElement(SoundHintsPanelV3, {
      result: { ...result(48000, ['processing-active', 'clipped']), deviceSettings: off }, input: input(48000),
    }));
    expect(clipped).toContain('Retake this recording');
    expect(clipped).toContain('Clipping distorted this recording');
    expect(clipped).not.toContain('Where available, turn off voice enhancements');
    expect(clipped).toContain('Review recording check');
    expect(clipped).not.toContain('No obvious digital capture problem');
    expect(clipped).not.toContain('%');
  });

  it('blocks absent audio and non-microphone input without offering guesses', () => {
    for (const props of [{ result: result(), input: null }, { result: { ...result(), inputKind: 'synthetic' as const }, input: input() }]) {
      const html = renderToStaticMarkup(createElement(SoundHintsPanelV3, props));
      expect(html).toContain('disabled'); expect(html).not.toContain('No sound family suggested');
    }
  });
});

describe('local v3 session ownership and abstention', () => {
  it.each([44100, 48000].flatMap(fs => [5, 15, 30].map(duration => [fs, duration])))('scans every native-rate window with one worker/head (%i Hz, %i seconds)', async (fs, duration) => {
    const h = harness(), audio = input(fs, duration), before = audio.pcm.slice();
    expect(h.loadHead).not.toHaveBeenCalled(); expect(h.createWorker).not.toHaveBeenCalled();
    await h.session.run(result(fs, [], duration), audio);
    const worker = h.workers[0];
    for (let index = 0; index < duration / 5; index++) {
      const sent = worker.received!;
      expect(sent.requestId).toMatch(new RegExp(`^r\\d+w${index + 1}$`)); expect(sent.type).toBe('extract');
      expect(sent.sampleRateHz).toBe(fs); expect(sent.pcm.length).toBe(fs * 5);
      expect(Buffer.from(sent.pcm.buffer).equals(Buffer.from(before.buffer, index * fs * 5 * 4, fs * 5 * 4))).toBe(true);
      expect(sent.pcm.buffer).not.toBe(audio.pcm.buffer);
      expect(h.session.getState().target).toBeNull();
      expect(h.session.getState().windows).toEqual([]);
      worker.emit(embedding(worker));
    }
    expect(worker.requests).toHaveLength(duration / 5);
    expect(new Set(worker.requests.map(value => value.requestId)).size).toBe(duration / 5);
    expect(h.session.getState()).toMatchObject({ phase: 'ready', windowCount: duration / 5, windowIndex: duration / 5 });
    expect(h.session.getState().windows).toHaveLength(duration / 5);
    expect(h.head.predict).toHaveBeenCalledTimes(duration / 5);
    expect(h.loadHead).toHaveBeenCalledOnce();
    expect(Buffer.from(audio.pcm.buffer).equals(Buffer.from(before.buffer))).toBe(true);
    expect(audio.pcm.byteLength).toBe(fs * duration * 4);
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

  it('validates the entire retained duration, rate, count and finite samples before downloading', async () => {
    const badTail = input(44100, 15); badTail.pcm[badTail.pcm.length - 1] = Number.NaN;
    for (const [observation, audio] of [
      [result(44100, [], 15), input(44100, 5)],
      [result(44100, [], 5), input(44100, 15)],
      [{ ...result(), sampleCount: 220499 }, input()],
      [result(44100, [], 10), input(44100, 10)],
      [result(44100, [], 15), badTail],
    ] as const) {
      const h = harness(); await h.session.run(observation, audio);
      expect(h.loadHead).not.toHaveBeenCalled(); expect(h.createWorker).not.toHaveBeenCalled();
      expect(h.session.getState()).toMatchObject({ phase: 'error', target: null, windows: [] });
    }
  });

  it('recognizes a later speech-like family only after every window finishes', async () => {
    const h = harness({ accepted: true, label: 'mechanical_fan' });
    h.head.predict.mockReturnValueOnce({ accepted: true, label: 'mechanical_fan', integerScores: [], guardedMargin: 1 })
      .mockReturnValueOnce({ accepted: false, label: 'speech', integerScores: [], guardedMargin: 1 })
      .mockReturnValueOnce({ accepted: true, label: 'speech', integerScores: [], guardedMargin: 1 });
    await h.session.run(result(44100, [], 15), input(44100, 15));
    const worker = h.workers[0];
    worker.emit(embedding(worker));
    expect(h.session.getState()).toMatchObject({ phase: 'analyzing', windowIndex: 2, windowCount: 3, family: null, windows: [], target: null });
    worker.emit(embedding(worker));
    expect(h.session.getState()).toMatchObject({ phase: 'analyzing', windowIndex: 3, target: null, windows: [] });
    worker.emit(embedding(worker));
    expect(h.session.getState()).toMatchObject({ phase: 'ready', family: null,
      target: { status: 'retake', unclearWindows: 1, mixedFamilies: true },
      windows: [{ startSeconds: 0, endSeconds: 5, family: 'mechanical_fan' },
        { startSeconds: 5, endSeconds: 10, family: null }, { startSeconds: 10, endSeconds: 15, family: 'speech' }] });
    expect(h.session.getState().target?.label).toContain('Possible talking');
  });

  it('ignores duplicate, completed and future request IDs during a changing-family scan', async () => {
    const h = harness();
    h.head.predict.mockReturnValueOnce({ accepted: true, label: 'mechanical_fan', integerScores: [], guardedMargin: 1 })
      .mockReturnValueOnce({ accepted: true, label: 'traffic', integerScores: [], guardedMargin: 1 })
      .mockReturnValueOnce({ accepted: true, label: 'wind', integerScores: [], guardedMargin: 1 });
    await h.session.run(result(48000, [], 15), input(48000, 15));
    const worker = h.workers[0], first = embedding(worker);
    worker.emit({ ...first, requestId: first.requestId.replace(/w1$/, 'w3') });
    expect(h.head.predict).not.toHaveBeenCalled();
    worker.emit(first);
    worker.emit(first);
    worker.emit({ type: 'error', requestId: first.requestId });
    expect(h.head.predict).toHaveBeenCalledTimes(1);
    expect(worker.requests).toHaveLength(2);
    worker.emit(embedding(worker)); worker.emit(embedding(worker));
    const completed = h.session.getState();
    worker.emit(first); worker.emit(embedding(worker));
    expect(h.head.predict).toHaveBeenCalledTimes(3);
    expect(worker.requests).toHaveLength(3);
    expect(h.session.getState()).toEqual(completed);
    expect(completed.target).toMatchObject({ status: 'interference', mixedFamilies: true });
  });

  it.each(['cancel', 'dispose'] as const)('%s mid-scan releases the single worker and discards completed/late partial evidence', async action => {
    const h = harness({ accepted: true, label: 'speech' });
    await h.session.run(result(48000, [], 30), input(48000, 30));
    const worker = h.workers[0], callback = worker.onmessage!;
    worker.emit(embedding(worker));
    const late = embedding(worker);
    h.session[action]();
    callback.call(worker as unknown as Worker, { data: late } as MessageEvent);
    expect(h.session.getState()).toMatchObject({ phase: action === 'cancel' ? 'canceled' : 'idle', family: null, windows: [], target: null, windowIndex: 0 });
    expect(h.head.predict).toHaveBeenCalledTimes(1);
    expect(worker.requests).toHaveLength(2);
    expect(worker.terminate).toHaveBeenCalledOnce(); expect(h.signals[0].aborted).toBe(true);
  });

  it.each(['bad-provenance', 'worker-error', 'scorer-error'])('discards the whole verdict after partial scan failure: %s', async failure => {
    const h = harness({ accepted: true, label: 'speech' });
    await h.session.run(result(44100, [], 15), input(44100, 15));
    const worker = h.workers[0]; worker.emit(embedding(worker));
    if (failure === 'bad-provenance') {
      const next = embedding(worker);
      worker.emit({ ...next, provenance: { ...next.provenance, sampleCount: 1 } });
    } else if (failure === 'worker-error') worker.emit({ type: 'error', requestId: worker.received!.requestId });
    else { h.head.predict.mockImplementation(() => { throw new Error('private failure'); }); worker.emit(embedding(worker)); }
    expect(h.session.getState()).toMatchObject({ phase: 'error', family: null, windows: [], target: null });
    expect(h.session.getState().error).not.toContain('private failure');
    expect(worker.requests).toHaveLength(2); expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it.each(['buzz', 'mechanical_fan', 'speech', 'traffic', 'wind'])('retains only the accepted broad family %s, never scores or vectors', async label => {
    const h = harness({ accepted: true, label }); await h.session.run(result(), input());
    const worker = h.workers[0]; worker.emit(embedding(worker));
    expect(h.session.getState()).toMatchObject({ phase: 'ready', family: label, error: '', windowIndex: 1, windowCount: 1 });
    expect(JSON.stringify(h.states)).not.toMatch(/integerScores|guardedMargin|embedding|901|456/);
    h.session.cancel('idle'); expect(h.session.getState()).toMatchObject({ phase: 'idle', family: null, error: '', windows: [], target: null });
    expect(worker.terminate).toHaveBeenCalledOnce(); expect(h.signals[0].aborted).toBe(true);
  });

  it.each([{ accepted: false, label: 'buzz' }, { accepted: true, label: '__unknown__' }, { accepted: true, label: 'transformer' }, { accepted: true, label: 'toString' }])('abstains without exposing a rejected or unknown label (%j)', async prediction => {
    const h = harness(prediction); await h.session.run(result(), input());
    h.workers[0].emit(embedding(h.workers[0]));
    expect(h.session.getState()).toMatchObject({ phase: 'ready', family: null, error: '', target: { status: 'unclear', unclearWindows: 1 } });
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
    expect(session.getState()).toMatchObject({ phase: 'canceled', family: null, error: '', windows: [], target: null });
  });

  it('clear/reset/unmount disposal suppresses saved callbacks and stops ownership permanently', async () => {
    const h = harness(); await h.session.run(result(), input()); const worker = h.workers[0], callback = worker.onmessage!;
    const message = embedding(worker); h.session.dispose();
    callback.call(worker as unknown as Worker, { data: message } as MessageEvent);
    await h.session.run({ ...result(), id: 'later' }, input());
    expect(h.head.predict).not.toHaveBeenCalled(); expect(h.createWorker).toHaveBeenCalledOnce();
    expect(h.session.getState()).toMatchObject({ phase: 'idle', family: null, error: '', windows: [], target: null });
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
