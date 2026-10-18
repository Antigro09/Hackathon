import { SOUND_HINT_MODEL } from './model';

type DownloadEnvironment = Pick<typeof import('@huggingface/transformers').env,
  'remoteHost' | 'remotePathTemplate' | 'allowLocalModels' | 'useBrowserCache'>;

export function pinSoundHintDownloads(env: DownloadEnvironment): void {
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  env.remoteHost = 'https://huggingface.co/';
  // Transformers.js 4.3.1 pipeline discovery and progress-metadata helpers omit
  // the pipeline's revision option. Pin the URL template too, so their default
  // revision cannot fetch mutable /main files or populate a different cache key.
  // This environment lives only in the dedicated, single-model worker.
  env.remotePathTemplate = `{model}/resolve/${SOUND_HINT_MODEL.revision}/`;
}
