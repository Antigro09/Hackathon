import { SOUND_HINT_MODEL } from './model';

export function soundHintResampleLength(inputLength: number, inputSampleRateHz: number): number {
  if (!Number.isSafeInteger(inputLength) || inputLength < 1 || !Number.isFinite(inputSampleRateHz) || inputSampleRateHz < 8_000 || inputSampleRateHz > 192_000) {
    throw new Error('The audio length or sample rate is invalid.');
  }
  return Math.ceil(inputLength * SOUND_HINT_MODEL.sampleRateHz / inputSampleRateHz);
}

/** Resample a COPY at its real rate; never relabel 44.1 kHz samples as 48 kHz. */
export async function resampleForSoundHints(pcm: Float32Array, inputSampleRateHz: number): Promise<Float32Array> {
  const outputLength = soundHintResampleLength(pcm.length, inputSampleRateHz);
  if (pcm.some(sample => !Number.isFinite(sample))) throw new Error('The recording contains invalid audio samples.');
  if (inputSampleRateHz === SOUND_HINT_MODEL.sampleRateHz) return pcm.slice();
  if (typeof OfflineAudioContext === 'undefined') {
    throw new Error('This browser cannot resample sound hints locally. Try a current browser. Your standard analysis is still available.');
  }
  const context = new OfflineAudioContext(1, outputLength, SOUND_HINT_MODEL.sampleRateHz);
  const buffer = context.createBuffer(1, pcm.length, inputSampleRateHz);
  buffer.copyToChannel(new Float32Array(pcm), 0);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  try {
    source.start();
    const rendered = await context.startRendering();
    return rendered.getChannelData(0).slice();
  } finally {
    source.disconnect();
  }
}
