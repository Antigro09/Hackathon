export class AudioInputError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'AudioInputError';
  }
}

export function cancelledError(): DOMException {
  return new DOMException('Audio input was cancelled.', 'AbortError');
}

/** Permission and decoding promises cannot themselves be cancelled. */
export function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(cancelledError());
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(cancelledError());
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
