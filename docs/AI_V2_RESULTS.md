# Second sound-hint experiment: recorded results

**Research only; no live-model promotion.** V2 improved aggregate results on this saved test cohort, but retained major coverage gaps and accepted unknown sounds. In particular, it correctly accepted **none of the 20 traffic clips**. The deployed app's eight-description zero-shot hints were not evaluated in this comparison.

This review reads the completed results and checks their integrity and arithmetic. It performs no refitting, threshold changes or new predictions. The [archived run](../ml/runs/2026-10-18-v2/) contains the raw evidence; the [protocol](../ml/V2_PROTOCOL.md) describes choices made before fresh-test inspection. Further changes motivated by these results need another untouched test set.

## What was compared

The frozen quantized CLAP encoder stayed unchanged. V2 selected a balanced **linear classifier, C=10**, from 13 fixed linear/RBF candidates using five-fold training-group CV (selected mean macro F1 **0.909955**). Class-specific decision-margin/top-three-affinity rejection rules used known/unknown validation only. The immutable v1 linear classifier and its original centroid/margin gate were subsequently evaluated on **the identical new recordings, ordered embeddings and labels**, without retraining or recalibration.

All five classes met the empirical validation constraints. This is a development-set result: known validation accepted 72/135 correctly, and unknown validation falsely accepted 15/190 (three per predicted class). It does not guarantee those constraints on new data.

## Cohort and separation

The manifest contains **1,226 five-second clips**:

| Split | FSD50K | MIMII | IVBEE | Total |
| --- | ---: | ---: | ---: | ---: |
| Train | 474 | 80 | 0 | 554 |
| Known validation | 105 | 30 | 0 | 135 |
| Known test | 94 | 40 | 23 | 157 |
| Unknown validation | 160 | 30 | 0 | 190 |
| Unknown test | 160 | 30 | 0 | 190 |

Across every current split pair, uploader/machine/specimen groups, clip IDs and original/prepared/PCM hashes are disjoint. All **347 held-out known/unknown clips** exclude every group, ID and audio fingerprint from **all 725 first-run records** (581 groups). FSD test recordings originate in its official evaluation partition. Reused development material is not fresh validation evidence; the embedding log records 383 prior rows reused and 843 newly extracted rows.

Known-test composition is class-dependent: **23 IVBEE honeybee buzz clips**, **40 MIMII fan clips from held-out ID06**, and **40 speech / 20 traffic / 34 wind FSD50K clips**. The bee clips represent six specimens in **one laboratory/hardware collection**. Fan training uses IDs00/02, validation ID04 and test ID06; shared recording/background conditions remain. Dataset, device and class are therefore partly confounded.

Unknown test comprises 160 FSD clips tagged with Music, Bird, Bell, Door, Computer keyboard, Glass or Tools, plus ten each of MIMII pump/slider/valve ID06. FSD unknown-validation categories are separate (Water, Rain, Footsteps, Dog, Engine, Singing); MIMII unknown types recur across validation/test with different IDs. These controls do not represent every real-world unknown.

## Same-cohort comparison

“Coverage” means the fraction of known clips for which a hint was accepted. “Accepted-known accuracy” excludes unknown clips and rejected known clips. Intervals below are saved **clip-level Wilson 95%** intervals.

| Measure | Frozen v1 | V2 |
| --- | ---: | ---: |
| Ungated known accuracy | 132/157 = 84.08% | 135/157 = 85.99% |
| Ungated known macro F1 | 0.828139 | 0.849628 |
| Known coverage | 65/157 = 41.4% (34.0–49.2%) | 72/157 = 45.9% (38.3–53.7%) |
| Accepted-known accuracy | 61/65 = 93.8% (85.2–97.6%) | 71/72 = 98.6% (92.5–99.8%) |
| Correct accepted / all known | 61/157 = 38.9% | 71/157 = 45.2% |
| Rejected known clips | 92/157 | 85/157 |
| Unknown false accepts | 12/190 = 6.3% (3.6–10.7%) | 11/190 = 5.8% (3.3–10.1%) |

The unknown-error change is **one clip**. No significance or field-improvement claim follows from these descriptive differences. On this particular mixture of known and unknown test clips, accepted outputs were correct for 61/77 (79.2%) under v1 and 71/83 (85.5%) under v2. Those mixture-dependent figures are not calibrated source confidence.

