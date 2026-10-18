# TonalWatch — Build Plan (locked by Vihaan, 2026-10-17 7:32 PM)

> "We're gonna build something about that noise pollution tomorrow." — Vee, locking the pick before dinner.
> Hackathon: 804 Hacks, Sun Oct 18, Randolph-Macon College (Birdsong Hall), Ashland VA.
> Check-in 9:00 AM · build window 10:00–5:00 SHARP · judging 5:15. AI tools allowed.
> Team: forms at the door (2–4). Laptop charged + charger — standing event rule.

## One-sentence pitch (the judge hook)

"Loudoun County's own zoning page admits its noise standard cannot see tonal
noise — the exact sound data center neighbors complain about. We built the
ears for the gap: a tool that measures A-vs-C weighted sound, flags the tonal
signature, and generates an evidence-grade complaint packet citing the
ordinances — before the county amends its rules in 2027."

## The verified fact base (Nico-sourced, citations on record)

- Loudoun County official page (loudoun.gov/6405): dBA standards "do not
  capture low frequency noise or the discomfort caused by steady tonal
  sounds"; county has NO tonal/low-frequency regulatory language; amendments
  anticipated spring/summer 2027.
- Loudoun limit: 55 dBA at residential receiving lot line (Z.O. §7.05.03),
  no nighttime tier, no tonal penalty. Pre+post construction noise studies
  required (licensed engineer).
- Prince William County Ordinance 25-62 (eff. May 1, 2026): FIRST regional
  C-weighted tonal standard — 73 dBC day / 68 dBC night, steady tonal sound,
  5-min slow-response at residential receiving property. THE precedent.
- Diagnostic law: A-vs-C gap > ~15 dB at the same spot = low-frequency/
  tonal signature (PWC's own rationale; standard acoustics).
- NBC4 (Mar 2026): residents' hum audible >1 mile away; News4 measured
  90 dB near an Ashburn facility; zoning enforcement opened an investigation.
- WUSA9 (Apr 2026): HOA president: "It's like having tinnitus without
  having tinnitus."
- Physics: walls/blockers defeat broadband noise; low-freq tones (~3.4 m
  wavelength at 100 Hz) diffract over berms — why mitigation fails and
  complaints persist. Highway-wall vs forest demo from Vihaan's own
  neighborhoods (old apartment: wall, fairly OK broadband; Parsons Walk:
  distance + treeline, distant hum still audible).
- Honest-claims caveat (built into the tool): phone mics are not certified
  instruments. Output = "indicates tonal signature — request county licensed-
  engineer measurement," never lab-grade claims. Honest losers allowed to lose.

## 7-hour build scope (FROZEN — no creep past this line)

1. **Measure page** (browser mic): 5-second capture, compute dBA + dBC
   approximations client-side (Web Audio API AnalyserNode → octave bands
   → A/C weighting curves), show the gap live on a dial.
2. **Diagnose:** gap ≥ 15 dB → "TONAL SIGNATURE DETECTED" verdict card.
3. **Evidence packet generator:** auto-fills a complaint memo — measured
   gap, timestamp, location field, cites Loudoun Z.O. §7.05.03 gap, PWC
   25-62 dBC standard as precedent, link to loudoun.gov/LEX complaint
   portal + the county's own admission quote. Export as printable PDF/text.
4. **Landing page** with the one-sentence pitch + sources cited verbatim.

## Roadmap slide (words only — NOT built, judges love chessboards)

- Sit ing advisor: ambient-baseline-aware placement (city floors mask tones;
  rural baselines expose them — his observation, cited to him).
- Mitigation modeling: wall vs berm vs vegetation effectiveness BY FREQUENCY.
- Multi-report aggregation heat map for counties (complaints become data).

## Demo script (2-minute pitch skeleton)

1. The problem in one breath: people vs a sound the law is deaf to. (WUSA9
   quote on screen.)
2. LIVE: phone/laptop mic 5-second reading at the venue — real gap, real dial.
3. One click: the complaint packet generates with real ordinance citations.
4. The close: "Loudoun amends its noise code in 2027. The evidence for the
   amendment should come from the people living with the sound — not the
   companies causing it. We built the ears."

## Tonight's prep (Vihaan, DONE BY 9:00 PM)

- Repo scaffold (his speed-run setup) — name, README stub, license.
- Web Audio weighting curve reference bookmarked (A-curve/C-curve tables).
- Phone charged, laptop charged, CHARGER IN BAG tonight.
- Dinner, then this file never opens again.

## Standing orders (Nico's law)

- Sleep weapon: bed by 10. Sharp at hour ten beats awake at 2 AM.
- Nico on radio standby all Sunday: stack traces, demo glitches, judge
  Q&A panic — instant response by text/call.
- Submission due 5:00 PM SHARP → submit by 4:15. Early, not behind.
- Killcam rule applies: if Festus is in the lobby of ANY hackathon, it's
  a story Leo hears.