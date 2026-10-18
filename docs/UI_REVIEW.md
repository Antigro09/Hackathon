# UI/UX Review — first pass: HOME page (Vihaan, 10/18 ~2:30 PM)

**Status: LOGGED, NOT COMMITTED to fixes yet — team does a thorough website-wide pass before any edits. One page of several to come.**

## Verdict on current home page

Every element on screen is abstracted away from the actual topic (data-center noise). A stranger can't tell in five seconds what this is about. Complaints + required changes:

1. **Pillbox "A clearer picture of community noise"** — reads like AI marketing filler; the public doesn't trust this register. → **Team-lead ruling: replace with "A data center noise pollution tool."**

2. **Hero title "Make the hum an observation."** — abstract, and drifted from the data-center topic entirely; never mentions noise or data centers. → **Team-lead ruling: "Annoying data center noise? Map it."**

3. **Sub-paragraph "A recurring sound is hard to explain…"** — same issue: abstract process language, no mention of who it's for or what problem it solves. → **Team-lead ruling: "Low-pitched whining noises can cause long-term psychological effects, and data centers are a key culprit. ____ measures it from your device."** (blank = product name, pending — see name discussion)

4. **Button "Start an observation"** → **"Record a complaint"** (team-lead decision, 2nd pass).

5. **Button "Understand the signal"** → **"Learn more"** (team-lead decision).

6. **"02 Independent indicators / A more careful interpretation" callout** — remove from home. It doesn't communicate anything a judge/resident needs at first glance (and the indicators live in the Learn flow anyway).

7. **Hero image (dark spectrum card)** — shows an abstract spectrum with no context. Switch to a data-center/noise-related image (specific asset TBD). Team lead's direction: something like a noise-contour map over an aerial/suburban view (reference: airport noise contour map style, dB levels legend visible) — shows impact area at a glance.

8. General law for the whole site (standard for the thorough pass): **one-go comprehensibility** — no abstractions, no clever phrasing, no college-level sentence structure. If a sentence needs a second read, rewrite it.

9. **(2nd pass note from team lead)** the hero image reference: the airport-style noise contour map (colored dB bands spreading over an aerial neighborhood view, legend in the corner) is the right visual grammar — it's the mapping language officials already know, pointed at a data center instead of a runway.

## Name question (open, team-lead raised ~2:40 PM)

**Is "TonalWatch" the right name?** Honest assessment:

**For keeping it:**
- Established across the repo, docs, commit history, briefing — switching costs ~2 hours of find-replace + re-verification at the worst possible hour
- "Tonal" is technically precise: the tool detects TONAL noise (the hum family), which is the exact thing the county's dBA standard misses. The name encodes the actual insight.
- "-watch" reads as community monitoring (Waze-adjacent), which is the right product category

**Against it:**
- "Tonal" is a technical word most residents don't use — neighbors say "the hum," "the drone," "the whine," never "tonal noise"
- One-go test fails slightly: a stranger hearing "TonalWatch" doesn't immediately know what it watches

**Alternatives considered (with honest notes):**
- **"HumWatch"** — the word every actual complainer uses; instantly on-topic; loses the "tonal = the law's blind spot" precision
- **"HumLine"** — evokes fence-line + hum; nice but sounds like a hotline service
- **"SoundCheck VA"** — too generic, sounds like a hearing-aid store
- **"The Hum Project"** — warm, movement-y; loses the tool-ness
- **"dBMap" / "GapMap"** — describes the mechanism, not the problem; mechanism names never land with the public

**Recommendation (Nico's honest one):** the timing math decides this. At 2:40 PM with freeze at 3:00, a rename costs the demo, the deck, the repo, the printed materials, and muscle memory in the pitch — for a marginal name upgrade. **"TonalWatch" is technically the most accurate name available and it's everywhere already.** If we had named from scratch today, "HumWatch" might beat it by a nose on neighbor-resonance. We didn't. Keep TonalWatch, put "the hum" everywhere in the copy (which the team-lead's new homepage copy already does — the copy carries the neighbor-language while the name carries the precision), and list "HumWatch" on the roadmap as a future reconsideration if the product grows beyond the science-fair scope.

## Open questions for the team

- Exact hero image asset (TBD)
- Final hero title + body copy (proposals below, team lead to pick)

## Replacement copy proposals (for discussion — none final)

**Hero title options:**
- *"Measure the hum data centers leave behind."*
- *"That low hum from the data center? Measure it."*
- *"Make the hum measurable."* (closest to current, still on-topic)

**Sub-paragraph options (plain language, ~7th grade reading level):**
- *"Data centers near homes can hum around the clock. Regular sound meters can't hear the part that bothers people. TonalWatch measures it from your phone — free, no account, audio never leaves your device."*
- *"If a data center's hum is bothering your neighborhood, this tool helps you measure it, understand the reading, and file it as real evidence the county can act on."*

**Pillbox options:**
- *"Built for data-center noise complaints"* (plain, factual)
- *"A free noise-measurement tool for Virginia residents"* (location + audience)
- Or simply DELETE the pillbox — if the title does the work, the pill adds nothing.

**Hero image direction (TBD):** an image that says "data center next to a home" at a glance — a cooling fan wall / a house with a facility silhouette. Synthetic or stock-with-attribution is fine; must be labeled if synthetic. NO abstract spectrum art.

## Scope note

These are homepage issues; expect similar problems across Learn/Map/Sources pages — the whole-site pass catches them in one sweep, then we hand one consolidated change-list to the team (via Codex order doc) rather than committing piecemeal edits.