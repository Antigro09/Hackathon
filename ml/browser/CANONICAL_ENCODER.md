# Canonical WASM encoder experiment

This research runner extracts embeddings only. It does not activate a classifier or establish field accuracy. Native ONNX CPU embeddings are not substituted for these embeddings. The app is unchanged by these files.

The encoder is `Xenova/clap-htsat-unfused` at `c28f2883575e590e04d3146ff0713c2448d691ba`, audio-only q8 file SHA256 `3fcff2c8824e7bcb83a983f2a49edab3b60cbcf4872ac70efee517355173bd1f` (34,301,667 bytes). Transformers.js 4.3.1 preprocessing appends five seconds of zeros to the five-second input. The actual app resampler is compiled unchanged with TypeScript 7.0.2. One standard ONNX Runtime Web WASM session runs sequentially, with one thread, fixed-width SIMD feature detection, and graph optimization `all`. The actual WASM and loader bytes are pinned in `canonicalEncoder.mjs`; the SIMD flag alone does not select a different binary.

The standard WASM binary is 14,264,838 bytes, plus its 24,381-byte loader and 73,123-byte JS bundle. This avoids the larger asyncify/WebGPU runtime. The pinned repository also supplies an fp32 audio graph of 117,528,416 bytes (HF LFS SHA256 `a1c2b43c44f71e0fa841a4b86700886c199bf87699ea45632c4d831bc6c88957`). It was not downloaded or benchmarked here: measured same-WASM agreement makes a larger model unnecessary for this particular parity fix. This does not compare their classification accuracy.

## Prepare and extract

Install the exact versions already in the app's lockfile. A separate Colab dependency directory may be used; `--dependencies` names the directory containing `node_modules`. `--ignore-scripts` avoids running dependency installation hooks; the runner imports no native ONNX binary.

```sh
npm install --prefix /content/canonical-deps --ignore-scripts --omit=optional @huggingface/transformers@4.3.1 onnxruntime-web@1.31.0-dev.20260914-8d85527a0 typescript@7.0.2
python -m ml.browser.prepareCanonical --manifest data/manifest.json --output /content/staged-pcm
node ml/browser/extractCanonicalNode.mjs --manifest /content/staged-pcm/manifest.json --output /content/canonical-run --cache /content/model-cache --dependencies /content/canonical-deps --repeats 1
```

Model cache layout is `CACHE/c28f.../onnx/audio_model_quantized.onnx` and `CACHE/c28f.../preprocessor_config.json`, as prepared by `ml.features.download_artifact`. No model download occurs inside the runner. With local dependencies and files present, Node extraction needs no network.

The source manifest needs `records` containing `clip_id,label,split,uploader,local_path,sha256`. Optional `--audio-root` remaps source basenames when relocating a manifest. Preparation verifies the source WAV SHA, reads Float32 first channel, crops from sample zero to exactly five seconds at 44.1/48 kHz, and applies no gain or resampling. It rejects short, unsupported, non-finite, near-zero, or clipped inputs. The staged paths are relative and portable; complete original records, including attribution and splitting metadata, remain under `source_record`. Dataset license obligations still apply to their audio and derived artifacts.

Each output binds the manifest, source/PCM SHA, actual model/runtime/library/preprocessor/resampler bytes, implementation, Node/V8/platform and exact repeat count. Every completed row is atomically checkpointed. Rerun the identical command to resume; changed contracts, inputs or corrupt checkpoints fail. `embeddings.json` appears only after all rows complete, in manifest order; use `records[i].checkpoint.embedding` as the normalized Float32 vector and retain the accompanying record metadata. This preparation does not choose labels, assign splits, check all cross-split leakage, train, tune gates, or view predictions. The experiment must perform its independent group/hash/split checks.

## Browser and cross-platform gate

```sh
node ml/browser/canonicalServer.mjs --manifest staged/manifest.json --output output/browser-canonical --port 4186 --repeats 3
# In a dedicated headless browser, open http://127.0.0.1:4186 and click Extract local PCM.
node ml/browser/extractCanonicalNode.mjs --manifest staged/manifest.json --output output/node-canonical --repeats 2 --golden output/browser-canonical/embeddings.json
```

The server listens only on loopback, serves a fixed file whitelist, disallows external requests with CSP, and accepts bounded, token-protected embedding checkpoints from its own origin. It never uploads audio. Node explicitly imports the browser preprocessing bundle and binds Transformers.js's supported `Symbol.for('onnxruntime')` override to the same ORT-Web WASM module. Importing the Transformers package root in Node would instead select native ONNX and is deliberately avoided.

`--golden` requires the identical set of clip IDs and PCM plus the same encoder, preprocessing, resampler and WASM bytes. It compares complete PCM, feature and embedding SHA256s; even one differing bit fails and prevents completion. Run this gate on Linux/Colab before extracting that platform's training/calibration/held-out embeddings. A Windows-only check is not evidence that Linux, ARM, Safari or another runtime is equivalent. A future app must use the same encoder contract and verify its own golden self-test before classifier use.

## Measured local feasibility

Windows headless Chrome 155 and Node 24.18.0/ORT-Web were compared on 20 preselected v2 validation/ood-validation clips plus six synthetic inputs (63 Hz, 1 kHz and seeded noise at 44.1/48 kHz). All full resampled PCM, 64,064-feature tensors and 512-coordinate embeddings were bit-exact between these runtimes. Three Chrome extractions and two Node extractions per clip were bit-exact, without modifying source PCM. The final browser run had no console/page errors or external requests. No held-out predictions or threshold tuning were involved.

Initial Chrome inference median was 288.2 ms and mean 293.4 ms, plus mean preprocessing 25.4 ms across 78 inferences. This suggests roughly 5.3/10.6 minutes of single-pass computation for 1,000/2,000 clips on that PC, excluding setup and I/O; it is not a Colab or phone speed guarantee. Full measured arrays/checkpoints and later run timings remain in ignored `output/canonical-wasm-study/`. Repeated extraction, encoder equality and license metadata do not establish label quality, OOD performance or useful field reliability.

## Checks and sources

```sh
node --test ml/browser/canonicalEncoder.test.mjs
python -m unittest ml.browser.test_prepareCanonical -q
```

The [ORT Web environment documentation](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html) documents one-thread execution, provider selection and matching JS/WASM build requirements. [ORT's platform table](https://onnxruntime.ai/docs/get-started/with-javascript/web.html) supports single-thread WASM on Node; it does not promise bitwise equality for every model/platform. The [pinned HF model metadata](https://huggingface.co/api/models/Xenova/clap-htsat-unfused/revision/c28f2883575e590e04d3146ff0713c2448d691ba?blobs=true) supplies the graph sizes and LFS hashes. The [upstream LAION model card](https://huggingface.co/laion/clap-htsat-unfused) declares Apache-2.0; the pinned Xenova card names that base model but has no separate license tag or LICENSE file. Transformers.js is Apache-2.0 and ONNX Runtime is MIT. Preserve upstream notices and dataset attribution; this experiment makes no new licensing determination for a deployed derived classifier.
