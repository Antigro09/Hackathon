import type { InputMeta } from '../types';
import { abortable, AudioInputError, cancelledError } from './errors';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export async function decodeAudioFile(file: File, signal?: AbortSignal): Promise<{ pcm: Float32Array; fs: number; meta: InputMeta }> {
  if (signal?.aborted) throw cancelledError();
  if (file.size > MAX_FILE_BYTES) throw new AudioInputError('file-too-large', 'Choose an audio file of 10 MB or less. PCM WAV is the recommended format.');
  if (file.size === 0) throw new AudioInputError('empty-file', 'This file is empty. Choose a PCM WAV recording with at least five seconds of audio.');
  if (typeof AudioContext === 'undefined') throw new AudioInputError('decode-unavailable', 'This browser cannot decode audio files. Try a current browser or use a synthetic demo.');
  let context: AudioContext | undefined;
  try {
    const encoded = await abortable(file.arrayBuffer(), signal);
    context = new AudioContext();
    const buffer = await abortable(context.decodeAudioData(encoded), signal);
    if (signal?.aborted) throw cancelledError();
    const fs = buffer.sampleRate;
    if (!Number.isFinite(fs) || fs <= 0 || buffer.numberOfChannels < 1) {
      throw new AudioInputError('invalid-file', 'The decoded file has no usable audio channel. Choose a PCM WAV recording.');
    }
    const sampleCount = Math.round(5 * fs);
    if (buffer.length < sampleCount) {
      throw new AudioInputError('file-too-short', `This file contains ${(buffer.length / fs).toFixed(2)} seconds. Choose at least five seconds; short files are never looped or padded.`);
    }
    return {
      pcm: buffer.getChannelData(0).slice(0, sampleCount), fs,
      meta: {
        inputKind: 'imported-file', fixtureId: null, recordedAtUtc: null,
        channelPolicy: 'first-channel', qualityCodes: ['imported-processing-unknown'],
        deviceSettings: {
          decodeMethod: 'local browser decodeAudioData; may resample', effectiveSampleRateHz: fs,
          decodedChannels: buffer.numberOfChannels, cropOffsetSeconds: 0,
          originalRecordingTime: 'unknown', originalProcessing: 'unknown',
        },
        inputLabel: file.name,
      },
    };
  } catch (error) {
    if (error instanceof AudioInputError || (error instanceof DOMException && error.name === 'AbortError')) throw error;
    throw new AudioInputError('decode-failed', 'This audio file could not be decoded locally. Use an uncompressed PCM WAV file with at least five seconds of audio; other formats depend on your browser.');
  } finally {
    if (context && context.state !== 'closed') { try { await context.close(); } catch { /* decoder already closed */ } }
  }
}
