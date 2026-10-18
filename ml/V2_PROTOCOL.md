# Second experiment: fixed before fresh test evaluation

The first run's test set has been inspected. It is now a historical diagnostic set, not an untouched final test for changes motivated by its errors. The user requested continued improvement on October 18, 2026.

## Changes to test

- Expand the CC0/CC BY development audio pool, particularly speech and wind, while retaining the five broad labels and exact first-five-second preprocessing. Fan and buzz have scarce eligible development recordings; report their actual counts rather than promising growth.
- Compare balanced regularized linear heads with a small, fixed RBF-SVM grid using uploader-group cross-validation **inside training only**. Prefer simpler candidates on tied macro F1. The CLAP encoder remains frozen for this experiment.
- Replace one centroid per class with the mean cosine similarity to up to three nearest training examples of the predicted class. This represents varied speech better than a single mean embedding.
- Select margin/affinity rejection thresholds separately per predicted class using known/unknown validation only. Require at least 20% correctly accepted true-class validation coverage and 80% precision among accepted known predictions. Each class may accept at most 2% of the entire unknown-validation set, with the combined empirical budget capped at 10%. An ineligible class must abstain and be reported as a failure.

## Data separation

Preserve first-run known-validation uploader assignments; those calibration examples are reused development material, not fresh evidence. New development uploaders are assigned deterministically to training or validation. Keep uploader, clip ID, original/prepared audio hash and PCM hash disjoint across current splits.

The new FSD final test uses only official evaluation recordings from uploaders absent from **every first-run split**, and excludes every first-run ID and audio hash. No previous known/unknown test uploader may enter the new test. Freeze the candidate and thresholds before examining new final-test predictions. Scarce classes may have small support; show counts, uncertainty, per-class coverage, and accepted errors prominently. Fail transparently if any class has fewer than three eligible fresh examples; do not substitute old test recordings.

Metadata review found that the first run exhausted eligible five-second FSD fan test audio. Add separately attributed [MIMII public1.0 recordings](https://zenodo.org/records/3384388) under their CC BY-SA4.0 terms: single 0 dB archive, first microphone channel, five-second crop, normal and anomalous recordings both labeled only as mechanical fan. Group fan IDs00/02 for training,04 for validation,06 for test; include other MIMII machine types as unknown validation/test controls so recording-domain style alone cannot establish fan identity. These are derived experimental splits, not official FSD evaluation data. Disclose the small number of machine groups, shared recording/background conditions, corpus/domain confounding, license distinction, and unresolved downstream model-distribution requirements. No raw MIMII audio is committed or published.

Fixed caps: FSD up to 500 training/80 validation/40 fresh test clips per class and 160 unknowns per split. These FSD caps exclude the supplemental source. MIMII adds at most40 fan clips per training unit (80 total),30 validation,40 test, and 10 controls per non-fan machine type per unknown split (30 total per split). Candidate order and quality-based exclusions are fixed without model predictions.

Use a broader unknown-validation pool. FSD unknown final-test categories remain separate from FSD unknown-validation categories; no target-class tags may occur in either unknown split. MIMII unknown controls deliberately share machine types across validation/test while holding out product-model IDs, so those controls test a new machine group rather than an unseen unknown category. Cap downloads before inspecting model scores; record all exclusions and source licenses.

## Reporting and deployment

Record the exact source/model/preprocessing/manifests, CV candidate scores, selected model, class-specific gate eligibility, full ungated/gated metrics, and unknown false accepts. This comparison changes the dataset, so a new score is not directly comparable with the first run's score. An old frozen system can be evaluated on the same fresh recordings only after all current candidate choices are fixed.

The new model stays experimental. Python-only SVM artifacts must be labeled as such; no unsupported browser-portability claim. Field accuracy, source identity, and calibrated confidence are not established by public sound tags. Further tuning prompted by the new test requires another untouched test set.
