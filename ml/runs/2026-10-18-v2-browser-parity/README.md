# Research candidate: browser parity failed

These validation-only checks were recorded on 2026-10-18 after the frozen [second experiment](../2026-10-18-v2/README.md). **Strict parity failed; `promotionAllowed=false`.** No coefficients, class order, rejection thresholds or comparison rules were changed in response. No fresh test rows were rescored, and the live app does not import this research scorer.

The candidate is the balanced logistic regression head with C=10 over frozen 512-dimensional CLAP embeddings. This is a trained classification head, not full encoder fine-tuning. Its five broad labels are `buzz`, `mechanical_fan`, `speech`, `traffic` and `wind`. These checks do not establish equipment identity, fault diagnosis, confidence calibration or field accuracy.

## Observations

| Comparison | Cases | Label disagreements | Accept/reject disagreements | Other observed differences |
| --- | ---: | ---: | ---: | --- |
| Same saved native embeddings: Python head versus JavaScript head | 325 | 0 | **3** | Maximum decision-score error 1.3323e-14 |
| Prepared WAV through browser processor, q8 WASM encoder and JavaScript head versus saved Colab embeddings plus Python head | 20 | 0 | 0 | Maximum score error 0.13336; minimum embedding cosine 0.998496 |

The first comparison uses every existing `val` and `ood_val` row: 135 known and 190 unknown examples. Each 512-value embedding was transferred as JSON numbers and reconstructed as Float32. Python expectations were calculated locally on Windows from those saved Colab embeddings, the original verified fitted artifact and the unchanged `predict_research_artifact` implementation. JavaScript used the exported parameters and fixed rules with their original inclusive `>=` comparisons. Passing required identical label and gate bits, with head numeric errors at most 1e-9.

Three unknown validation cases changed from Python rejection to JavaScript acceptance:

| Clip | Predicted class | Python value | Frozen threshold |
| --- | --- | ---: | ---: |
| `392830` | wind | margin 3.8585154562592985 | 3.858515456259299 |
| `48044` | buzz | margin 0.09835164127137874 | 0.09835164127137876 |
| `mimii_0db_pump_id04_normal_00000687` | mechanical_fan | affinity 0.8758874014708541 | 0.8758874014708542 |

The differences are near floating-point roundoff, but the resulting gate bits differ. All three carry the diagnostic `numericBoundary` flag. That flag does not change acceptance or excuse the strict parity failure. Maximum margin error was 1.1546e-14 and maximum top-three cosine-affinity error was 1.6653e-15.

The audio subset was selected before predictions: the first two records in frozen manifest order from each validation `(split, dataset, label-or-machine-type)` bucket. It comprises 12 known and eight unknown clips from FSD50K and MIMII. No IVBEE or test clips are included. Every WAV is already five seconds of mono 48 kHz Float32 audio. Browser decoding matched all 20 saved PCM SHA256s exactly. Both processors returned `[1,1,1001,64]` tensors with the documented five seconds of zero padding. Maximum feature difference was 7.6294e-6. Maximum normalized embedding-coordinate difference was 0.00770077; maximum margin difference was 0.131097 and affinity difference 0.00467330. Matching 20 labels and gate bits does not demonstrate general encoder equivalence or correctness: both implementations accepted two of the eight unknown clips.

## Runtime diagnostic

The same 20 validation tensors were also passed through local native ONNX Runtime, without reevaluating the head:

| Controlled comparison | Maximum embedding-coordinate difference | Minimum embedding cosine |
| --- | ---: | ---: |
| Windows native, browser features versus Python features | 0 | 1 |
| Windows native, Python features versus saved Colab native embeddings | 0.00752422 | 0.998605 |
| Windows native versus browser WASM, identical browser features | 0.00809176 | 0.998540 |

Thus the small processor differences did not change local native embeddings in this subset. Differences remain across the saved Colab pipeline, Windows CPU execution and browser WASM execution. This diagnostic does not identify one kernel or platform as the cause and does not establish equivalence outside these cases.

Colab used Python 3.13.16 on Linux with ONNX Runtime 1.23.2. The local reference used Python 3.10.11 on Windows with ONNX Runtime 1.23.2. Chrome 155 ran Transformers.js 4.3.1 with its bundled ONNX Runtime Web `1.31.0-dev.20260914-8d85527a0`, single-threaded WASM. Full package/platform metadata is in `parity.json`. The browser had zero console errors and one Windows `requestAdapter` power-preference warning; inference was explicitly requested through WASM.

## Artifact identity and scope

The encoder is the **audio-only** `audio_model_quantized.onnx` branch of `Xenova/clap-htsat-unfused`, revision `c28f2883575e590e04d3146ff0713c2448d691ba`. Its SHA256 is `3fcff2c8824e7bcb83a983f2a49edab3b60cbcf4872ac70efee517355173bd1f`. Browser model, config and processor bytes were verified before inference. This does not compare against the live app's combined q8 graph or its eight descriptions.

The original experiment source is `0da8c60dee54ac961e395ec646cf657563268fdf`. Fitted-model SHA256 is `c29ad0b6ed2361524560f60710fdd58c76ab57ad5086a99fe0940f003251b7d5`; manifest SHA256 is `8a22e336d2eb1806ab228b381badb46156e67f198013d77b31a0565fbb3f0ab8`. The exporter verified the completion environment, frozen fit contract, model bytes and scorer-source binding before loading the fitted artifact. Complete hashes, validation-bundle identity, source fingerprints and unchanged encoder contract are recorded in `parity.json`.

`parity.json` preserves all 325 head comparisons and the 20 audio comparisons. `encoder-stage-diagnostic.json` preserves the controlled per-case runtime comparisons. `artifact_index.json` checksums these two bounded payloads. No audio, feature matrices, embeddings, classifier weights or training reference vectors are included here. The isolated local harness and its full raw download remain ignored audit artifacts under `output/ml-v2-results/browser-parity`; their source/output hashes are retained in the payload. Reproducing the check requires the archived validation bundle; these bounded JSON files alone cannot reconstruct its audio or embeddings. Original file decoding/resampling and field recordings are outside this check's scope.

This candidate remains research only. The threshold-boundary disagreements, encoder drift and the [separate fresh-cohort limitations](../../../docs/AI_V2_RESULTS.md) require resolution through a new preregistered validation procedure before any promotion. Downstream licensing review also remains pending.
