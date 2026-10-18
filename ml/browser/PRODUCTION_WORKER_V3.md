# Verified-module worker qualification — research only

`productionWorkerV3.mjs` is an import-free diagnostic bootstrap served as a raw module worker. It has no fitted head, probabilities or source labels and performs no app activation. `productionHarnessServerV3.mjs` and `productionHarnessV3.mjs` are a loopback research harness, not product routes. App, package, Vercel configuration and frozen numerical modules are unchanged.

## Loading and numerical contract

The worker makes no network request before an explicit `initialize` or valid `extract` message. It uses fixed same-origin relative resource names, never caller-supplied URLs. Explicit fetches use GET, omitted credentials, no referrer, redirect rejection and bounded responses. Independently fixed SHA256/size pins cover the packaged modules, configs, runtime, synthetic reference and 34,301,667-byte audio-only graph. The served asset manifest cannot choose new pins. The graph is a research harness input; it is not added to the packager or repository.

Every dependency is fetched and verified **before** any dependency module executes. The trusted bootstrap then creates Blob module URLs from those verified bytes:

- ORT bundle, encoder, self-test generator and compiled model config execute with their original source text.
- The already packaged Transformers source changes only its two relative ORT import specifiers to the **same verified ORT Blob URL**.
- The compiled resampler changes only its one `./model` import specifier to the verified model-config Blob URL.
- The verified ORT loader executes from a Blob URL; the verified standard WASM bytes are supplied through `wasmBinary`. There is no backend or graph fallback.

The upstream/compiled **source hashes** continue to identify the unchanged packaged files. `moduleBindings` separately records hashes of the executed import-specifier adapters, which vary with generated Blob URLs. It does not relabel adapted text as byte-identical source. The bootstrap itself remains a trusted delivery input; hashing dependencies is not protection against an attacker replacing the bootstrap. The harness snapshots allowed files into immutable memory before serving, so later file changes cannot alter a response mid-run.

The same one-thread, fixed-SIMD, sequential canonical encoder and deterministic resampler operate on exactly five seconds of mono Float32 PCM at the actual 44.1/48 kHz rate. A verified `ClapFeatureExtractor` is constructed directly from the verified preprocessor JSON, matching canonical Node preprocessing and avoiding hidden model downloads. All four full stage hashes of both frozen synthetic inputs must match before a diagnostic input can run. A mismatch reports unavailable; there is no tolerance or alternative runtime.

## Diagnostic protocol and lifecycle

Messages require a 1–64-character alphanumeric/underscore/hyphen `requestId`, exactly the fields below, and no URLs, filenames or device metadata:

| Type | Additional fields | Result |
| --- | --- | --- |
| `initialize` | none | `ready` only after both startup cases pass |
| `extract` | `pcm: Float32Array`, `sampleRateHz: 44100 or 48000` | normalized 512D embedding and diagnostic provenance; initializes first if needed |
| `cancel` | `targetRequestId` | cancellation acknowledgement; suppresses late results |
| `dispose` | none | waits for active work, releases the session and revokes module URLs; terminal |

The worker rejects short/unsupported/non-finite/near-zero/clipped or shared mutable PCM. It copies input before encoder use and checks that the copy was not mutated. Only one initialization/extraction runs at once. Cancellation aborts fetches and is checked after asynchronous hashing/imports and before inference. It cannot preempt a synchronous WASM computation; callers must also discard stale request IDs and may terminate the worker for immediate stop. A session created after cancellation is still released. Cleanup revokes URLs and clears retained WASM input bytes even if release rejects; the harness terminates the worker in a `finally` block. Session release does not unload the browser realm's entire WASM/module cache; termination completes that lifecycle.

Outputs are local messages, not uploads. They contain vectors and hashes for diagnosis, never a classifier verdict or raw PCM echo. A future product integration must additionally enforce the observation's existing DSP quality flags; this PCM-only research protocol does not establish that an acquisition was uninterrupted. Fetches deliberately use `cache:no-store`, so this implementation makes no across-reload model-cache promise. Generated Blob modules require CSP permission for `blob:` scripts and `wasm-unsafe-eval`; do not silently bypass a stricter policy.

## Reproduce

First create a self-test-enabled package with `prepareProductionV3.mjs`. Then, from the repository:

```sh
node --experimental-vm-modules --test ml/browser/productionWorkerV3.test.mjs
node ml/browser/productionHarnessServerV3.mjs --assets output/production-v3-assets-selftest --port 4192 --log output/production-worker-v3-qa/requests.json
```

Open `http://127.0.0.1:4192` in an isolated browser, explicitly initialize, run the two synthetic checks and dispose. The protocol tests inject mock modules/encoder responses and use no model inference; real browser qualification is separate. The server serves only a fixed GET whitelist, includes JavaScript MIME for extensionless `app/model`, accepts no upload endpoint, and records method/path/status without request bodies.

Optional original-26 software qualification requires **both** pinned inputs:

```sh
node ml/browser/productionHarnessServerV3.mjs --assets output/production-v3-assets-selftest --port 4192 --log output/production-worker-v3-qa/requests-qualified.json --qualification-manifest output/canonical-wasm-study/staged/manifest.json --qualification-reference output/canonical-wasm-study/chrome-golden/embeddings.json
```

Only staged manifest SHA `25448ca576662cf21511b2f691100e6e8d93d4f76c985bc35e6da55430f63e68` and Chrome reference SHA `f713e30fb35ed458a3ec80337476bf2e0feccf627e8a2e5d27248563610404f4` are accepted. Every prepared PCM is rehashed and held in the immutable route map; the browser sends only its PCM and actual rate to the worker. The comparison checks complete input/resampled-PCM/features/embedding hashes, all 512 coordinates and input preservation. These are the old 20 validation/ood-validation clips and six generated inputs, not fresh final-test data or class predictions. MIMII-containing fixtures remain noncommercial software-parity research only, never production training data; do not copy this qualification set into a product bundle.

On Windows Chrome 155, the verified Blob loader passed both startup cases and all 26 original qualification cases exactly; every 512D vector had maximum absolute difference zero. This verifies those numerical paths on that environment. It does not establish field accuracy, useful acceptance coverage, microphone/browser/device equivalence generally, or candidate promotion. Raw diagnostic evidence and GET logs remain under ignored `output/production-worker-v3-qa/`.
