# Synthetic startup parity evidence — 2026-10-18

This archive contains only metadata from two deterministic artificial software checks. It contains no PCM/WAV/audio, weights, real observations, training/final dataset records, classifier head, or model-accuracy predictions. Synthetic encoder vectors below are numerical reference outputs, not field evidence. No app activation was performed.

Two inputs were fixed before extraction: five-second 44,100-Hz +/-0.0625 square half cycles from `floor(n*126/44100)%2`, and five-second 48,000-Hz xorshift32 noise with seed `0x1a2b3c4d`, shifts 13/17/5, exact top-24-bit scaling by `2^-27`. Each case completed three unchanged canonical Node WEB-WASM encoder calls and three calls in an isolated Chrome session. Input, resampled PCM, features, embedding hashes, and all 512 normalized Float32 coordinates matched exactly across environments and repeats. Chrome reported `disposed:true`.

The exact original Node/Chrome `contract.json`, `embeddings.json`, and per-row checkpoint bytes are preserved under `node/` and `chrome/`. `staged/` contains the original two JSON manifests, with hashes and synthetic input definitions but no referenced `.f32` files. `sources/selfTestV3.mjs` preserves the exact generator bytes. Paths in original manifests refer to the original staging/cache locations; they are historical metadata, not automatic download or access instructions.

| Identity | SHA256 |
|---|---|
| Generator source | `cf4c6a95f4b5108c4c906829385f062a66ccf363a2ece78c49da31b634af4105` |
| Frozen reference in `ml/browser/fixtures/self-test-v3-reference.json` | `6d5414df3b9413283c88f599887d149314c9c8fb189c5324205b452e33a2212d` |
| Original staged manifest | `cb05d0819d7839a0adbd5323f1e4618fd61aadc4ae7444963a14be33b6ec01d9` |
| Original Node embedding document | `590932cebda8b220168c53793ad9f91f79066cfba93ab80e06af18c3a9ff0884` |
| Original Chrome embedding document | `2b2e38ea16a6705a768ea82465e6eeabb92a833d5e9cc8991b306a040493c312` |
| Stable runtime fingerprint | `f28a76756690691b355ee60359aaed7460b2c9674be6e8e10df2dd0159acdac9` |
| Stable preprocessing fingerprint | `8a3c23901e5ef9b122ae5170c7da1d92c0d92aeea0c1aa8552997dc64b5a8fc8` |

Runtime: Windows x64 Node v24.18.0/V8 13.6.233.17-node.50 and isolated HeadlessChrome/155.0.0.0; Transformers.js 4.3.1 and ORT-Web 1.31.0-dev.20260914-8d85527a0, standard WASM, one thread, sequential execution, full graph optimization. Both full contracts retain exact model/runtime/encoder/preprocessor/resampler/compiled-dependency hashes.

`checksums.json` binds every other archive file's raw bytes and records the original relative source of copied artifacts. Existing `.gitattributes` applies `ml/runs/** -text` to preserve these bytes. The frozen reference is stored only at the existing fixture path and is separately pinned by the optional runtime packager; it was not reserialized or overwritten for this archive.

Reproduction and all **11 inference-free checks** are documented in [`ml/browser/SELF_TEST_V3.md`](../../browser/SELF_TEST_V3.md). The Python tests generate the two synthetic inputs temporarily and rebuild the byte-identical frozen reference using these archived original runs. A separate optional workflow can compare independent fresh Node and Chrome software runs. No new inference was needed to create or verify this archive.
