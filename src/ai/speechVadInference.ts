import { speechVadIntervals } from './speechVadIntervals';
import type { SpeechVadInterval } from './speechVadTypes';

export interface SpeechVadTensor { data: ArrayLike<number>; dims: readonly number[]; dispose(): void }
export interface SpeechVadSession {
  inputNames: readonly string[];
  outputNames: readonly string[];
  run(feeds: Record<string, SpeechVadTensor>): Promise<Record<string, SpeechVadTensor>>;
  release(): Promise<void>;
}
export interface SpeechVadOrt {
  Tensor: new (type: 'float32' | 'int64', data: Float32Array | BigInt64Array, dims: number[]) => SpeechVadTensor;
  InferenceSession: { create(bytes: Uint8Array, options: Record<string, unknown>): Promise<SpeechVadSession> };
  env: { versions: { web: string }; wasm: { numThreads: number; proxy: boolean; simd: string; wasmBinary?: Uint8Array; wasmPaths: { mjs: string; wasm: string } } };
}

export async function runSpeechVadFrames(ort: SpeechVadOrt, session: SpeechVadSession, pcm: Float32Array, onProgress?: (frames: number) => void): Promise<{
  probabilities: number[]; intervals: SpeechVadInterval[];
}> {
  if (!(pcm instanceof Float32Array) || !pcm.length || pcm.length > 480_000 || pcm.some(value => !Number.isFinite(value))) throw new Error('Invalid bounded16k speech input.');
  let state = new Float32Array(256), context = new Float32Array(64);
  const probabilities: number[] = [], frameCount = Math.ceil(pcm.length / 512);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const offset = frame * 512, input = new Float32Array(576);
    input.set(context); input.set(pcm.subarray(offset, Math.min(offset + 512, pcm.length)), 64);
    const feeds = {
      input: new ort.Tensor('float32', input, [1, 576]),
      state: new ort.Tensor('float32', state, [2, 1, 128]),
      sr: new ort.Tensor('int64', BigInt64Array.from([16_000n]), []),
    };
    let outputs: Record<string, SpeechVadTensor> | undefined;
    try {
      outputs = await session.run(feeds);
      const probability = outputs.output?.data[0];
      if (outputs.output?.dims.join() !== '1,1' || outputs.stateN?.dims.join() !== '2,1,128'
        || outputs.output.data.length !== 1 || outputs.stateN.data.length !== 256
        || !Number.isFinite(probability) || probability < 0 || probability > 1
        || Array.from(outputs.stateN.data).some(value => !Number.isFinite(value))) throw new Error('Unexpected speech model output.');
      probabilities.push(probability); state = Float32Array.from(outputs.stateN.data); context = input.slice(-64);
    } finally {
      for (const value of Object.values(feeds)) value.dispose();
      if (outputs) for (const value of Object.values(outputs)) value.dispose();
    }
    if ((frame + 1) % 16 === 0 || frame + 1 === frameCount) onProgress?.(frame + 1);
    if ((frame + 1) % 32 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  return { probabilities, intervals: speechVadIntervals(probabilities, pcm.length) };
}

/** Fixed32-frame zero-input reference from qualified ORT-Web. Software startup test only. */
export const SPEECH_VAD_SELF_TEST = Object.freeze([
  .001669853925704956, .006883829832077026, .008910715579986572, .007857173681259155,
  .005906611680984497, .0059607625007629395, .005853235721588135, .005640208721160889,
  .00543135404586792, .0051991939544677734, .005048274993896484, .004902750253677368,
  .004735887050628662, .004584997892379761, .004447340965270996, .004327565431594849,
  .004227310419082642, .004145532846450806, .0040753185749053955, .004013419151306152,
  .003958284854888916, .003909260034561157, .003865659236907959, .0038268566131591797,
  .0037920773029327393, .0037608742713928223, .003732621669769287, .0037068724632263184,
  .0036835670471191406, .0036623775959014893, .0036430954933166504, .0036253035068511963,
]);

export function speechVadSelfTestPassed(probabilities: readonly number[]): boolean {
  return probabilities.length === SPEECH_VAD_SELF_TEST.length && probabilities.every((value, index) => Number.isFinite(value) && Math.abs(value - SPEECH_VAD_SELF_TEST[index]) <= 1e-5);
}
