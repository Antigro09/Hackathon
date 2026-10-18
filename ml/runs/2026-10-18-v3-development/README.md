# Frozen historical development assignment

All original v1/v2 splits are now inspected **development only**. This metadata-only assembly opened no audio, embeddings or model predictions. Raw manifests, all historical identities/hashes (including excluded sources), exact final reservations and the deterministic whole-lineage assignment are preserved here.

The source is `ml/data_v3.py`, seed 18043, with 50/25/25 train/calibration/development-audit proportions. Its 1,358 CC0/CC-BY clips exclude all 210 MIMII records and every reserved final identity. The 383 repeated historical IDs were collapsed only after verifying their identity. No class or seed was selected from classifier performance.

| Family | Train | Calibration | Development audit |
| --- | ---: | ---: | ---: |
| Buzz | 57 | 25 | 26 |
| Mechanical fan | 43 | 20 | 21 |
| Speech | 157 | 73 | 73 |
| Traffic | 76 | 37 | 36 |
| Wind | 128 | 60 | 60 |
| Unknown | 233 | 117 | 116 |

`artifact-index.json` binds the six generated payloads, including byte-identical copies of both old manifests. The development manifest SHA256 is `e0c86b5613b2c0b16e3f6df8f19abe7241228eb30b3df40f67ba1632b08d9ff7`. Final reservations retain SHA256 `08f9e9bcd5eecdcf7fe3273ffd8d8e75397ce3291938fd0d32fe6b8e10ea5b7b`.

Canonical staging must verify every actual WAV/PCM hash. Always supply both frozen `assignments.roleByClipId` and `assignments.groupByClipId` to the v3 adapter: specimen-specific owners cannot replace unioned recording lineages or shared laboratory collections. Metadata support is not evidence of recognition accuracy, independent field performance or encoder-pretraining novelty. No candidate is qualified by this archive.
