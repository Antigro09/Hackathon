# TonalWatch — Codex Build Order (Noon, 10/18)

**Context:** engine + Measure + Report = SHIPPED (74/74 tests green, verified on `main`). What's missing is the three-tab product Vihaan locked on 10/17 and the live-mic demo proof. Build the following, in order, against `main`. Read `docs/TEAM_BRIEFING.md` + `docs/RESOURCES.md` for product intent and honesty law. Do NOT cut scope without Vihaan.

## P0-1: LEARN panel (45 min)

- New route `#/learn` (or panel on Home per v2 plan: "one short How-this-works panel" — implement BOTH: panel on Measure under the result card, full route as its own tab).
- Content:
  1. Tone player — Web Audio oscillator buttons: **63 Hz, 125 Hz, 500 Hz, 1 kHz, 8 kHz** (5 buttons, gain 0.15, stop button, no autoplay). Reuse the tone-player pattern from `mic_spike.html` at repo root.
  2. A-vs-C explainer: two short cards, plain English. Copy (Ricardo refines): "The county measures with A-weighting — it de-emphasizes low frequencies, because it was built to approximate human hearing at moderate loudness. C-weighting keeps the bass. Play the 63 Hz tone: your phone speaker barely makes it, but a data center chiller makes it all day — and the law's number barely moves while your windows rattle."
  3. Gap explainer: "One subtraction: what you feel (C) minus what the law measures (A). Big difference = low-frequency content the standard can't see."
  4. The honesty line, verbatim: "Uncalibrated screening only. No source identification or legal-compliance determination."
- Acceptance: 63 Hz button plays; route reachable in nav; copy visible in print stylesheet.

## P0-2: MAP tab with seeded local data (60 min)

- New route `#/map`. Leaflet via npm (`leaflet` package, no CDN — offline-safe bundle), OpenStreetMap tiles, light-grey basemap.
- Data: `src/data/readings.ts` — static array of 12-15 seeded readings. Fields: `{id, lat, lng, label ("Ashburn-area residential proxy site N"), gapDb, aDb ("A relative"), device: "iPhone 15/ Pixel 8 / demo laptop", time: "07:40 / 13:15", conditions: "night, indoors, windows closed"}`
  - Seed realistic values around Ashburn/Sterling/Chantilly (data-center cluster): gaps 8-24 dB, two sites over 15 ("tonal signature indicated"), most under. One site shows the 90 dB fence-line news measurement labeled "News4 measurement, Mar 2026 — reported, not ours."
  - Pin color by band: <15 grey ("not indicated"), ≥15 amber ("tonal signature indicated — engineer measurement requested"). NO red, no violation language (plan §11).
- Pin popup: reading summary + "uncalibrated indicator" + timestamp + devices.
- A "Live reading" button: "Add current result to map (local preview)" — appends the active session's result as a pin in-memory (no backend — label "local preview, resets on reload").
- Acceptance: map renders offline in `npm run preview` build (test with wifi on; pins clickable; no console errors).

## P0-3: Longer capture mode (30 min)

- On Measure: duration selector `5s / 15s / 30s` (default 5). State actual duration + frame count in the report (already contract fields). County procedure uses ≥15-second samples — so the report line "duration: 30.0 s (meets county's minimum single-sample guidance of ~15 s)" where true.
- Keep frame math honest: derive frameCount from actual samples (already does).

## P0-4: Buddy-check chip (45 min)

- On Measure result panel: "Compare with previous" — stores last result's gap in memory, shows `Δgap vs previous capture: +4.2 dB` chip. Explanation tooltip: "Same sound measured by two devices side-by-side: the gap difference is the device offset — the map compares readings by difference, not loudness."
- This is the cross-device calibration story, demoed: two phones, one spot, one chip.

## P1 (only if P0 green by 2:00): 60 Hz sensitivity exhibit
- Learn panel addition: "Find your building's electrical hum" — instructs: quiet room, mic on, 15s capture, then look for a peak at ~60 Hz (and harmonic at ~120 Hz) in the spectrum. Caption: "no tone played — that's the power grid, detected through the wall."

## Hard rules
- Feature freeze 3:00 PM. Pitch rehearsal 3:15. Submit 4:15.
- No backend, no geolocation, no accounts (plan §6 cuts). Map = static seeded data + local preview only.
- Every numeric display keeps "uncalibrated input" adjacency. No dBA/dBC SPL labels.
- Commit small, push to `main`, do not force-push.