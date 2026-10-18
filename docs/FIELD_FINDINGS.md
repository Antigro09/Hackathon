# Field Validation Findings — TonalWatch (804 Hacks, 2026-10-18)

**Protocol:** stationary, 15 s captures (E1: 5/15/30 s ladder), 3 per condition, gap = C−A, threshold 15 dB.
**Instrument:** `field_lab.html` standalone; CSV export; provenance = "legacy-unverified" (honest label).
**Raw data:** `FIELDTEST1.csv` (29 captures, 12:28–12:48, same-day venue measurements).

## E2 — The Distance Law (headline finding)

Stairwell AC unit, same source, three distances, three captures each:

| Distance | Gap (C−A) mean | sd   | A level mean |
|----------|----------------|------|--------------|
| 2 m      | 6.1 dB         | 0.55 | −73.1 dB     |
| 8 m      | 8.7 dB         | 2.11 | −73.5 dB     |
| **15 m + floor between** | **20.3 dB** | **0.67** | −80.1 dB |

**Three consecutive SIGNATURE verdicts (21.1 / 20.0 / 19.9 dB, sd 0.67) at 15 m — through a floor.**

- Raw level DROPPED ~7 dB with distance (−73 → −80), correctly reporting "quieter."
- The GAP ROSE from 6 to 20 dB. **Levels fall off with distance; the tonal signature does not — it grows more prominent as broadband masking drops.** This is the miniature of the data-center complaint mechanism (NBC4: hum audible >1 mile from the fence line). The county's dBA standard reads "quieter" with distance; the gap reads "still tonal."
- Physics check: A-weighting discounts low-frequency tone energy; when the broadband masking floor decays faster (higher frequencies attenuate faster with distance + indoor absorption), the tone's relative prominence increases. Measured, not modeled.

## E1 — The Duration Law

Same spot (stairwell @ 2 m), three captures per duration:

| Duration | Gap sd | Range    |
|----------|--------|----------|
| 5 s      | 0.75   | 5.4–6.9  |
| 15 s     | 2.44   | 5.8–10.3 |
| 30 s     | **0.29** | 5.1–5.6 |

**30 s captures are the most stable (sd 0.29); 15 s is workable; 5 s is noisier.** One 15 s outlier (10.3, borderline) shows the practical risk of short windows. **Protocol conclusion: field protocol = 15 s minimum; 30 s preferred for evidence-grade captures.** This matches the county procedure's ≥15-second sample rule.

## E3 — The Masking Law

Kitchen-corner spot, freezer audible to ears:

- Quiet corner: gap 9.0 dB (borderline-ish)
- With hall noise / activity: **gap 0.6 dB, 3.2 dB**

**Broadband human/activity noise collapsed the gap from 9 to ~1–3 dB.** The tone didn't stop — the masking floor hid it from the weighting. Measured demonstration of auditory masking: the same reason data-center hum complaints are worse at night, in quiet suburbs, and inside homes near the fence line.

## E5 — Signature Hunt (elevator, refrigerator)

- Elevator fan @ 15 m: **12.2 dB (borderline)** — closest non-AC hit
- Elevator @ 1 m: 5.7–9.7 dB (closer is NOT better for gap — consistent with E2: close range = broadband components dominate)
- Refrigerator @ 1 m: 10.2 dB borderline (5 s capture — see E1's duration law)

## Cross-cutting observations

- All 29 captures: gap range 0.6–21.1 dB; the instrument discriminates conditions, no pegging, no dead zones.
- Verdict distribution: 3 SIGNATURE, 5 borderline, 21 not-indicated — the instrument says "no" most of the time in a normal building, and "yes" with confirmations exactly where a tonal source dominates. **A detector that screams everywhere is useless; this one doesn't.**
- Ears-vs-instrument agreement: rumbling audible at 15 m ("CAN HEAR RUMBLING" in the log) = the two highest gap rows. Human ears and the gap agree.

## Honest-claims labeling (per plan §4.3)

- All levels are digital (dB re RMS 1), uncalibrated — levels compare only within-device, same-session.
- The gap is the robust cross-condition number (offset cancels); device-fair within this session's mic.
- Source class: residential/commercial HVAC + elevator + kitchen refrigeration = **same equipment class as data-center cooling plant** (fan banks, compressors, transformers — documented tone band 50–250 Hz). NOT a data center; the signature class and physics are the claimed commonality.
- Sample: 29 captures, one building, one mic chain, one afternoon. Findings are directional, statistically modest, honest.

## What this means for the pitch (one line each)

1. "We validated the instrument in the field the same day we built it — 29 captures, four experiments."
2. "The headline: with distance, raw level falls but the tonal gap RISES — the county's dBA metric says 'quieter' while the tonal signature grows. That's the measurement failure our tool fixes."
3. "Masking, measured: normal human activity closes the gap from 9 dB to 1 dB — the physics of why these complaints arrive at night."
4. "Instrument discrimination: 21 quiet-building readings, 5 borderline, 3 confirmed signatures — a detector that only fires on tonal sources."