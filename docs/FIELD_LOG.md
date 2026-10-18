# TonalWatch — unverified field notes

**Status: historical, hand-entered observations; not validated measurement data.**
The supplied notes below are preserved verbatim. No original audio, immutable
analysis packet, device settings, effective sample rate, instrument/version
identifier, exact sample count, or quality flags are attached to these rows.
Their units, input order, provenance, timing and calculation method therefore
remain unverified. The venue/date and source-like spot labels are the writer’s
notes, not independently established facts.

## How to interpret these notes

- The column heading says “15s gap,” while the mess-hall and stairwell entries
  explicitly mention five seconds. Preserve that inconsistency; do not infer a
  15-second analysis from a heading or an elapsed-time selector.
- Slash-separated values appear to refer to device pairs, but the order,
  unrounded values and inclusion/exclusion rules are not documented. The stated
  mean **Δ 0.46 dB is unverified and its derivation is not reproducible from the
  displayed notes**. It has not been replaced with another statistic.
- “Device offset” is the original writer’s wording. An observed difference in
  C−A is **not a calibration offset**, a correction factor or evidence that
  devices are interchangeable. Sound, placement, microphone response and
  processing can change it. Do not pool or adjust readings using that number.
- A C−A gap at or above the prototype’s 15 dB threshold can suggest
  **low-frequency contribution** in the captured digital spectrum. It does not
  establish a tonal signature, identify equipment or determine compliance.
  A sustained narrowband peak is a separate experimental check.
- Spot names and what the writer heard are descriptive/unverified context. They
  do not confirm an AC unit, fan, transformer, train or other sound source.
- “T3 outlier” and the requested confirmations are preserved notes, not validated
  exclusion rules or a professional measurement protocol. Do not silently drop
  an observation to support a desired interpretation.

The incoming standalone `field_lab.html` instrument has been retired. Its old
implementation used a smoothed final analyser spectrum instead of a validated
full-recording PCM analysis, had incomplete quality/resource handling, and
conflated the gap with a tonal verdict. We cannot establish from these notes
whether that instrument or another version produced each listed number.
[The replacement lab guide](../field_lab.html) links to the main app rather than
reimplementing capture, DSP or export.

## Original supplied notes — verbatim, unverified

The following block preserves the entire incoming field-log content, including
its unsupported terminology and empty fields, for traceability. It is not the
current protocol. Canonical UTF-8/LF SHA-256:
`926ec7e57ee66c3dc2b318268ab5c7d4377aa98be6faae1cb4f42f070c32760f`.

```text
# TonalWatch — Field Test Log (804 Hacks venue, 10/18)

Protocol: stationary · 3 captures/spot · 15 s · log everything · gap ≥ 15 → three confirmations

| # | Time | Spot | In/Out | Dist. to src | What I hear | 15s gap (3 caps) | Notes |
|---|------|------|--------|--------------|-------------|------------------|-------|
| 1 | | Mess hall | in | — | | | done: 5.9/5.8, 5.9/5.4, 7.6/6.4 (5s, T3 outlier logged) |
| 2 | | Outside | out | — | | | done: 13.2/14.6, 12.3/12.8, 13.0/13.6 |
| 3 | | Quiet corner | in | — | | | done: 7.4/5.2, 7.9/5.3, 7.1/5.9 |
| 4 | | Stairwell AC | in | | | | done 5s: 9.6/9.6, 9.2/9.5, 7.9/7.4 — E2 distances next |
| 5 | | | | | | | |
| 6 | | | | | | | |

Device pairs: T=Tate phone, V=Vihaan laptop (+ V's phone if used). Device offset (buddy check, mess hall): mean Δ 0.46 dB.

## Findings (fill as you go)
- E1 duration:
- E2 distance:
- E3 masking:
- E4 walk vs stationary:
- E5 signature hunt (fan/transformer tone found? gap?):
```

## New observations

Use [TonalWatch Observation](https://tonalwatch.vercel.app/#/measure) or a local
production preview. Save the app’s observation packet and record its actual
input kind, analyzed duration, effective sample rate, quality flags and method
version. Retain unavailable values as unavailable and synthetic inputs as
synthetic. Enter suspected sources only as unverified user notes. Recordings
remain in the browser; this file is not a shared collection backend.

| Observation packet filename / analysis ID | Input kind | Actual analyzed duration / effective rate | Recording quality | User-observed location / conditions | Notes |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

Uncalibrated screening only. No source identification or legal-compliance determination.
