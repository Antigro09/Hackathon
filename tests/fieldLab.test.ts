import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

interface FieldEntry { schemaVersion: number; provenance?: string; original?: unknown; [key: string]: unknown }
interface FieldCore {
  FIELD_LAB_WORKLET_SOURCE: string;
  fieldLabDecodeLog(raw: string | null): { entries: FieldEntry[]; invalid: boolean };
  fieldLabCsv(entries: FieldEntry[]): string;
  fieldLabCsvCell(value: unknown): string;
  fieldLabSettings(settings: Record<string, unknown>): Record<string, number | boolean>;
  fieldLabCaptureRecord(result: Record<string, unknown>, context: Record<string, unknown>): FieldEntry;
  fieldLabWav(pcm: Float32Array, fs: number): ArrayBuffer;
}
const html = readFileSync(new URL('../field_lab.html', import.meta.url), 'utf8');
const coreSource = html.match(/<script\s+id=["']field-lab-core["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
if (!coreSource) throw new Error('Standalone lab must inline its field-lab-core helpers.');
const core = new Function(coreSource + '\nreturn {FIELD_LAB_WORKLET_SOURCE,fieldLabDecodeLog,fieldLabCsv,fieldLabCsvCell,fieldLabSettings,fieldLabCaptureRecord,fieldLabWav};')() as FieldCore;
const runtimeSource = html.match(/<script\s+id=["']field-lab-runtime["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
if (!runtimeSource) throw new Error('Standalone lab must inline its capture runtime.');

function record(overrides: Record<string, unknown> = {}): FieldEntry {
  return core.fieldLabCaptureRecord({
    algorithmVersion: 'tw-field-lab-v3', sampleRateHz: 48000, sampleCount: 720000,
    durationSeconds: 15, frameCount: 174, fftSize: 8192, hopSize: 4096,
    binSpacingHz: 48000 / 8192, aDigitalDb: -40, cDigitalDb: -20, cMinusADb: 20,
    lowFrequencyScreen: 'suggested', peakScreen: 'not-indicated', peakCandidate: null,
    lineFrequencyCandidates: [], qualityCodes: [], digitalRms: 0.1, digitalPeak: 0.2,
    ...overrides,
  }, {
    id: 'unit-capture', recordedAtUtc: null, analysisCreatedUtc: '2026-10-18T16:00:00Z',
    requestedDurationSeconds: 15, experiment: 'E1 duration', spot: 'Site, "quoted"',
    inOut: 'in', distance: 'unknown', heard: 'first line\nsecond line, "quoted"',
    deviceNote: 'Manual device A', deviceSettings: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, deviceId: 'fake-private-id' },
  });
}

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (quoted) {
      if (char === '"' && csv[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\r' && csv[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
    else cell += char;
  }
  if (quoted) throw new Error('CSV has unclosed quotes');
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

interface Collector {
  port: { onmessage: ((event: { data: { type: string } }) => void) | null };
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
}
function collectorFixture(fs: number, target: number, warmup: number) {
  const messages: Record<string, unknown>[] = [];
  let Constructor: (new (options: { processorOptions: { targetFrames: number; warmupFrames: number } }) => Collector) | undefined;
  class Processor {
    port = { onmessage: null, postMessage(message: Record<string, unknown>) { messages.push(message); } };
  }
  const context = createContext({
    AudioWorkletProcessor: Processor, Float32Array, sampleRate: fs, currentFrame: 0,
    registerProcessor(_name: string, value: typeof Constructor) { Constructor = value; },
  });
  runInContext(core.FIELD_LAB_WORKLET_SOURCE, context);
  if (!Constructor) throw new Error('Collector processor was not registered');
  const processor = new Constructor({ processorOptions: { targetFrames: target, warmupFrames: warmup } });
  return { processor, messages, context };
}
const pcmHash = (pcm: Float32Array) => createHash('sha256').update(Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)).digest('hex');

describe('standalone sample-counted microphone collector', () => {
  it.each([5, 15, 30])('collects exactly %s seconds after a separate0.5-second warm-up and emits silent output', seconds => {
    const fs = 48000, warmup = fs / 2, target = fs * seconds;
    const { processor, messages, context } = collectorFixture(fs, target, warmup);
    const source = Float32Array.from({ length: warmup + target + 128 }, (_, n) => 0.1 * Math.sin(2 * Math.PI * 63 * n / fs));
    let running = true, offset = 0;
    while (running) {
      const input = source.subarray(offset, offset + 128);
      const output = new Float32Array(input.length).fill(1);
      running = processor.process([[input]], [[output]]);
      expect(output.some(sample => sample !== 0)).toBe(false);
      context.currentFrame += input.length;
      offset += input.length;
      if (offset > source.length) throw new Error('Collector did not finish its bounded recording');
    }
    const complete = messages.filter(message => message.type === 'complete');
    expect(complete).toHaveLength(1);
    expect(complete[0].sampleCount).toBe(target);
    const captured = complete[0].pcm as Float32Array;
    expect(captured.length).toBe(target);
    expect(pcmHash(captured)).toBe(pcmHash(source.subarray(warmup, warmup + target)));
    expect(messages.filter(message => message.type === 'started')).toHaveLength(1);
  });

  it('uses first-channel PCM and clips only the collection length, not sample amplitudes', () => {
    const { processor, messages } = collectorFixture(48000, 3, 1);
    expect(processor.process([[Float32Array.of(0.4, 0.5, 1.2, -1.3, 0.6), Float32Array.of(-0.4, -0.5, -1.2, 1.3, -0.6)]], [[new Float32Array(5)]])).toBe(false);
    expect(Array.from(messages.find(message => message.type === 'complete')!.pcm as Float32Array)).toEqual(Array.from(Float32Array.of(0.5, 1.2, -1.3)));
  });

  it('fails missing/gapped render quanta rather than manufacturing silence or a complete recording', () => {
    const { processor, messages, context } = collectorFixture(48000, 1000, 0);
    expect(processor.process([[new Float32Array(128)]], [[new Float32Array(128)]])).toBe(true);
    context.currentFrame = 256;
    expect(processor.process([[new Float32Array(128)]], [[new Float32Array(128)]])).toBe(false);
    expect(messages.some(message => message.type === 'error')).toBe(true);
    expect(messages.some(message => message.type === 'complete')).toBe(false);
    const missing = collectorFixture(48000, 1000, 0);
    expect(missing.processor.process([[]], [[new Float32Array(128)]])).toBe(false);
    expect(missing.messages.some(message => message.type === 'error')).toBe(true);
  });

  it('stops an active collector without labeling partial samples complete', () => {
    const { processor, messages } = collectorFixture(48000, 1000, 0);
    processor.port.onmessage!({ data: { type: 'stop' } });
    expect(processor.process([[new Float32Array(128)]], [[new Float32Array(128)]])).toBe(false);
    expect(messages.some(message => message.type === 'complete')).toBe(false);
  });
});

describe('persistent campaign provenance and CSV', () => {
  it('retains structured v2 and v3 records with their original method, values and observer metadata', () => {
    const old = record({ algorithmVersion: 'tw-field-lab-v2',
      peakCandidate: { centerHz: 1954.1, prominenceDb: 22, persistentFrameFraction: 1 }, peakScreen: 'suggested' });
    const current = record();
    const original = JSON.stringify([old, current]);
    const decoded = core.fieldLabDecodeLog(original);
    expect(decoded.invalid).toBe(false);
    expect(JSON.stringify(decoded.entries)).toBe(original);
    expect(core.fieldLabDecodeLog(JSON.stringify(decoded.entries))).toEqual(decoded);
    expect(decoded.entries.map(entry => entry.algorithmVersion)).toEqual(['tw-field-lab-v2', 'tw-field-lab-v3']);
    expect(decoded.entries.every(entry => entry.schemaVersion === 2 && !Object.hasOwn(entry, 'original'))).toBe(true);
    const rows = parseCsv(core.fieldLabCsv(decoded.entries));
    expect(rows.slice(1).map(row => row[rows[0].indexOf('algorithm_version')])).toEqual(['tw-field-lab-v2', 'tw-field-lab-v3']);
    expect(rows[1][rows[0].indexOf('peak_frequency_hz')]).toBe('1954.1');
    expect(rows[1][rows[0].indexOf('heard_user_note')]).toBe('first line\nsecond line, "quoted"');
  });

  it('keeps unknown-version structured records as unverified originals instead of silently relabeling their method', () => {
    const future = record({ algorithmVersion: 'tw-field-lab-v99' });
    const decoded = core.fieldLabDecodeLog(JSON.stringify([future]));
    expect(decoded.entries[0]).toMatchObject({ schemaVersion: 1, provenance: 'legacy-unverified', original: future });
    expect((decoded.entries[0].original as FieldEntry).algorithmVersion).toBe('tw-field-lab-v99');
  });

  it('preserves legacy originals idempotently and labels their method unverified', () => {
    const original = { t: '12:00', s: 'raw, "quoted"\nsite', dur: '15 s', g: '20', v: 'SIGNATURE' };
    const first = core.fieldLabDecodeLog(JSON.stringify([original]));
    expect(first.invalid).toBe(false);
    expect(first.entries[0]).toMatchObject({ schemaVersion: 1, provenance: 'legacy-unverified', original });
    expect(core.fieldLabDecodeLog(JSON.stringify(first.entries)).entries).toEqual(first.entries);
    const rows = parseCsv(core.fieldLabCsv(first.entries));
    expect(rows[1][rows[0].indexOf('actual_duration_s')]).toBe('');
    expect(JSON.parse(rows[1][rows[0].indexOf('legacy_original_json')])).toEqual(original);
  });

  it('reports malformed storage without treating it as a new writable empty campaign', () => {
    expect(core.fieldLabDecodeLog('{invalid')).toEqual({ entries: [], invalid: true });
    expect(core.fieldLabDecodeLog('{}')).toEqual({ entries: [], invalid: true });
    expect(core.fieldLabDecodeLog(null)).toEqual({ entries: [], invalid: false });
    expect(core.fieldLabDecodeLog(JSON.stringify([{ schemaVersion: 2, algorithmVersion: 'tw-field-lab-v2' }])).entries[0].provenance).toBe('legacy-unverified');
    expect(core.fieldLabDecodeLog(JSON.stringify([record({ lineFrequencyCandidates: [null] })])).entries[0].provenance).toBe('legacy-unverified');
  });

  it('round-trips commas, quotes, multiline notes and legacy JSON without corrupting CSV columns', () => {
    const entry = record();
    const rows = parseCsv(core.fieldLabCsv([entry]));
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveLength(rows[0].length);
    expect(rows[1][rows[0].indexOf('spot_user_note')]).toBe('Site, "quoted"');
    expect(rows[1][rows[0].indexOf('heard_user_note')]).toBe('first line\nsecond line, "quoted"');
    expect(rows[1][rows[0].indexOf('actual_duration_s')]).toBe('15');
    expect(rows[1][rows[0].indexOf('sample_count')]).toBe('720000');
    expect(rows[1][rows[0].indexOf('provenance')]).toBe('microphone-uncalibrated');
    expect(rows[1][rows[0].indexOf('recording_start_receipt_utc')]).toBe('');
    expect(core.fieldLabDecodeLog(JSON.stringify([entry])).entries[0].schemaVersion).toBe(2);
  });

  it('retains unavailable results as blank CSV fields, never numeric zero', () => {
    const rows = parseCsv(core.fieldLabCsv([record({ aDigitalDb: null, cDigitalDb: null, cMinusADb: null, lowFrequencyScreen: 'inconclusive', peakScreen: 'inconclusive', qualityCodes: ['clipped'] })]));
    for (const column of ['a_digital_db_re_rms1', 'c_digital_db_re_rms1', 'c_minus_a_db']) expect(rows[1][rows[0].indexOf(column)]).toBe('');
    expect(rows[1][rows[0].indexOf('quality_codes')]).toBe('clipped');
  });

  it('keeps numeric negatives numeric while escaping formula-like text and filtering identifiers', () => {
    expect(core.fieldLabCsvCell(-40)).toBe('"-40"');
    expect(core.fieldLabCsvCell('=1+1')).toBe('"\'=1+1"');
    expect(core.fieldLabSettings({ sampleRate: 48000, autoGainControl: false, deviceId: 'fake-private-id', groupId: 'fake-group', sampleSize: 'wrong-type' })).toEqual({ sampleRate: 48000, autoGainControl: false });
    expect(record().deviceSettings).not.toHaveProperty('deviceId');
  });
});

describe('standalone raw PCM evidence and packaging', () => {
  it('writes an exact unnormalized mono IEEE-float WAV with actual sample rate/count', () => {
    const pcm = Float32Array.of(0, 0.125, -0.25, 1.2);
    const wav = core.fieldLabWav(pcm, 44100), view = new DataView(wav);
    expect(Buffer.from(wav, 0, 4).toString()).toBe('RIFF');
    expect(view.getUint16(20, true)).toBe(3);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint32(44, true)).toBe(pcm.length);
    expect(view.getUint32(52, true)).toBe(pcm.byteLength);
    expect(Array.from(new Float32Array(wav, 56))).toEqual(Array.from(pcm));
  });

  it('remains a functional single HTML instrument without imports or external library scripts', () => {
    expect(html).toContain('id="start"');
    expect(html).toContain('id="stop"');
    expect(html).toContain('id="csv"');
    expect(html).toContain('id="log-body"');
    expect(html).toContain('E1 duration comparison');
    expect(html).toContain('E5 recurring hum / spectrum');
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toContain('getFloatFrequencyData');
    expect(html).not.toContain('requestAnimationFrame');
    expect(html).not.toContain('TONAL SIGNATURE');
    expect(html).toContain('not a calibration offset');
  });
});

describe('standalone interruption and inconclusive runtime behavior', () => {
  it('does not analyze or log when cancellation arrives during the post-cleanup yield', async () => {
    const source = runtimeSource.slice(runtimeSource.indexOf('async function finishCapture('), runtimeSource.indexOf('async function startCapture('));
    const session = { cancelled: false };
    const elements = new Map<string, Record<string, unknown>>();
    const context = createContext({
      activeCapture: session, session, message: {}, LOG: [],
      $: (id: string) => { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); },
      releaseCapture: async () => {},
      setTimeout: (callback: () => void) => { session.cancelled = true; callback(); },
      analyzeStandalonePcm: () => { throw new Error('Cancelled PCM must not be analyzed'); },
    });
    await runInContext(source + '\nfinishCapture(session,message)', context);
    expect(context.LOG).toEqual([]);
    expect(session.cancelled).toBe(true);
  });

  it('removes each registered ended/mute listener before releasing microphone resources', async () => {
    const source = runtimeSource.slice(runtimeSource.indexOf('async function releaseCapture('), runtimeSource.indexOf('function stopCapture('));
    const removed: string[] = [], stopped: boolean[] = [];
    const handler = () => {};
    const track = { removeEventListener: (event: string, callback: unknown) => { expect(callback).toBe(handler); removed.push(event); }, stop: () => stopped.push(true) };
    const session = { trackHandlers: [[track, 'ended', handler], [track, 'mute', handler]], stream: { getTracks: () => [track] } };
    const context = createContext({ session, clearTimeout: () => {} });
    await runInContext(source + '\nreleaseCapture(session)', context);
    expect(removed).toEqual(['ended', 'mute']);
    expect(stopped).toEqual([true]);
  });

  it('distinguishes unavailable line detection from an analyzed recording without qualifying candidates', () => {
    const source = runtimeSource.slice(runtimeSource.indexOf('function lineCandidateText('), runtimeSource.indexOf('function rebuildTable('));
    const text = new Function(source + '\nreturn lineCandidateText;')() as (entry: FieldEntry) => string;
    expect(text(record({ cMinusADb: null, qualityCodes: ['near-zero'] }))).toContain('unavailable');
    expect(text(record())).toContain('No qualifying sustained local peak');
  });
});
