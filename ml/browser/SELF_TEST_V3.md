# Synthetic V3 startup self-test

This checks numerical software compatibility only. Two artificial signals do not establish field accuracy, class coverage, microphone behavior, source identity, or calibration. No classifier head is included, scored, or fitted. The app does not activate this tool automatically.

`selfTestV3.mjs` is import-free and exports frozen `SELF_TEST_V3` specifications plus `generateSelfTestV3Input(id)`, returning a fresh `{id,sampleRate,samples:Float32Array}`. Each call has independent storage and a fresh fixed-seed state.

| Case | Definition |
|---|---|
| `tw-v3-square-44100` | Five seconds at 44,100 Hz: exactly 220,500 samples, +0.0625/-0.0625 from `floor(n*126/44100)%2`; 630 half cycles of 350 samples each. |
| `tw-v3-noise-48000` | Five seconds at 48,000 Hz: exactly 240,000 samples; xorshift32 seed `0x1a2b3c4d`, shifts 13/17/5, state updated before each sample, then `((state>>>8)-0x800000)*2^-27`. |

The generator uses no trigonometric function, nondeterministic RNG, gain adjustment, or normalization. All generated sample values are exactly representable as Float32. The generator source SHA256 is `cf4c6a95f4b5108c4c906829385f062a66ccf363a2ece78c49da31b634af4105`; future qualified packages copy these bytes verbatim.

The frozen `fixtures/self-test-v3-reference.json` is 36,622 bytes with SHA256 `6d5414df3b9413283c88f599887d149314c9c8fb189c5324205b452e33a2212d`. It preserves both normalized 512-coordinate vectors, complete input/resampled-PCM/feature/embedding hashes, pinned runtime/preprocessing identities, and original Node/Chrome run provenance. The packager pins its complete bytes separately. Do not replace it with a new run or edit its vectors after seeing results.

## Run all 11 checks without encoder inference

From the repository root, use Node and Python with NumPy plus the repository on `PYTHONPATH` (see `ml/requirements.txt` for the pinned research environment):

```powershell
node --test ml/browser/selfTestV3.test.mjs
python -m unittest ml.browser.test_self_test_v3_reference
```

The four JavaScript tests check every square sample, independently verify every noise sample with a BigInt xorshift implementation, check ownership/restarts, and reject invalid/mutable specifications. The seven Python tests regenerate only these two synthetic inputs into temporary directories, then use archived software-check metadata. They verify exact reference reconstruction and corruption/no-overwrite behavior. They do not load weights or invoke an encoder/classifier.

## Reconstruct the frozen reference from archived outputs

Original run metadata is archived under `ml/runs/2026-10-18-v3-startup-selftest/`, with a byte-preserving `checksums.json`. It contains no audio, weights, or real-data predictions. Generate temporary PCM locally, then reconstruct into a new output path:

```powershell
node ml/browser/stageSelfTestV3.mjs --output output/v3-selftest-rebuild/staged
python -m ml.browser.buildSelfTestV3Reference --staged-manifest output/v3-selftest-rebuild/staged/manifest.json --node-embeddings ml/runs/2026-10-18-v3-startup-selftest/node/embeddings.json --chrome-embeddings ml/runs/2026-10-18-v3-startup-selftest/chrome/embeddings.json --output output/v3-selftest-rebuild/reference.json
Get-FileHash output/v3-selftest-rebuild/reference.json -Algorithm SHA256
```

`--source-manifest` optionally specifies `synthetic-source.json`; by default it is read beside the staged manifest. The staged PCM paths are local synthetic files only. The builder validates the independently pinned generator and both expected input hashes, the exact ordered manifest rows, complete Node/Chrome contracts, three repeats in each environment, finite normalized Float32 vectors, and every numeric stage hash. It creates output exclusively, accepts an existing output only when byte-identical, and never overwrites a different reference.

## Independent fresh Node and Chrome extraction

This optional workflow runs only the two synthetic cases through the unchanged encoder. It needs the exact pinned Node packages, standard-WASM artifacts, and locally downloaded audio-only quantized CLAP weights in `output/ml-cache`. Always use new output directories: checkpoint resume does not rerun inference.

```powershell
node ml/browser/stageSelfTestV3.mjs --output output/v3-selftest-new/staged
node ml/browser/extractCanonicalNode.mjs --manifest output/v3-selftest-new/staged/manifest.json --output output/v3-selftest-new/node --cache output/ml-cache --repeats 3
node ml/browser/canonicalServer.mjs --manifest output/v3-selftest-new/staged/manifest.json --output output/v3-selftest-new/chrome --cache output/ml-cache --port 4889 --repeats 3
```

Confirm the port is free before starting the local server. Open its local URL in an isolated browser session and press **Extract local PCM**. Wait for `complete`, two completed cases, and `disposed:true`. No microphone permission, audio upload, or other browser session is needed. Stop only this server/browser session when finished. Then build a new candidate reference document from those independent outputs:

```powershell
python -m ml.browser.buildSelfTestV3Reference --staged-manifest output/v3-selftest-new/staged/manifest.json --node-embeddings output/v3-selftest-new/node/embeddings.json --chrome-embeddings output/v3-selftest-new/chrome/embeddings.json --output output/v3-selftest-new/reference.json
```

New JSON provenance includes new run timings/environment details, so the new document's complete hash can differ from the frozen reference. Numeric stage hashes and vectors must still match exactly. The unchanged Node runner can also perform an independent fresh extraction against the original archived Chrome reference:

```powershell
node ml/browser/extractCanonicalNode.mjs --manifest output/v3-selftest-new/staged/manifest.json --output output/v3-selftest-new/node-vs-original --cache output/ml-cache --repeats 3 --golden ml/runs/2026-10-18-v3-startup-selftest/chrome/embeddings.json
```

No tolerance, renormalization, parameter selection, head scoring, or reinterpretation as field evidence is allowed. Future startup code should fail closed on a mismatch. Any expected head scores require a separately pinned fitted-head identity; this reference contains none.
