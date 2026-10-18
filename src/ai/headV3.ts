import { SOUND_HINT_MODEL_V3, type SoundFamilyV3 } from './modelV3';

export interface SoundHintPredictionV3 {
  classIndex: number;
  label: SoundFamilyV3 | '__unknown__';
  accepted: boolean;
  integerScores: readonly number[];
  guardedMargin: number;
}
export interface SoundHintHeadV3 { predict(embedding: Float32Array): SoundHintPredictionV3 }

type LoaderDependencies = {
  fetch: typeof globalThis.fetch;
  digest(bytes: Uint8Array): Promise<string>;
  importSource(bytes: Uint8Array): Promise<unknown>;
};

const sha256 = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)), n => n.toString(16).padStart(2, '0')).join('');
const throwIfAborted = (signal: AbortSignal) => { if (signal.aborted) throw new DOMException('Sound hints canceled.', 'AbortError'); };

async function importVerifiedSource(bytes: Uint8Array): Promise<unknown> {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'text/javascript' }));
  try { return await import(/* @vite-ignore */ url); }
  finally { URL.revokeObjectURL(url); }
}

/** The small exact integer scorer runs locally; the encoder stays in its worker. */
export function createSoundHintHeadLoaderV3(dependencies: LoaderDependencies) {
  return async (signal: AbortSignal): Promise<SoundHintHeadV3> => {
    const read = async (url: string, expected: string, maximum: number) => {
      throwIfAborted(signal);
      const response = await dependencies.fetch(url, { method: 'GET', credentials: 'omit', redirect: 'error', signal });
      if (!response.ok) throw new Error('The optional sound classifier is unavailable.');
      const declared = response.headers.get('content-length');
      if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximum)) throw new Error('The sound classifier file is invalid.');
      const reader = response.body?.getReader();
      if (!reader) throw new Error('The sound classifier file could not be read.');
      const chunks: Uint8Array[] = [];
      let total = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          throwIfAborted(signal);
          if (done) break;
          total += value.byteLength;
          if (total > maximum) throw new Error('The sound classifier file is invalid.');
          chunks.push(value);
        }
      } catch (cause) { await reader.cancel().catch(() => {}); throw cause; }
      finally { reader.releaseLock(); }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      throwIfAborted(signal);
      if (bytes.length > maximum || await dependencies.digest(bytes) !== expected) throw new Error('The sound classifier failed its integrity check.');
      throwIfAborted(signal);
      return bytes;
    };
    const [headBytes, scorerBytes] = await Promise.all([
      read(SOUND_HINT_MODEL_V3.headUrl, SOUND_HINT_MODEL_V3.headSha256, 262_144),
      read(SOUND_HINT_MODEL_V3.scorerUrl, SOUND_HINT_MODEL_V3.scorerSha256, 65_536),
    ]);
    const model: unknown = JSON.parse(new TextDecoder().decode(headBytes));
    if (!model || typeof model !== 'object' || !('provenance' in model)
      || !model.provenance || typeof model.provenance !== 'object'
      || !('frozenParametersAndRulesSha256' in model.provenance)
      || model.provenance.frozenParametersAndRulesSha256 !== SOUND_HINT_MODEL_V3.headParametersSha256) {
      throw new Error('The sound classifier has incompatible parameters.');
    }
    throwIfAborted(signal);
    const loaded: unknown = await dependencies.importSource(scorerBytes);
    throwIfAborted(signal);
    if (!loaded || typeof loaded !== 'object' || !('createIntegerHeadV3' in loaded) || typeof loaded.createIntegerHeadV3 !== 'function') {
      throw new Error('The exact sound classifier could not start.');
    }
    const scorer: unknown = loaded.createIntegerHeadV3(model);
    if (!scorer || typeof scorer !== 'object' || !('predict' in scorer) || typeof scorer.predict !== 'function') throw new Error('The sound classifier is invalid.');
    return scorer as SoundHintHeadV3;
  };
}

// Creating this function performs no fetch, import, model loading or inference.
export const loadSoundHintHeadV3 = createSoundHintHeadLoaderV3({
  fetch: (...args) => globalThis.fetch(...args), digest: sha256, importSource: importVerifiedSource,
});