| True class | Test support | Ungated correct v1 → v2 | Correct accepted v1 → v2 |
| --- | ---: | ---: | ---: |
| Buzz | 23 | 23 → 23 | 21 → 23 |
| Mechanical fan | 40 | 36 → 40 | 25 → 28 |
| Speech | 40 | 34 → 33 | 2 → 13 |
| Traffic | 20 | 12 → 15 | 6 → **0** |
| Wind | 34 | 27 → 24 | 7 → 7 |

V2 rejected 27/40 speech clips and correctly accepted only 7/34 wind clips. It accepted one true traffic clip as wind and rejected the other 19; **no accepted traffic prediction was correct**. Passing validation gates did not prevent that failure.

The saved V2 ungated confusion matrix contains 22 errors: speech→traffic 3, speech→wind 4, traffic→wind 5, wind→fan 1, wind→speech 1 and wind→traffic 8. Its one accepted known error is traffic→wind. V1 had four accepted known errors: fan→wind, speech→wind, traffic→wind and wind→traffic. The saved confusion matrices, class supports, precision/recall and accepted-count arithmetic were checked for consistency.

V2's 11 accepted unknown clips were labeled **buzz 5, fan 4, speech 0, traffic 1, wind 1**. Buzz/fan exceed the validation convention's 2%-of-all-unknowns per-class budget on test (5/190 and 4/190). The saved output does not identify their true unknown-category membership, so type-specific false-accept rates cannot be recovered from these summaries without additional inference. None was run for this review.

## Audit and practical limits

All **21 indexed bundle payloads**, their sizes/SHA256 values and ZIP bytes verified. Completion environment, fit contract, model/evaluation/pip-freeze hashes, archived source hashes, historical-model/manifest identity and comparison bindings agree. The ten archived scientific/protocol source files also match recorded commit `0da8c60dee54ac961e395ec646cf657563268fdf`. Completion was recorded at **2026-10-18 17:08:03 UTC**, with Python3.13.16, sklearn1.7.2, NumPy2.2.6 and the pinned encoder revision.

Audit anchors:

```text
manifest-v2.json SHA256:       8a22e336d2eb1806ab228b381badb46156e67f198013d77b31a0565fbb3f0ab8
evaluation_v2.json SHA256:     9fbd28cacb911fb57bace9835b8402894b53428595d2e7166d56c9f4bf42df39
frozen_v1_comparison SHA256:   6c0e1f1ffb0e6655b9e66e8ca808a8e52256e710b40ebd8be13fc37438c208dd
fit-audit-bundle.zip SHA256:   909e8a3aab92f21242079532afb9f5faf313d8eda5d74c53f32719c97c648d9f
```

Raw audio and the standalone embedding cache are intentionally outside the results bundle. This review verifies their recorded fingerprint/contract bindings, not an independent audio decode or encoder rerun. The manifest consistently records first-channel/first-five-second 48 kHz PCM, no gain normalization, finite samples, RMS≥1e−5 and peak<0.999. Quality exclusions and clip-level labels change the tested population; the labeled event may be absent from a five-second crop.

A subsequent [validation-only browser check](../ml/runs/2026-10-18-v2-browser-parity/README.md) preserved these fit results and thresholds. All 325 validation-vector labels matched, but three roundoff-boundary accept/reject decisions differed. Twenty fixed prepared WAVs matched PCM, labels and gates, while encoder outputs differed across platforms/backends. Agreement also included two falsely accepted unknown sounds. Strict parity failed and no model was promoted; those checks are separate from fresh-test accuracy.

The Wilson intervals omit threshold-selection uncertainty, repeated-source dependence, dataset/device shift and possible encoder-pretraining overlap. For example, 23/23 accepted bee clips has a nominal 85.7–100% interval, but the one-collection dependence remains. These results establish neither electrical-hum identification nor a building/appliance source, harm, legal compliance or field accuracy. No live app promotion occurred. Full audio/browser parity, independent field data and downstream license review remain required; MIMII's BY-SA source terms differ from the FSD/IVBEE terms.

Primary sources and attribution:

- [FSD50K](https://zenodo.org/records/4060432), Fonseca et al.; this subset uses separately attributed CC0/CC-BY clips. Clip-level licenses and uploader/source URLs remain in the manifest.
- [MIMII public1.0](https://zenodo.org/records/3384388), Purohit et al.; CC BY-SA4.0. Machine-ID splits here are derived experimental partitions, not official FSD splits.
- [IVBEE-1.0](https://zenodo.org/records/20077113), Piotr Książek; CC BY4.0. The complete bee collection is test-only, with its published/decoded format discrepancy recorded.
