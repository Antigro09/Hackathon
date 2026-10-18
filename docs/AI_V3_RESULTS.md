# V3 versus the actual website model

Recorded October 18, 2026. **All frozen relative recognition criteria passed on this cohort.** The earlier strict development audit and the unchanged strict final criteria still failed. Local mounted-app V3 browser/build checks also passed; public V3 deployment verification remains pending.

The [comparison protocol](../ml/BASELINE_COMPARISON_PROTOCOL.md) was committed before either system encoded or classified the reserved cohort. It implements the user's revised goal of improving on the website's actual baseline. No model, threshold, label mapping, metric or quality rule was selected from these final outcomes. The cohort is now inspected evidence and cannot become an untouched test for a later tuned candidate.

## Compared systems and data

The legacy baseline is the unmodified public eight-description CLAP worker, combined audio/text graph and original asyncify WASM runtime. It always displayed its closest two descriptions with uncertainty text. The primary metric uses the predeclared mapping of its original top-one description to five families; the quiet-room prompt maps to an unknown control. Its provisional score gate was retained and did not hide its closest descriptions. This is not a comparison with an earlier five-prompt research substitute.

V3 keeps a **frozen CLAP audio encoder** and trains a separate six-class linear head with exact integer scoring and unchanged rejection rules. The encoder was **not fine-tuned**. The head used 1,358 historical development clips, including fitting, calibration and audit roles: 1,335 FSD50K and 23 IVBEE recordings, all attributed CC0/CC BY. No MIMII recording is in the fitted-head data. Unknown winners and rejected known winners produce no family hint. Buzz, fan, speech, traffic and wind are broad resemblance labels, not equipment identities.

The [frozen final source audit](../ml/runs/2026-10-18-v3-data/README.md) contains 416 public five-second clips: 222 known and 194 unknown. Source IDs, uploader/hive/collection lineage and original/prepared/PCM hashes were checked against all earlier TonalWatch data, including excluded sources and all V3 development roles. This establishes novelty against those recorded histories, not independence from CLAP pretraining or every transformed copy on the web.

The original website DSP worker determined the common quality mask **before either classifier**: 409 eligible clips (218 known, 191 unknown). Seven blocked clips—three speech, one wind and three unknown—remain in the full totals as joint abstentions. No baseline errors or missing pairs were recorded. Both systems used the same original five-second PCM and matching resampled PCM hashes. Blocking and operational outcomes were not dropped to improve a score.

## Paired recorded outcomes

| Measure and denominator | V3 | Legacy website |
| --- | ---: | ---: |
| Ungated top-one macro F1, five known labels on 218 eligible known clips | **0.7779942504** | **0.3944968826** |
| Correct family / emitted family hints on true-known clips | **98/103 (95.15%)** | **95/216 (43.98%)** |
| Emitted hints / eligible known clips | 103/218 (47.25%) | 216/218 (99.08%) |
| Emitted hints / all 222 known clips | 103/222 (46.40%) | 216/222 (97.30%) |
| Family hints / eligible unknown clips | **7/191 (3.66%)** | **182/191 (95.29%)** |
| Family hints / all 194 unknown clips | 7/194 (3.61%) | 182/194 (93.81%) |
| Correct family / all known-and-unknown emitted hints | 98/110 (89.09%) | 95/398 (23.87%) |

The paired macro-F1 difference is **+0.3834973677**. F1 uses each system's ungated top-one label on the same true-known subset; an unknown winner is a false negative for its true class. It is not accepted-hint precision, a probability, or a general accuracy rate. All five fixed labels stay in the macro average. Independent arithmetic from the saved row outcomes reproduces both values.

All five relative checks passed: strictly higher known macro F1; at least baseline true-known hint precision; no greater eligible-unknown family-hint rate; a positive correct acceptance for every known class; and complete paired recognition. Product/browser qualification is a separate requirement. More than half of eligible known clips receive no V3 hint, so 95.15% precision must not be presented as recognition coverage of all known recordings.

