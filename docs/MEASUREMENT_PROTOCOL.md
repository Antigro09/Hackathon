# Measurement Protocol — guided-flow spec (for Codex)

From: Nico, for team lead Vihaan. 10/18/2026 ~2:00 PM. Empirically grounded in `docs/FIELD_FINDINGS.md` (29 captures, 12:28–12:48, today).

Wire the following into the measurement flow as **UI guidance + protocol rules**. This is a UX/workflow ticket, not an engine change — the engine is verified and stays.

## P0 — Guided-flow tips (UI copy, one screen each, dismissible)

Shown before first capture, and reachable via a "?" help chip on the capture screen:

1. **Find the quiet side.** "Tonal signatures read best away from noise: no talking, no crowds, out of any airflow or draft. If your spot feels quiet to your ear, it's right." (Rationale: measured — activity collapsed the gap 9→1 dB; airflow broadband masked the source at close range.)
2. **Don't crowd the source.** "Step back from machines and air discharges. Close up, broadband parts of the sound dominate; a little distance is where the tone becomes visible." (Rationale: same source measured gap 6.1 dB at 2 m vs 20.3 dB at 15 m.)
3. **Hold still.** "Stand still and hold the device steady for the whole capture." (Rationale: walk-through spread 5–14 dB vs stable stills.)
4. **Three beats one.** "Take three captures. The middle value is your reading. This matches county procedures." (Rationale: one 15s outlier at 10.3 between 5.8s would be discarded by median.)

## P1 — Protocol wiring (state machine + verdict)

1. **Median-of-3 verdict:** after three captures at one spot, the session verdict = **median gap**, labeled as such in the report ("median of 3 captures"). Single-capture mode stays available but shows "single capture — confirm with 2 more for a stable reading" when gap is in the 10–15 band.
2. **Quiet-floor check:** if the capture's broadband A level is in the top band for this device session AND the gap is <15, add quality note: "elevated broadband background — tonal screening sensitivity reduced." Do not block capture; label it.
3. **Path column:** add an optional single-select to the observation form: source path = *direct / through wall / through floor / unsure*. (Rationale: highest gaps measured came through a floor — the complaint condition.)
4. **Transient rule:** keep existing interruption detection; UI copy: "A passing event (vehicle, door) contaminates the sample — retake."

## P2 — Learn panel additions (science tab, copy only)

One card: **"Where the signal lives"** — the distance finding as user-facing science: "Sound level falls with distance — but the tonal signature becomes *more* prominent, because broadband parts of the sound fade faster in air than the low tone. That's why the hum may be what survives the distance: levels say fading, the gap says emerging." Plus the piano metaphor: high piano keys must be struck with far more force to match a low key's perceived power — A-weighting formalizes exactly that ear behavior.

## Explicit non-goals (do NOT add today)

- Buddy check / cross-device calibration: **demoted to roadmap slide.** Optional feature; do not build before freeze. (Team lead decision 2:55 PM, user-convenience call.)
- Absolute SPL display, offsets, or "dB SPL" labels anywhere — the digital-level labeling law stands.
- New experiments or more instrument features — the measurement method is now frozen; remaining hours go to pitch/rehearsal/backup video.

## Acceptance

- `npm run test` stays green (no engine changes; new UI state only)
- Guided tips appear before first capture and via help chip
- Median verdict + path select live in the report flow
- Do not touch `field_lab.html` (standing law: docs/FIELD_INSTRUMENT_LAW.md)