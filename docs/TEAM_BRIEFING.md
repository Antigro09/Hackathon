# TonalWatch — Team Briefing (the in-depth version)

*Hand this to the team. Everything below is verified, sourced in docs/RESOURCES.md, and already proven where it says "demonstrated."*

---

## The one-liner

**Loudoun County's own zoning page admits its noise standard cannot see the sound residents are complaining about. TonalWatch is the ears for that gap: measure A-weighted and C-weighted sound at once, and the difference between them is the fingerprint of the exact noise the law can't see.**

## The problem (rubric: Problem/Solution, /20)

Virginia hosts more data centers than anywhere on Earth. When facilities run out of industrial land, they buy land next to suburbs. The neighbors complain about a low, steady hum — chiller and fan tones in the 40-500 Hz band. Documented since 2025-2026 by NBC4 (a hum audible over a mile away; News4 measured ~90 dB near an Ashburn fence, a level that legally requires hearing protection for sustained exposure) and WUSA9 (an HOA president: "It's like having tinnitus without having tinnitus").

The problem is NOT that sound exists. **The problem is that the harm is invisible to the law that's supposed to protect residents.** Loudoun County's own noise page admits, in writing, that its dBA standard "do[es] not capture low frequency noise or the discomfort caused by steady tonal sounds," and that the county has no tonal/low-frequency regulatory language at all. A resident complains; the county measures with a weighting that's deaf to the injury; the reading comes back "compliant"; the complaint dies. The noise pollution *persists because it is unmeasurable under current rules.*

## The solution (and what "solve" means here)

A smoke detector doesn't put out fires — and nobody calls it "not a solution to fire." It converts an invisible lethal condition into legible, actionable evidence. That's the product category we're in.

**TonalWatch in one flow:**
1. **MEASURE** — any phone/laptop mic captures 5 seconds; the browser computes approximate dBA and dBC at once (industry-standard A and C weighting curves; live-validated on consumer hardware on 10/17 — the spikes are committed in this repo).
2. **DIAGNOSE** — the diagnostic is one subtraction: **the gap (dBC − dBA). If the gap exceeds ~15 dB, that IS the low-frequency tonal signature** the county's standard can't see. Both weightings ride the same mic in the same room at the same moment, so calibration error cancels — the gap is the honest number. (Prince William County uses this same A-vs-C logic in its own ordinance.)
3. **TESTIFY** — the reading, timestamp + location + gap, lands on a community noise map of Virginia data center sites. **Waze proved the mechanic: citizens reporting what's invisible to everyone else, crowd-confirmed into a shared map, becomes infrastructure.** Waze never eliminated a single speed trap — it solved *legibility*, and sold to Google for $1.3B on exactly that. Two upgrades over Waze: our reports are **instrumentation** (a physics computation, not testimony — watchable live in 5 seconds), and our map is aimed at a **named actuator** (below).

> Note: Waze, Flock, and most self-reporting apps also rely on multiple good reports outweighing a false report. It should be easy to detect an outside environment (intended measuring location), and the location for accurate placement. 
4. **ACT** — one click generates an evidence-grade complaint packet: the readings, the gap, the ordinance citations (Loudoun Z.O. §7.05.03's dBA blind spot; PWC Ordinance 25-62 as the regional precedent — 73 dBC day / 68 dBC night, effective May 2026), and the county portal link. The packet asks for exactly one thing Loudoun's own process requires: verified measurement by a licensed engineer. We're the triage layer that makes the formal measurement get *ordered*.

## "The government doesn't care" — the receipts

- **Prince William County passed Ordinance 25-62** — the region's first C-weighted tonal noise standard. The regulatory machinery moves the moment it has precedent + evidence. PWC IS the precedent.
- **Loudoun zoning enforcement opened an investigation** after the News4 90 dB measurement (Mar 2026). Open investigation = the county is actively asking for evidence like ours.
- **Loudoun rewrites its noise code in 2027** — announced on the county's own page. Every reading collected in 2026 is direct input to a real amendment process with a real date. This map isn't a dashboard hoping for users; it's a tool aimed at a decision point that already exists on the calendar.

## Why nothing like this exists (rubric: UVP, /10)

Verified 10/17 across the noise-mapping landscape: wind turbines have complaint bureaucracies and mandated monitoring; highways and airports have decades of noise contour maps. **Data centers — the largest concentration on Earth, in this state — have NOTHING. No map, no complaint protocol, no evidence infrastructure.** The industry outran its own oversight. Search it live: "data center noise map" returns nothing; "wind turbine noise map" returns a bureaucracy. That's our uniqueness, checkable in 30 seconds by any judge with a phone.

## Target market (rubric: /10)

Primary: residents of Loudoun/PWC/Goochland within a mile of a facility — the people already organizing on Facebook, already sharing "how to record noise for a complaint" guides, already filing complaints that die on contact with a deaf standard. Secondary: the counties themselves, who need structured evidence for the 2027 amendment. Marketing channel that isn't "social media": the complaint-recording groups and HOA networks where the target market already organizes, plus the county portal as the distribution endpoint.

## Honest claims (we win by not overclaiming)

Phone mics aren't certified instruments, and we say so in the product. Output = "indicates a tonal signature — request county licensed-engineer measurement." The tool doesn't replace the county's requirement; it *feeds* it, by telling residents whose complaints are worth the engineer's visit. Honest triage, not amateur enforcement.

## What's built vs. what's planned (rubric: Functionality /35, "relative to time allotted")

- **Built & validated (pre-hackathon,committed):** mic spikes — dBA/dBC + gap live (mic_spike.html), hardware chain calibration 5-45 Hz and 16k-24k bands (range_finder.html). Hour one starts ~20% done.
- **Today:** Learn tab (hear the tones, A vs C explained in-browser) · Measure tab (the live gap dial + verdict) · Map tab (seeded readings on real facility locations) · evidence packet generator.
- **Roadmap:** trained severity classifier (ambient-aware) · siting advisor · mitigation modeling by frequency · EchoGuard-style event detection (sounds that deserve review, queued for conservation teams) · the six alternative concepts in docs/IDEAS.md are the platform's expansion set.

## The close (for the pitch)

"Loudoun amends its noise code in 2027. The evidence for that amendment should come from the people living with the sound — not the companies causing it. Waze gave drivers a map of what they couldn't see. We're giving residents the same thing for a harm the law is deaf to — measured, mapped, with a number on it. We built the ears for the gap."