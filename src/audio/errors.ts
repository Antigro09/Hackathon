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
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(cancelledError());
    promise.then(value => {
      signal.removeEventListener('abort', abort);
      resolve(value);
    }, error => {
      signal.removeEventListener('abort', abort);
      reject(error);
    });
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}
