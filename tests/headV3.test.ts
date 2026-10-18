import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createIntegerHeadV3 } from '../ml/browser/integerHeadV3';
import { createSoundHintHeadLoaderV3 } from '../src/ai/headV3';
import { SOUND_HINT_MODEL_V3 } from '../src/ai/modelV3';

const headBytes = readFileSync(new URL('../ml/runs/2026-10-18-v3-first-fit/fit/research_head_v3.json', import.meta.url));
const scorerBytes = readFileSync(new URL('../ml/runs/2026-10-18-v3-first-fit/head-parity/javascript/compiled/integerHeadV3.js', import.meta.url));
const digest = async (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function fixture(options: { corrupt?: 'head' | 'scorer'; status?: number; importSource?: (bytes: Uint8Array) => Promise<unknown> } = {}) {
  const fetch = vi.fn(async (url: string | URL | Request) => {
    const name = String(url) === SOUND_HINT_MODEL_V3.headUrl ? 'head' : 'scorer';
    const bytes = new Uint8Array(name === 'head' ? headBytes : scorerBytes);
    if (options.corrupt === name) bytes[0] ^= 1;
    return new Response(bytes, { status: options.status ?? 200 });
  });
  const importSource = vi.fn(options.importSource ?? (async () => ({ createIntegerHeadV3 })));
  return { fetch, importSource, load: createSoundHintHeadLoaderV3({ fetch: fetch as typeof globalThis.fetch, digest, importSource }) };
}

describe('prepared v3 head loader', () => {
  it('loads the actual frozen head only after verifying both exact files', async () => {
    const { fetch, importSource, load } = fixture();
    expect(fetch).not.toHaveBeenCalled();
    const signal = new AbortController().signal;
    const head = await load(signal);
    expect(typeof head.predict).toBe('function');
    expect(fetch.mock.calls.map(call => String(call[0]))).toEqual([SOUND_HINT_MODEL_V3.headUrl, SOUND_HINT_MODEL_V3.scorerUrl]);
    expect(importSource).toHaveBeenCalledOnce();
    expect(new Uint8Array(importSource.mock.calls[0][0])).toEqual(new Uint8Array(scorerBytes));
  });

  it.each(['head', 'scorer'] as const)('rejects changed %s bytes before executing any scorer', async corrupt => {
    const { load, importSource } = fixture({ corrupt });
    await expect(load(new AbortController().signal)).rejects.toThrow('integrity');
    expect(importSource).not.toHaveBeenCalled();
  });

  it('keeps an unavailable asset from executing scorer code', async () => {
    const { load, importSource } = fixture({ status: 404 });
    await expect(load(new AbortController().signal)).rejects.toThrow('unavailable');
    expect(importSource).not.toHaveBeenCalled();
  });

  it('stops a chunked oversized response before buffering or importing it', async () => {
    const cancel = vi.fn();
    const importSource = vi.fn();
    const fetch = vi.fn(async (url: string | URL | Request) => String(url) === SOUND_HINT_MODEL_V3.headUrl
      ? new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(262_145)); }, cancel }))
      : new Response(new Uint8Array(scorerBytes)));
    const load = createSoundHintHeadLoaderV3({ fetch: fetch as typeof globalThis.fetch, digest, importSource });
    await expect(load(new AbortController().signal)).rejects.toThrow('file is invalid');
    expect(cancel).toHaveBeenCalledOnce(); expect(importSource).not.toHaveBeenCalled();
  });

  it('performs no request after prior cancellation', async () => {
    const { load, fetch, importSource } = fixture();
    const controller = new AbortController(); controller.abort();
    await expect(load(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).not.toHaveBeenCalled(); expect(importSource).not.toHaveBeenCalled();
  });

  it('does not return a stale head after cancellation during a module import', async () => {
    let finish!: (value: unknown) => void;
    const imported = new Promise(resolve => { finish = resolve; });
    const { load, importSource } = fixture({ importSource: async () => imported });
    const controller = new AbortController();
    const pending = load(controller.signal);
    await vi.waitFor(() => expect(importSource).toHaveBeenCalledOnce());
    controller.abort(); finish({ createIntegerHeadV3 });
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
