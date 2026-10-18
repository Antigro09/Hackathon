# First V3 fit — DEVELOPMENT AUDIT FAILED

**Research only; do not activate or promote this head.** The frozen development audit rejected the first V3 candidate: **6/116 unknown clips were falsely accepted (5.1724%); the descriptive 95% Wilson upper bound was 10.8268%, exceeding the predeclared 5% maximum.** All five recorded class-specific gates passed, but the combined development gate failed. This is a completed fit with a failed development audit, not an incomplete fit or a passed release.

At creation of this historic fit/parity archive, the fresh final cohort remained untouched. This archive contains no final query, fit-side final-audit claim, final prediction or model promotion. Its `frozenFinalSourceSha256` is the unchanged `197e24e42c36de1368f9cd25424c98a4f8935af7c60429c4521d8d80feaa9520`. A later relative comparison against the deployed eight-prompt baseline, or discussion of a future V4 protocol, is separate; this archive neither implements nor authorizes threshold/protocol changes or records such a fresh-data comparison.

## What the saved development results mean

| Recorded measure | Result |
|---|---|
| Known clips accepted | 106/216 (49.0741% coverage) |
| Correct among accepted known clips | 103/106 (97.1698% selective precision; Wilson interval 92.0074–99.0329%) |
| Correct among all accepted predictions, including unknown inputs | 103/112 (91.9643%) |
| Unknown false acceptance | 6/116 (5.1724%; Wilson interval 2.3919–10.8268%) |
| Frozen maximum unknown Wilson upper bound | 5% — **failed** |
| Recorded per-class gates | All five passed |
| Overall development audit | **Failed** |

The per-class gates in this frozen protocol use precision among accepted **known-class** inputs; their passing result does not imply acceptable unknown rejection. The saved report also exposes the effect of unknown inputs on each predicted class:

| Family | Correct accepted / true-class clips | Precision among accepted known-class inputs | Precision among all inputs accepted as this family |
|---|---:|---:|---:|
| Buzz | 15/26 | 15/15 | 15/16 |
| Mechanical fan | 10/21 | 10/10 | 10/10 |
| Speech | 46/73 | 46/48 | 46/49 |
| Traffic | 9/36 | 9/9 | 9/10 |
| Wind | 23/60 | 23/24 | 23/27 |

These are recorded development observations, not fresh-test accuracy or microphone reliability. Clip-level Wilson intervals omit uploader/collection dependence and field-domain uncertainty. Five-second public recordings and source labels cannot establish a physical source, tonality, calibrated level or useful live-microphone coverage. Raw per-source, group, confusion, calibration, selection and audit results remain in `fit/development_v3.json` without recomputation or editing.

The 1,358 historical development clips used fixed seed 18043 and frozen lineage roles: 461 known + 233 unknown for training; 215 known + 117 unknown for calibration; 216 known + 116 unknown for the development audit. The saved training-only group-CV selection was `C=0.1`, `unknownWeight=1.0`; the frozen calibration accepted 2/117 unknown clips. The subsequent development result is preserved as a failure, with no post-audit refit, gate change or tolerance adjustment in this artifact.

## Exact original artifacts

`fit/` preserves the entire downloaded fit root: **32 completion-indexed payload files plus the original `fit-completion.json`**, including the head, development results/manifest, source snapshots, complete canonical embeddings/staging, numerical qualification, original historical manifests/ledger/exclusions, and final reservations. No JSON was reserialized, labels repaired or paths rebased. The 27 MB development embedding document is intentionally included so the failed attempt remains inspectable and reproducible.

| Immutable identity | SHA256 |
|---|---|
| Downloaded ZIP (not duplicated here) | `ee633cf4b02c86592fedcf9ec70dc995ed1da1d1163802ebadc113391e9e8003` |
| Fit completion | `74cf3f85891cba5f940d8e19ef61eae1d922e1e1640605df48dac09d376a7dee` |
| Raw fitted head | `1e373cd18cbd706812dac10b19a320b73a568e6ee40e3f34236e03ae6122f491` |
| Frozen parameters and rejection rules | `6f1119be47ffeea7fcf8b3e1b4212af7d387cdef14667c3c871f46e9c98c8a92` |
| Development source manifest | `e0c86b5613b2c0b16e3f6df8f19abe7241228eb30b3df40f67ba1632b08d9ff7` |
| Final reservations | `08f9e9bcd5eecdcf7fe3273ffd8d8e75397ce3291938fd0d32fe6b8e10ea5b7b` |
| Original 26-case Chrome qualification reference | `f713e30fb35ed458a3ec80337476bf2e0feccf627e8a2e5d27248563610404f4` |

Training ran in Colab CPython 3.13.16 on Linux x86_64, with NumPy 2.2.6, SciPy 1.15.3, scikit-learn 1.7.2 and joblib 1.6.0. The canonical encoder uses the pinned browser WEB-WASM path; its exact environment, source/runtime/weight/preprocessing fingerprints and qualification evidence are retained. This Windows archive verification does not substitute its runtime for the recorded Linux fit runtime.

