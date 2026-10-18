# Canonical WASM numerical qualification

Recorded October 18, 2026. Linux Node and Windows Node, both using the pinned **ONNX Runtime Web WASM** backend, reproduced the same 26 prepared-PCM cases as the pinned Windows headless Chrome reference. Every recorded resampled-PCM, log-mel-feature and normalized-embedding SHA256 matched across runtimes and repeats. All 512 embedding coordinates per case were also compared directly: maximum coordinate difference **0**. No classifier head or accuracy metric was evaluated here, and `promotionAllowed=false` throughout.

| Recorded run | Runtime | Repeats per case | Cases matching Chrome | Maximum embedding difference |
| --- | --- | ---: | ---: | ---: |
| Chrome reference | Windows, HeadlessChrome 155.0.0.0 | 3 | 26 | 0 |
| Linux qualification | Node 20.19.0, V8 11.3.244.8-node.26, Linux x64 | 2 | 26 | 0 |
| New Windows qualification | Node 24.18.0, V8 13.6.233.17-node.50, win32 x64 | 2 | 26 | 0 |

The fixture set contains 12 earlier FSD50K validation clips, eight earlier MIMII validation clips, and six generated fixtures: 63 Hz and 1,000 Hz sinusoids plus noise at each of 44.1 kHz and 48 kHz. All 20 recorded-sound fixtures are already prepared at 48 kHz. The 44.1 kHz fixtures exercise the deterministic resampler. MIMII appears only as diagnostic qualification material; it is excluded from v3 development fitting and the final/release source policy. This set is numerical evidence, with no independent human sound-family adjudication added by this check.

## Fixed numerical pipeline

The encoder is `Xenova/clap-htsat-unfused`, revision `c28f2883575e590e04d3146ff0713c2448d691ba`, audio-only `onnx/audio_model_quantized.onnx`, SHA256 `3fcff2c8824e7bcb83a983f2a49edab3b60cbcf4872ac70efee517355173bd1f`. It uses Transformers.js 4.3.1 and ONNX Runtime Web `1.31.0-dev.20260914-8d85527a0`, single-threaded WASM, fixed SIMD checking, sequential execution and graph optimization `all`. Node explicitly imports the browser library bundle and the same WEB-WASM runtime; it does not substitute native ONNX Runtime.

Input is the first channel of exactly five seconds of prepared Float32 PCM, with no gain change. The pinned preprocessing appends five seconds of zeros, producing `[1,1,1001,64]` log-mel features. Output normalization sums squares and takes the square root in sequential JavaScript Float64 arithmetic, then stores each normalized coordinate as Float32. The stable runtime fingerprint is `f28a76756690691b355ee60359aaed7460b2c9674be6e8e10df2dd0159acdac9`; the stable preprocessing fingerprint is `8a3c23901e5ef9b122ae5170c7da1d92c0d92aeea0c1aa8552997dc64b5a8fc8`. Complete dependency/source hashes and actual environments remain in the raw contracts.

The Chrome reference raw-file SHA256 is **`f713e30fb35ed458a3ec80337476bf2e0feccf627e8a2e5d27248563610404f4`**. Its contract SHA256 is `421d7e2a6cbc46cfda0e13971ba0936f9067d56b93bc56d7303a342c4b2c9441`. The qualified Linux contract is `ca8670144ccaef1b9b191dc02b53a9f97026a5e3e3bd027e278c605326e2a865`; the new Windows contract is `5da0e86b201940146ee04c454282f7b617e910e05e10eec430a5668c5ed2d39b`. Different environment/full-run identities are expected; the stable encoder dependencies and measured outputs agree. All three bind the exact staged-manifest bytes, SHA256 `25448ca576662cf21511b2f691100e6e8d93d4f76c985bc35e6da55430f63e68`.

## Preserved evidence

The copied source paths were `output/canonical-wasm-study/linux-qualified-v3/node/`, its sibling `staged/manifest.json` and `verified-summary.json`, `output/canonical-wasm-study/windows-qualified-v3/`, and `output/canonical-wasm-study/chrome-golden/`. Existing matching archive payloads were checked and retained; no copied JSON was reserialized or rebased.

- `chrome-reference.json` and `chrome/contract.json`: the exact final Chrome reference and its separate contract. Earlier scratch Chrome outputs are not used.
- `qualification-staged-manifest.json`: the original shared input metadata, including per-clip attribution, source and prepared/PCM hashes. Its embedded original cache paths are preserved; they are not portable audio files.
- `linux/`: byte-preserving copies of Linux `embeddings.json`, `contract.json`, `golden-comparison.json`, staged manifest and the original `verified-summary.json`. The summary records the downloaded Linux bundle hash and size; that outer ZIP is not included here.
- `windows/`: byte-preserving copies of the **new** Windows qualification's embeddings, contract and golden comparison.
- `windows-feasibility.json`: an unchanged, earlier Windows feasibility summary referencing contract `c020ef14...` and its earlier timings. It is historical context and is not the new Windows run in the table.
- `recomputed-summary.json`: measurements independently recomputed from these archived arrays, repeat hashes and timings, without calling any encoder or head.
- `artifact-index.json`: SHA256 and byte length of every other file in this directory, including this README and the verifier. The index does not hash itself.

Run the stdlib-only, read-only verification from the repository root:

```sh
python ml/runs/2026-10-18-v3-canonical/verify-qualification.py
```

It verifies the complete indexed inventory, raw-byte hashes, separate contracts, staged order, all 26 checkpoints and repeats, Float32 unit embeddings and embedding-array hashes, compatible encoder fingerprints, and exact cross-runtime coordinate/hash equality. It recomputes the comparison instead of trusting success booleans. PCM and feature **matrices are not included**, so their recorded SHA equality can be checked here but cannot be regenerated from audio using this archive alone. The full raw audio/golden working bundle remains outside the tracked archive. No raw audio, encoder weights, trained candidate parameters or final-audit embeddings/predictions are included.

## Observed timings and limits

| New Node run | Model load | Mean preprocessing per extraction | Mean inference per extraction | Entire 26-case, two-repeat job |
| --- | ---: | ---: | ---: | ---: |
| Linux | 6.563 s | 96.439 ms | 806.153 ms | 54.642 s |
| Windows | 1.159 s | 18.260 ms | 219.697 ms | 13.887 s |

These are the recorded jobs' wall-clock observations, not a controlled hardware benchmark, browser latency guarantee or microphone latency measurement. Chrome's saved per-extraction mean inference was 345.581 ms and mean preprocessing was 29.921 ms over 78 extractions; its full job wall time/model-load time are not recorded in the archived embeddings document.

Passing these fixtures establishes numerical equality only for the specified inputs, exact bytes, execution settings and recorded runtimes. It does not establish sound-family accuracy, rejection of unfamiliar sounds, calibrated probabilities, equipment identity, source attribution, field reliability or equivalence of all browsers/devices. Prepared PCM bypasses microphone acquisition, original compressed-file decoding and changing recording conditions. Matching repeat hashes is not evidence of independent sound sources. Encoder pretraining overlap and dataset/device confounding remain possible.

The old native-CPU versus browser differences remain preserved in the [v2 parity archive](../2026-10-18-v2-browser-parity/README.md). This qualification uses one newly specified canonical WEB-WASM pipeline; it does not retroactively repair v2 or alter its thresholds. V3 fitting, untouched final evaluation, integer-head parity, actual app/browser checks, field validation and license review remain separate gates. Original clip licenses/attributions in the staged source records remain applicable; this archive does not relicense them as repository MIT code. No app activation or deployment is authorized by numerical qualification alone.