| True family | Full / eligible examples | V3 correct accepted / eligible | V3 correct / full | Legacy correct mapped top-one / eligible |
| --- | ---: | ---: | ---: | ---: |
| Insect/buzz-like | 36 / 36 | 18/36 (50.00%) | 18/36 | 25/36 |
| Mechanical fan-like | 35 / 35 | 17/35 (48.57%) | 17/35 | 13/35 |
| Speech-like | 52 / 49 | 30/49 (61.22%) | 30/52 | 12/49 |
| Traffic-like | 52 / 52 | 11/52 (21.15%) | 11/52 | 4/52 |
| Wind-like | 47 / 46 | 22/46 (47.83%) | 22/47 | 41/46 |

Traffic has the lowest V3 correct-acceptance coverage. V3 also accepts fewer correct buzz and wind examples than the baseline's mapped top-one, while substantially reducing wrong family hints overall. All accepted unknown hints are errors under these test labels: one buzz, three speech and three wind.

The original baseline's visible top two contain the true known family on 135/218 eligible known clips. They expose at least one known family on **191/191 eligible unknown clips**, including all nine unknown clips whose top-one is the quiet control. This secondary exposure measure is preserved; it does not replace the predeclared top-one comparison.

## Strict failures and uncertainty remain visible

The original V3 development audit failed: 6/116 unknown clips were accepted, with a 95% Wilson upper bound of **10.8268%**, above the original 5% limit. Its 103/106 accepted true-known hints were correct. That historical failure is retained in the [first-fit archive](../ml/runs/2026-10-18-v3-first-fit/README.md).

Applying the original strict criteria unchanged to the final cohort also fails:

- **Unknown rejection:** 7/191 eligible unknown clips were accepted; the saved 95% Wilson interval is 1.7864%–**7.3705%**, exceeding the 5% upper-bound limit. With all 194 unknown clips and blocked rows retained, the upper bound is **7.2594%**; it still fails.
- **Wind precision on accepted true-known predictions:** 22/25 = **88%**, below the 90% per-predicted-family criterion. Including unknown errors gives 22/28 = 78.57%; this has a different denominator.

The accepted true-known precision interval is 89.14%–97.91% around 98/103, and the eligible-known hint-coverage interval is 40.73%–53.87% around 103/218. These are descriptive clip-level Wilson intervals and omit group/collection dependence. No statistical-significance claim or bootstrap interval is added. Passing the user's revised relative bar does not make the older stricter bar pass.

## Collection and label limits

There are 306 recorded uploader/hive groups, not 416 independent experiments. BSD35k-CS contributes 341 clips (147 known, 194 unknown), FSD50K 48 speech clips, and ToBee 27 insect-buzz clips from six hive IDs. BSD labels combine creator-selected broad categories with titles/tags; the opening five-second sound has not been independently adjudicated as field ground truth. Bee recordings share collection/hardware conditions, and all unknown examples come from BSD. Encoder pretraining overlap is not excluded.

Subgroups show why a single aggregate is insufficient. V3 has 62 correct accepted known hints from 147 BSD known clips (baseline 67 mapped-correct); 27 from 48 FSD speech clips (baseline 12); and 9 from 27 ToBee clips (baseline 16). Within ToBee, all nine correct V3 acceptances come from the 16 NU-Hive clips; **0/11 OSBH clips** are correctly accepted, while three OSBH clips get wrong accepted families. The family and collection are partly confounded. Results do not establish reliability on a resident's microphone, electrical hum, transformers, specific equipment, facilities, source location or field prevalence.

