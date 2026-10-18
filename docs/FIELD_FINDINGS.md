# Exploratory Field Findings — TonalWatch (804 Hacks, 2026-10-18)

**Status:** These are exploratory **legacy/unverified observations**, not completed instrument validation or confirmed tonal/source findings. The raw CSV is preserved. [FIELD_REVIEW.md](FIELD_REVIEW.md) records its SHA256, arithmetic checks, missing metadata and interpretation limits. `SIGNATURE` and `borderline` below are archived software labels.

**Reported protocol:** mostly stationary, 15 s selections (E1: 5/15/30 s ladder), three repeats per E1/E2 condition; E4 includes walking. Gap = C−A, intended threshold 15 dB. The export does not establish actual analyzed durations.
**Instrument:** `field_lab.html` standalone; CSV export; provenance = "legacy-unverified" (honest label).
**Raw data:** `FIELDTEST1.csv` (29 entries, observer clock notes 12:28–12:48; reported same-day venue observations).

## E2 — Distance observations (headline hypothesis)

Observer-identified stairwell AC unit, three estimated distances, three entries each. Source identity and unchanged operating conditions were not independently established:

| Distance | Gap (C−A) mean | sd   | A level mean |
|----------|----------------|------|--------------|
| 2 m      | 6.1 dB         | 0.55 | −73.1 dB     |
| 8 m      | 8.7 dB         | 2.11 | −73.5 dB     |
| **15 m + floor between** | **20.3 dB** | **0.67** | −80.1 dB |

**Three consecutive legacy SIGNATURE labels (21.1 / 20.0 / 19.9 dB, sd 0.67) at the observer-reported 15 m position with a floor between.** These labels do not confirm a tone or its transmission path.

- The recorded A-weighted digital summary fell ~7 dB (−73 → −80). This is not a calibrated raw sound-pressure level or a verified acoustic attenuation measurement.
- The recorded GAP ROSE from 6 to 20 dB. A larger C−A difference is consistent with a change in captured low-frequency contribution. It does not establish a sustained narrowband tone. Distance, floor/position, source activity, background sound and microphone processing were not isolated.
- Observer hypothesis to retest: changing broadband background content could change C−A while the sound remains audible. The proposed analogy to data-center complaints and county measurements was not tested by these entries.

## E1 — Duration observations

Same spot (stairwell @ 2 m), three captures per duration:

| Duration | Gap sd | Range    |
|----------|--------|----------|
| 5 s      | 0.75   | 5.4–6.9  |
| 15 s     | 2.44   | 5.8–10.3 |
| 30 s     | **0.29** | 5.1–5.6 |

**The three entries labeled 30 s have the lowest observed sd (0.29). The 15 s group is more variable than the 5 s group here (2.44 versus 0.75).** The 15 s value 10.3 carries a legacy borderline label and remains included. Three repeats per duration, changing conditions and missing sample/frame metadata cannot establish a duration law. A 15/30 s follow-up protocol is a proposal to test with verified full-window PCM analysis; these entries do not establish evidence-grade captures or compliance with a county sampling procedure.

## E3 — Masking hypothesis

Kitchen-corner spot, freezer audible to ears:

- Quiet corner (observer description): gap 9.0 dB (legacy not-indicated)
- With hall noise / activity: **gap 0.6 dB, 3.2 dB**

**The recorded gap changed from 9 to ~1–3 dB during observer-described hall noise/activity.** The observer continued to note "freezer in kitchen audible" in all three entries. Changing broadband content is a hypothesis consistent with the pattern; these summaries cannot establish auditory masking, constant source output, or an explanation for nighttime data-center complaints.

## E5 — Signature Hunt (elevator, refrigerator)

- Observer-described elevator fan @ 15 m: **12.2 dB (legacy borderline)** — highest non-AC legacy gap in this set
- Elevator @ 1 m: 5.7–9.7 dB. The observer's broadband-content explanation remains a hypothesis; these positions do not isolate distance effects.
- Observer-described refrigerator @ 1 m: 10.2 dB legacy borderline (duration selection labeled 5 s — see E1's duration observations)

## Cross-cutting observations

- All 29 entries: recorded gap range 0.6–21.1 dB. This shows variation in the archived summaries; sensitivity, saturation and missed sounds were not independently tested.
- Archived verdict distribution: **3 SIGNATURE, 6 borderline, 20 not-indicated**. These are descriptive counts, not confirmed positives/negatives or an accuracy estimate. C−A alone does not establish that a detector fires only on tonal sources.
- Observer hearing notes: "CAN HEAR RUMBLING" occurs in rows 17/18 (20.0/19.9 dB), two of the three highest gaps. The highest gap, row 16 (21.1 dB), has a different note. The coexistence of an audible report and a large gap does not independently establish tonality or source identity.

## Honest-claims labeling (per plan §4.3)

- Recorded A/C values are uncalibrated digital summaries. The legacy export does not establish estimator normalization, acoustic response, browser processing or a sound-pressure reference.
- A constant scalar gain can cancel in C−A; frequency response, processing and contamination still affect it. Device fairness and cross-condition reliability were not established here.
- HVAC, elevator and refrigeration names are observer interpretations. Similarity to data-center cooling equipment and a 50–250 Hz source band remain pitch hypotheses; no retained waveform or spectrum establishes that band or equipment identity for these entries.
- Sample: 29 entries, reportedly one building, one mic chain, one afternoon. Repeats are not independent buildings/devices, and the small sample supports exploratory follow-up.

## What this means for the pitch (one line each)

1. "We collected 29 exploratory legacy observations across five experiment labels; the raw notes are retained and the measurement method needs verified follow-up."
2. "At the observer-reported stairwell positions, recorded A values fell while C−A rose. We want to retest the background-content explanation with retained audio and controlled conditions."
3. "During observer-described activity, recorded gaps changed from 9.0 to 0.6/3.2 dB. That is a hypothesis-generating observation, not a demonstrated cause of complaints."
4. "The archive contains 20 not-indicated, 6 borderline and 3 SIGNATURE labels. Independent tone/source checks are needed before claiming detector accuracy."
