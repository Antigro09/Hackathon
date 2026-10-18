# Review of the first exploratory field log

This local review checks the arithmetic and provenance of [FIELDTEST1.csv](../FIELDTEST1.csv). It preserves the raw file and observer notes; it does not remeasure audio or replace the team's field instrument. See [FIELD_FINDINGS.md](FIELD_FINDINGS.md) for the corresponding exploratory narrative.

## File identity and provenance

- File: `FIELDTEST1.csv`
- SHA256: `6562caec0de64f3790c669432666c32c47fe1fcc2176a5d8a2a8b04252625473`
- 29 data rows, all explicitly `legacy-unverified`.
- Every field except `provenance` and `legacy_original_json` is blank. In particular, algorithm version, capture ID, recording/analysis timestamps, requested/actual duration, sample rate/count, frame count, FFT/hop, channel policy, quality flags, processing settings, independent peak fields and line-frequency candidates are unavailable.
- The preserved legacy JSON contains clock notes `12:28`–`12:48`, duration strings `5`/`15`/`30`, A/C/gap summaries, experiment/location/distance/hearing notes and archived verdict labels. These are reported legacy values, not authenticated timestamps or verified sample-counted recordings. The duration strings occur 4/22/3 times respectively.
- Row 29's preserved hearing field is the literal em dash `—` (`U+2014`); no additional hearing description is inferred or substituted.

Blank quality fields do not mean a recording passed quality checks. Without raw PCM, sample/frame metadata or an identified historical algorithm, this export cannot establish full-window averaging, actual analyzed durations, numerical normalization, clipping/silence status or sustained-peak behavior. The current repaired app/lab method cannot be retroactively assigned to these entries.

## Arithmetic checks

All counts and statistics below use the preserved legacy JSON values. Standard deviations are **sample SD** (`n−1`), with all three values retained in each E1/E2 group. The reported one-decimal gaps are consistent with `C−A` within rounding (at most 0.1 dB). Recorded gaps span **0.6–21.1 dB**.

| Archived verdict | Count |
| --- | ---: |
| `SIGNATURE` | 3 |
| `borderline` | 6 |
| `not-indicated` | 20 |
| Total | 29 |

These labels are not verified tone/source classifications, confirmed positives/negatives, or AI predictions.

| E1 reported duration | Legacy row numbers | Gap values (dB) | Sample SD (dB) |
| --- | --- | --- | ---: |
| 5 s | 1, 4, 5 | 6.9, 6.1, 5.4 | 0.751 |
| 15 s | 2, 6, 7 | 6.4, 10.3, 5.8 | 2.443 |
| 30 s | 3, 8, 9 | 5.6, 5.1, 5.6 | 0.289 |

The E1 table's rounded SD/range values agree with the CSV. The 15 s group is more variable than the 5 s group in this set. Three observations per duration, without verified analyzed windows or controlled source/background conditions, cannot establish a general duration rule, an evidence-grade minimum or compliance with a county procedure.

| E2 observer-reported distance | Legacy row numbers | Gap values (dB) | Mean gap (dB) | Sample SD (dB) | Mean recorded A |
| --- | --- | --- | ---: | ---: | ---: |
| 2 m | 10–12 | 6.4, 6.5, 5.5 | 6.133 | 0.551 | −73.133 |
| 8 m | 13–15 | 9.3, 6.4, 10.5 | 8.733 | 2.108 | −73.533 |
| 15 m, floor noted | 16–18 | 21.1, 20.0, 19.9 | 20.333 | 0.666 | −80.100 |

The rounded E2 means/SDs agree with the findings table. Changing floor/position, background sound, source operation and processing were not isolated from estimated distance. The A summaries are weighted digital values with unverified historical normalization, not calibrated raw sound-pressure levels.

The exact hearing notes containing `CAN HEAR RUMBLING` occur in **rows 17 and 18**:

- Row 17: `AC underhead (under the floor) - CAN HEAR RUMBLING`, gap **20.0 dB**.
- Row 18: `AC underhead (under the floor) - CAN HEAR RUMBLING`, gap **19.9 dB**.

They are two of the three highest gaps. The highest gap is row 16 (**21.1 dB**), whose note is `AC underhead (under the floor)`. These are observer descriptions; the wording is retained verbatim in the CSV.

## What this evidence supports

The file records an exploratory workflow, variations in legacy numeric summaries and observer-reported audible conditions. It provides hypotheses for repeat measurements with the repaired instrument, retained PCM, explicit quality checks and controlled conditions.

A C−A difference alone cannot prove a sustained tone, identify equipment, establish a transmission path, measure auditory masking or validate an explanation for data-center complaints. An independent spectrum/peak check and known source conditions are needed to test those hypotheses. A constant gain offset can cancel in C−A while frequency response, processing and contamination remain material.

There is no raw audio, independent ground truth, AI output or source verification in this CSV. It cannot measure AI accuracy, detector sensitivity/specificity, calibrated confidence, acoustic attenuation or legal compliance. The reported one-building/device/afternoon setting and repeated measurements also limit independence and generalization. Small repeat counts do not turn the sample SDs into a law about duration, distance or masking.

The raw CSV, observer statements, standalone lab and field-instrument ownership remain intact. This review corrects derived claims and counts while preserving the observations needed for the next test.