`logs/preflight-failed-before-fit.log` preserves the earlier preflight error before fitting. The operator's terminal check found all 1,358 JSON row values equal; the first serialization mismatch was clip `104017`, whose duration appeared as `26.0` in Python and `26` in JavaScript. Commit `9175a1b` corrected comparison of exact finite JSON numeric values while retaining distinct booleans, exact strings/keys/order, and separate raw-byte hashes; it added no epsilon and changed no audio, label, split, encoder, model or gate. The corrected comparison code is preserved in the fit's source snapshots. There is no separate raw repair-command log; the original stacktrace and source commit are the available evidence. The original failure is not hidden or overwritten. `logs/fit-v3-first-verified-metadata.log` preserves the completed fit's path output; `logs/verified-fit-summary.json` is the original local download-verification summary, explicitly recording `predictionsRecomputed:false`. `verification/download_verifier_original.py` preserves that verifier's exact historical source; its original path assumptions are historical, so use `verify.py` below for this archive.

## Frozen-head numerical parity passed; development failure unchanged

`head-parity/` preserves the exact complete output of the offline Python/JavaScript checker: **1,360 cases = all 1,358 original development embeddings plus the two frozen synthetic startup vectors**. Every saved signed quantized coordinate, all six integer scores, guarded margin, predicted label/class and acceptance bit matched exactly; mismatching cases, maximum integer-score error and maximum margin error were all zero. This checks arithmetic on identical saved embeddings, not recognition accuracy or a new encoder/final-data run. The failed unknown-rejection development gate above is unchanged.

The directory contains all 12 completion-indexed payloads plus the original completion, including the exact fitted head, copied input embeddings/staging/startup reference, complete Python expected quantization/results, JavaScript results/evidence, exact compiled scorer and captured Node output. Its duplicated development inputs intentionally match `fit/inputs/` byte-for-byte; Git can reuse identical blobs.

| Head-parity artifact | SHA256 |
|---|---|
| Completion | `ad7cdb971464ec6660534bd6e93019a795e03beda190204bd8578048f28a45d5` |
| JavaScript strict comparison | `9c716c3d38fe7183a78da322f3997acf29e4f51dfd48c724764e6e5e533b650c` |
| Python saved expectations | `a2fa7d8a971eb5b5134f2d5f90c61e35fb1931dea1206955d23f0a7439ff585c` |

The parity raw head remains `1e373cd18cbd706812dac10b19a320b73a568e6ee40e3f34236e03ae6122f491`; parameter/rule hash remains `6f1119be47ffeea7fcf8b3e1b4212af7d387cdef14667c3c871f46e9c98c8a92`. Both parity documents set `accuracyEvaluated:false`, `encoderRun:false` and `promotionAllowed:false`. Archiving and verification do not rerun the predictor. See [`HEAD_V3_PARITY.md`](../../browser/HEAD_V3_PARITY.md) for the checker contract.

## Verify without predictions or ML dependencies

Run from any directory with Python's standard library:

```sh
python ml/runs/2026-10-18-v3-first-fit/verify.py
```

The verifier hashes every archived payload against `checksums.json`, requires the exact file inventory, rechecks all 32 original fit-completion entries and 12 head-parity-completion entries, verifies the independent completion/head/parameter pins, and checks frozen source/manifest/encoder/provenance/report bindings. It also compares all 1,360 saved expected/actual results and saved quantized-array hashes. It reads saved results only: no model import, audio/weight read, inference, predictor, fit or final-query operation. Optional `--index-sha256 HASH` pins the whole index to an independently recorded digest. Existing `.gitattributes` applies `ml/runs/** -text` to preserve raw bytes.

No audio, CLAP graph/runtime binaries, account credentials, Colab notebook, or browser session is included. Metadata and saved vectors/results derive from public recordings and retain original creator/license/source fields; these notices must remain with further use. `fit/inputs/development/manifest-v3-development.json` contains 1,335 FSD50K and 23 IVBEE eligible records. Original historical manifests also preserve excluded MIMII/other records as leakage exclusions; their presence is not permission to train with them. Original MIMII-containing qualification fixtures are noncommercial software-parity research only, not production training audio.

Source notices: [FSD50K dataset and creator-license metadata](https://zenodo.org/records/4060432), [primary FSD50K repository](https://github.com/MTG/FSD50K), [IVBEE source](https://zenodo.org/records/20077113) (Piotr Książek, Wrocław University of Science and Technology; CC BY 4.0), and [MIMII original collection](https://zenodo.org/records/3384388). Each FSD recording keeps its individual Freesound URL/uploader and CC0/CC BY deed in the manifests. This archive adds no license or field-ground-truth claim to those original records. The separately archived [fresh final-data reservations](../2026-10-18-v3-data/README.md) describe that unqueried cohort; no final audio is copied here.