Primary source records and credits: [BSD35k-CS](https://zenodo.org/records/19187100), [To bee or not to bee](https://zenodo.org/records/1321278), [FSD50K](https://zenodo.org/records/4060432), and the [frozen selection/attribution audit](../ml/runs/2026-10-18-v3-data/README.md). The [LAION model card](https://huggingface.co/laion/clap-htsat-unfused) and [pinned Xenova conversion](https://huggingface.co/Xenova/clap-htsat-unfused/tree/c28f2883575e590e04d3146ff0713c2448d691ba) remain separate upstream attributions.

## Software qualification and release status

Before final comparison, the exact integer head matched Python on 1,360 development/synthetic cases, with zero quantized-coordinate, six-score, margin, label or gate differences. The verified-module worker matched all intermediate hashes and full 512D vectors on 26 original software fixtures plus two startup cases. The original website transport was separately exercised on two fixed synthetic inputs with its unchanged eight-description worker. These are numerical software checks, not final recognition or field evidence.

The prepared product uses a 34,301,667-byte audio-only graph plus a 14,264,838-byte standard WASM binary and supporting assets, disclosed as about 51 MB. No model download starts before Explore. The native 44.1/48 kHz first-five-second copy is resampled only inside the qualified worker; the full 5/15/30-second DSP/report remains intact. Exact two-case synthetic startup hashes must pass before recorded audio is processed. The head/scorer and worker dependencies are integrity-checked; failed integrity/startup, quality flags, cancellation, session replacement or navigation leave standard analysis/report available. No audio request is sent to a server, and AI hints are excluded from reports.

The mounted application and lab passed **428 tests across 21 files**: 388 existing checks plus 40 V3 panel/head-loader checks. TypeScript/Vite build passed, with all 23 opaque payloads byte-exact against the product index. Eight legacy-harness and 12 comparator synthetic tests passed separately. The product attribution ledger matches all 1,358 development recording credits.

The final fresh Chrome session's [browser evidence](qa/2026-10-18-v3-browser.json) records:

| Mounted-app check | Observed result |
| --- | --- |
| Live input and observation scope | Generated 63 Hz/48 kHz virtual microphone, live meter, full 15-second capture; 720,000 samples and 174 complete frames retained in the ordinary report. |
| Consent and real model | Zero AI requests before Explore; the real encoder/head produced **No sound family suggested** for this arbitrary synthetic fixture. This is a valid software abstention, not a recognition-accuracy test. |
| Startup gate | The panel accepted only worker provenance carrying successful self-test and exact model/runtime/preprocessing fingerprints. The transient self-test text was **not observed**; no UI-duration claim is made. |
| Lifetime and stale work | Maximum one encoder worker; clear/unload, actual-startup retry/cancel and navigation passed. Releasing the held old graph after navigation produced no stale hint. |
| Integrity failure | Same-size corrupt head and graph both failed closed; ordinary spectrum/report remained accessible. |
| Report export | Native TXT: **7,718 bytes, 117 lines**, no raw bin rows or AI output. Print CSS retained the unchanged actual SVG path (**6,579 characters**) and full 15-second spectrum metadata in the generated PDF. |
| Layout and network | Six routes at 320/390/1280 px and visual scale 1 had no horizontal overflow; footer bottoms stayed within 0.5 CSS px of the viewport bottom. Final session: **99 same-origin GETs, zero body bytes, zero page/console errors**. |

An earlier session stayed open across preview rebuilds and requested an obsolete Map chunk, producing a 404. Its ignored QA logs remain preserved. The reported final checks used a fresh isolated session against a fixed build and recorded no errors. Current page screenshots are linked from the repository README. These are generated-input/software checks; physical microphone accuracy and field reliability remain unvalidated. **Public V3 deployment verification is still pending** in [DEPLOYMENT.md](DEPLOYMENT.md).

## Immutable evidence

The [paired-comparison archive](../ml/runs/2026-10-18-website-relative-comparison/) preserves saved outcomes, exact input/software provenance and the completion index. Raw comparison artifacts have these identities:

| Artifact | SHA256 |
| --- | --- |
| Comparison completion | `a00a2e2adfff98b7021076c62ac1a2cc82e02a635d8c24bdf2d42cdc2c1d6375` |
| Comparison results | `c0958e60c0bbf70dbbb1b0d3737b8a3f6a57f5fcad6b57a11dca1eacfea41e23` |
| Comparison input evidence | `c8b5c4e4dc36ea1b642fba18ac9cb32b85688353231acabc598fd293d6917e4a` |
| Final source manifest | `197e24e42c36de1368f9cd25424c98a4f8935af7c60429c4521d8d80feaa9520` |
| Frozen head | `1e373cd18cbd706812dac10b19a320b73a568e6ee40e3f34236e03ae6122f491` |
| Frozen parameters/rules | `6f1119be47ffeea7fcf8b3e1b4212af7d387cdef14667c3c871f46e9c98c8a92` |

The completion index binds raw artifacts by size and SHA256; preserving it does not authorize re-querying the cohort, retuning the model or claiming automatic promotion. The comparator deliberately retains `promotionAllowed:false` and requires independent product checks before integration.
