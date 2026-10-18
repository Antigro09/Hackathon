# Frozen candidate versus the deployed website baseline

The fixed v3 candidate **passed all predeclared relative recognition criteria on this cohort**. Its known-family macro F1 was **0.777994**, versus **0.394497** for the website's original eight-prompt top-one mapping, a difference of **+0.383497**. This is a measured comparison on these public recordings. It is not a field reliability, equipment-identity or calibrated-confidence guarantee.

The original v3 development audit **failed**, and the candidate still **fails the original stricter criteria** on this cohort. Those failures have not been renamed or relaxed in the stored results. The user explicitly requested a replacement that is better than the website baseline; the revised relative bar was committed before either system queried this cohort.

## Fixed design and denominators

The protocol is preserved byte-for-byte as [comparison/protocol.md](comparison/protocol.md), committed at `dbb71588a7d4897f30fe6f64a395ace300cad6f1`. The comparison implementation and legacy harness were frozen at `2469911d31e6a312292918f02113c8e12e96e778` before the fresh runs. Root executed the committed evaluator once. This archive and its verifier did not rerun the evaluator, encoder or head.

All **416** reserved records remain present: buzz 36, mechanical fan 35, speech 52, traffic 52, wind 47 and unknown 194. The unchanged public `tw-screen-v2` analysis worker established a common quality mask before either classifier: **409 eligible, 7 blocked, zero analysis errors**. The blocked records are three speech, one wind and three unknown. Both systems abstain on those seven; they remain in full-cohort coverage denominators. The primary paired recognition denominators are therefore **218 eligible known** and **191 eligible unknown**. The legacy run completed 409 results and seven joint quality blocks, with zero classification errors. No row was replaced or dropped because of a model outcome.

The baseline is the actual unmodified deployed eight-description worker from website source `322d40e0d9a0146e35c61e1a46b05d7e9fffb662`, with its combined quantized CLAP graph, original prompt set, tokenizer, preprocessing, single-thread browser WASM and original uncertain/top-two display policy. It returns only two rankings; the archive does not claim an observed eight-score matrix. The protocol's fixed family mapping is applied **after** original ranking. Mapping the quiet-room prompt to an unknown control is not evidence that every unfamiliar recording is quiet.

The candidate uses the unchanged fitted audio-only canonical-WASM encoder plus six-class integer head and original rejection gates. It displays a broad family only when its gate accepts. The two complete systems differ in graph, class representation and output policy; this comparison does not isolate classifier training alone.

## Recorded paired results

| Outcome | Frozen candidate | Actual website baseline |
| --- | ---: | ---: |
| Ungated top-one macro F1, five known families, eligible known clips | **0.777994** | **0.394497** |
| Correct known hints / all family hints on eligible true-known clips | **98/103 = 95.15%** | **95/216 = 43.98%** |
| Family-hint coverage on eligible true-known clips | 103/218 = 47.25% | 216/218 = 99.08% |
| Family-hint coverage on all original true-known clips | 103/222 = 46.40% | 216/222 = 97.30% |
| Family hints on eligible true-unknown clips | **7/191 = 3.66%** | **182/191 = 95.29%** |
| Family hints on all original true-unknown clips | 7/194 = 3.61% | 182/194 = 93.81% |
| Precision on the tested known/unknown mixture | 98/110 = 89.09% | 95/398 = 23.87% |

The candidate is substantially more selective: it offers a hint for fewer than half the eligible known recordings. Its higher accepted-hint precision should be read together with that abstention rate. The primary macro F1 uses ungated top-one labels for both systems, with unknown winners counted as false negatives for their true known family; it does not hide candidate mistakes behind rejection.

| True family | Candidate ungated F1 | Baseline mapped top-one F1 | Candidate correct accepted / eligible | Candidate correct accepted / original total |
| --- | ---: | ---: | ---: | ---: |
| Buzz | 0.677419 | 0.490196 | 18/36 = 50.00% | 18/36 |
| Mechanical fan | 0.729730 | 0.317073 | 17/35 = 48.57% | 17/35 |
| Speech | 0.860465 | 0.393443 | 30/49 = 61.22% | 30/52 |
| Traffic | 0.846847 | 0.131148 | 11/52 = 21.15% | 11/52 |
| Wind | 0.775510 | 0.640625 | 22/46 = 47.83% | 22/47 |

All five candidate families have at least one correct acceptance, as the relative protocol requires. Traffic has the lowest accepted correct coverage. The baseline correctly maps wind top-one on 41/46 eligible wind recordings, while the candidate correctly accepts 22/46; improved overall recognition does not mean greater displayed-hint coverage on every class.

The website's two descriptions remain visible even with `status='uncertain'`; its provisional gate changes wording rather than suppressing them. The correct true-known family appears in its top two for 135/218 eligible known clips. At least one known-family description appears in the top two for **191/191 eligible unknown** clips, including nine whose top-one is the quiet-room control. These are descriptive exposure results, not a substitute primary metric.

## Strict failures and interpretation limits

The original development audit remains false in the frozen first-fit report and the copied `originalDevelopmentStrictAudit`. The unchanged stricter criteria also fail on this cohort for at least these recorded reasons:

- Unknown false acceptance is 7/191 on the eligible subset; its descriptive 95% Wilson upper bound is **7.3705%**, above the original 5% limit. On the full original 194 unknown clips, the upper bound is 7.2594%.
- Wind precision among accepted predictions on true-known clips is **22/25 = 88%**, below the original per-predicted-class 90% requirement. Wind precision on the full tested known/unknown mixture is 22/28 = 78.57%.

The stored strict reports and their original field names are unchanged. Their `developmentAuditPassed` key is the reused evaluator's strict-criteria result, not a claim that this fresh comparison was another development fit. The relative bar passes; the old strict bar does not. The result JSON intentionally retains `promotionAllowed=false`, `productIntegrationAllowed=false` and `independentProductChecksRequired=true`. Recognition evidence alone cannot perform product integration or establish that its separate browser, quality, cancellation, disposal and privacy checks passed.

Creator labels and dataset/session/collection dependencies limit the ground truth. Buzz includes insect recordings and does not validate electrical hum or facility identity. Hardware/domain confounding and possible encoder-pretraining overlap remain. The preserved subgroup counts are available in the results. Clip-level Wilson intervals ignore group and collection dependence. The optional paired bootstrap was omitted; no statistical-significance or population-accuracy claim is made. This cohort is now inspected evidence and cannot be reused as an untouched test for a new fit, prompt map, gate or threshold.

## Evidence layout and byte preservation

- `comparison/` contains the **entire** completed comparator payload and completion ledger: all frozen fit metadata, development lineage/exclusions/reservations, final source/staging/embeddings, common quality, legacy top-two outputs, browser proofs, qualification references, source snapshots and complete per-row outcomes.
- `evidence/quality-v2/` contains the completed common-quality contract, all checkpoints, approved original four source files, measured browser evidence and request log.
- `evidence/baseline/` contains the classification contract, checkpoints, four actual transport/guard sources, before-classification browser proof, after-run/browser/network/server evidence and checksums. These source bytes differ from the earlier quality run only as explicitly recorded; the archive does not relabel the quality run's provenance.
- `evidence/quality-interrupted-firstpass/` and the adjacent first-pass server/error evidence retain the **371-row interrupted pre-AI attempt**, its EPERM request-log rename failure and the original temporary request JSON. That attempt made no classifier queries; the complete quality-v2 run superseded its mask.
- Candidate contract/checkpoints, the complete extraction log, exact staged manifest and the root evaluator log are preserved under `evidence/`. Model outputs are not regenerated.
- `verification-summary.json`, `artifact-index.json` and `verify_archive.py` are generated archival wrappers. The index binds **1,732 payload files totaling 88,206,832 bytes**. This README and `CHECKSUMS.sha256` are additional generated documentation outside that original payload index.

Raw audio/PCM, ONNX/WASM encoder binaries, caches and extra generated preprocessing/compiled bundles are excluded and their omission is inventoried in the verification summary. The small frozen fitted-head JSON and original full embedding JSON remain because they are part of the required scientific comparison ledger. Raw duplicate payloads are intentionally preserved for byte-level audit; Git may deduplicate identical objects.

## Important raw SHA256 identities

| Artifact | SHA256 |
| --- | --- |
| Original comparator completion | `a00a2e2adfff98b7021076c62ac1a2cc82e02a635d8c24bdf2d42cdc2c1d6375` |
| Archive payload index | `2575a3de46e2291865b00cc85fa187a0446e549af4cfbf555d2ad6ec0d28b9e9` |
| Reserved final source manifest | `197e24e42c36de1368f9cd25424c98a4f8935af7c60429c4521d8d80feaa9520` |
| Actual canonical final embeddings | `75b7f10aae4e15bc2299b3c33e58488cf8ba7162cd722333a88744186134a1cc` |
| Completed common-quality results | `3ac09ea4fc0e2fc10abe85dbd66c46c5d1e66f8f4237861912bdc8085c21105b` |
| Completed exact legacy results | `6575bfc45daa03cc4db110a6fb73a82e18618452b4af2a2d030b2dd2ad60f8a1` |
| Frozen candidate head | `1e373cd18cbd706812dac10b19a320b73a568e6ee40e3f34236e03ae6122f491` |
| Frozen candidate parameters and original gates | `6f1119be47ffeea7fcf8b3e1b4212af7d387cdef14667c3c871f46e9c98c8a92` |

`CHECKSUMS.sha256` lists every preserved payload, the archive index and this README. Hashes establish byte identity against these recorded pins; they are not independent authentication of the labels or results.

From the repository root, verify with ordinary Python 3.10+ and **only the standard library**:

```powershell
python ml/runs/2026-10-18-website-relative-comparison/verify_archive.py --verify-only ml/runs/2026-10-18-website-relative-comparison
Get-FileHash ml/runs/2026-10-18-website-relative-comparison/artifact-index.json -Algorithm SHA256
```

Expected verifier output includes `verifiedFiles: 1732`, `bytes: 88206832`, the original completion SHA above and `modelsQueriedByVerifier: 0`. It validates both the archive index and the original comparator completion/input/source/row/failure bindings. It never imports model code, decodes recordings, extracts embeddings, predicts labels, refits, retunes, uploads or deploys.
