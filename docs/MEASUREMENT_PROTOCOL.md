# Measurement Protocol — PROPOSED guided workflow

**Status: proposed and unimplemented.** This document describes possible UI guidance and descriptive comparisons; it does not report shipped features, authorize DSP changes, or establish a county measurement procedure.

Proposal context: Nico, for team lead Vihaan, 10/18/2026 ~2:00 PM, with a reported 2:55 PM scope discussion. The inspiration is [FIELD_FINDINGS.md](FIELD_FINDINGS.md): 29 exploratory legacy/unverified entries with observer clock notes 12:28–12:48. [FIELD_REVIEW.md](FIELD_REVIEW.md) documents missing audio, sample/frame metadata and independent source checks. These observations generate hypotheses; they do not validate a distance rule, masking detector, recording duration or tonal/source verdict.

The current app accepts live microphone observations with 5/15/30 s selections. DSP analyzes the selected capture; optional AI hints use its first 5 s. This proposal preserves those semantics and the separate low-frequency and sustained-peak indicators. Software checks are not independent field validation.

## P0 — Proposed capture guidance

Possible presentation: dismissible tips before first capture, also reachable through a help control. Neither presentation is implemented by this document.

1. **Describe the setting.** "Record where you hear the sound. Note other sounds and airflow near the microphone. A quiet-sounding spot does not establish a valid measurement or rule out low-frequency sound."
2. **Note placement.** "Keep a safe distance from machinery and air discharges. If you change position, record that change. Distance, obstacles and room reflections can change the captured spectrum; moving farther away does not guarantee a clearer tone."
3. **Hold steady.** "Keep the device steady during the capture and note any movement."
4. **Repeat if useful.** "Optional repeat observations can show how the recorded values vary. Keep the same device, placement, duration and settings where practical, and retain each result. Repeats do not confirm stability, a tone, source identity or legal compliance."

## P1 — Proposed descriptive comparisons and notes

1. **Optional median of three gaps:** for three user-selected captures under comparable reported conditions, display "median C−A of these 3 captures" as a descriptive comparison alongside all three individual values. Retain each capture's actual duration, sample/frame counts, quality flags, settings and observer context. Do not discard a value because it differs from the others. Unavailable or inconclusive gaps are not zero and cannot enter the summary. Do not replace any capture's separate sustained-peak result, generate a session verdict, or promise a stable reading. This summary is not a county procedure, pooled sound level or calibration.
2. **Background observations:** offer an optional note about other sounds the observer noticed. Do not infer a background floor, broadband contamination, auditory masking or reduced tonal sensitivity from a session-relative A level and C−A threshold. A-weighted digital level includes all captured sound; source level, gain, processing and placement can change it. A value in a session's undefined "top band" is insufficient evidence for such a quality label.
3. **Reported setting:** an optional field could describe the observer's position relative to a suspected sound: *same space / wall between / floor between / unsure*. Default to *unsure*, preserve it as an observer description, and do not label it a verified source or transmission path. A larger gap does not identify either.
4. **Other sounds versus interrupted recording:** optional copy: "If you noticed an unrelated sound during capture, describe it and consider another observation. Retain the original result." Existing interruption checks concern missing or interrupted audio acquisition, such as a hidden tab, suspended audio context or disconnected microphone. They do not automatically identify vehicles, doors or other acoustic events. Observer notes do not bypass existing capture-quality gates.

## P2 — Proposed Learn copy

**Placement changes what is captured:** "Sound at the microphone depends on position, obstacles, room reflections and other sounds. Record changes in those conditions. A larger C−A difference can suggest more low-frequency contribution in the captured spectrum; it does not by itself establish a tone, source or transmission path."

**Two frequency weightings:** "A-weighting reduces low-frequency contributions more than C-weighting. TonalWatch applies both to the same digital samples. Its weighted digital levels are relative to RMS 1, not calibrated sound-pressure levels or a direct measure of perceived loudness or discomfort."

The legacy 15 m observation also included a floor barrier. Its distance, background, source operation and microphone processing were not isolated. Do not present it as proof that broadband sound fades faster than a low tone or that moving away reveals a tone. Do not use a piano-strike-force analogy to explain A-weighting.

## Scope and instrument preservation

- The reported team timing/freeze discussion is proposal context, not authority to stop the user's direct requests. In particular, the user's ongoing AI-reliability work continues independently of this UI proposal.
- The current app already has a local "Compare with previous" feature. It compares two captured-spectrum gaps; it does not calibrate devices, link phones or pool corrected readings. This proposal does not remove it. Cross-device calibration remains outside this proposed workflow.
- Preserve digital-level labels. Do not add absolute SPL claims, calibration offsets or device-equivalence claims.
- Preserve the existing DSP method and the standalone field instrument under [FIELD_INSTRUMENT_LAW.md](FIELD_INSTRUMENT_LAW.md). This proposal requests neither lab removal/replacement nor instrument changes. Any separately authorized bug fix or feature remains separate work.

## Proposed acceptance checks — not completion claims

- Review any future implementation against current user scope before scheduling it; this document alone does not make the proposed UI shipped.
- Keep existing DSP/capture semantics and tests passing. Verify any implemented comparison preserves every selected observation and handles unavailable values honestly.
- If implemented, make guidance dismissible and reachable again, label summaries as descriptive, and retain observer attribution for setting/interference notes.
- Keep county context separate from prototype indicators; make no compliance, confirmed-tonality, masking or source/path claim.

## Sources and unresolved gaps

- [Prince William County steady-tonal-noise guidance](https://pwcaws.pwcva.gov/department/public-works/steady-tonal-noise) is readable and specifies Type 1 instruments capable of A/C and one-third-octave measurements for inspections. It does not substantiate this proposal's median-of-three digital-gap procedure. The linked full §14-7 text could not be independently retrieved; detailed county sampling requirements remain unverified here.
- [OSHA Technical Manual, Noise](https://www.osha.gov/otm/section-3-health-hazards/chapter-5) explains frequency weightings and distinguishes free-field distance behavior from reflected indoor sound. It supports general explanation, not certification of TonalWatch or county compliance.
- [FIELD_REVIEW.md](FIELD_REVIEW.md) and [FIELD_FINDINGS.md](FIELD_FINDINGS.md) preserve the exploratory evidence and its limitations. The unavailable waveform and acquisition metadata prevent retrospective validation of the legacy entries.
