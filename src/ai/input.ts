import { SOUND_HINT_MODEL } from './model';

/**
 * Retain only the model's observation window, without sharing or transferring
 * the DSP buffer. A longer observation still belongs to the core analysis.
 * This does not resample, normalize, loop, or pad missing recorded samples.
 */
export function copySoundHintObservation(pcm: Float32Array, sampleRateHz: number): Float32Array {
  if (!(pcm instanceof Float32Array)) throw new Error('Sound hints require mono PCM in a Float32Array.');
  if (sampleRateHz !== 44_100 && sampleRateHz !== 48_000) {
    throw new Error('Sound hints support source audio at 44.1 or 48 kHz.');
  }
  const samples = sampleRateHz * SOUND_HINT_MODEL.observationSeconds;
  if (pcm.length < samples) throw new Error('Sound hints require at least five seconds of recorded audio; short clips are not padded.');
  if (pcm.some(sample => !Number.isFinite(sample))) throw new Error('The recording contains invalid audio samples.');
  return pcm.slice(0, samples);
}
