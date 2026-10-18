# TonalWatch resources and source ledger

Last reviewed: **October 18, 2026**. These are informational references, not an applicability or compliance engine. The app pins source summaries in `src/data/references.ts`; it does not fetch or generate legal guidance at runtime. The HTML preview and downloaded text use the same report model.

## Claims policy

- C−A is a captured-spectrum low-frequency screen, not a tonal signature. A separate experimental peak heuristic looks for sustained narrowband structure.
- The **15 dB** screening threshold is a prototype convention, not a legal trigger. Only constant gain cancels in the difference; microphone frequency response, filtering, compression, variable gain and clipping remain relevant.
- Browser results are **weighted digital levels, dB relative to RMS 1**, not calibrated dBA/dBC sound-pressure levels. Do not compare them with ordinance limits.
- A short, uncalibrated sample does not reproduce either county's formal measurement procedure, identify equipment, establish a violation, or guarantee agency acceptance or a visit.
- Negative or inconclusive indicators do not invalidate a resident's description. Devices and short captures can miss recurring sounds.
- A synthetic fixture validates software behavior, not field accuracy. Every synthetic result and report must retain its prominent demonstration label.

## Official county sources checked during this build

“Independently checked” means the official page content was retrieved and read on October 18, 2026. “Access limited” means the supplied official URL was reviewed but its substantive text could not be retrieved. A review date is not represented as independent verification of inaccessible text.

| Source | Access status | Bounded use |
| --- | --- | --- |
| [Loudoun: Noise & Air Quality Concerns](https://www.loudoun.gov/6405/Noise-Air-Quality-Concerns) | Independently checked 2026-10-18 | County identifies a gap in tonal/low-frequency provisions and anticipates amendments in spring/summer 2027. That expectation is not an enacted rule. A-weighting de-emphasizes bass; bass remains measurable. |
| [Loudoun §7.05.03](https://online.encodeplus.com/regs/loudouncounty-va-crosswalk/doc-viewer.aspx?secid=1320) | Access limited; last reviewed 2026-10-18 | Dynamic viewer returned a loading/JavaScript page. Link the current section; do not present its detailed table or procedure as newly verified. |
| [Loudoun zoning applicability](https://www.loudoun.gov/zoningordinance) | Independently checked 2026-10-18 | Vested rights, some Route 28 properties, grandfathered applications and incorporated towns can affect governing rules. County selection alone cannot resolve applicability. |
| [Loudoun LEx guidance](https://www.loudoun.gov/LEX) | Independently checked 2026-10-18 | Distinguishes exterior lot-line and closed-window indoor noise routing. Public requests may show a username and map pin; a private-request setting is described. |
| [Prince William: Steady Tonal Noise](https://pwcaws.pwcva.gov/department/public-works/steady-tonal-noise) | Independently checked 2026-10-18 | Describes Chapter 14 changes effective May 1, 2026, PWC311 reporting, required complainant contact information and Type 1 inspection equipment. |
| [PWC §14-3](https://library.municode.com/va/prince_william_county/codes/code_of_ordinances?nodeId=CH14NO_S14-3DE) | Access limited; last reviewed 2026-10-18 | Official definitions link supplied by the planning ledger and referenced by county guidance. Full text not independently retrieved. |
| [PWC §14-4](https://library.municode.com/va/prince_william_county/codes/code_of_ordinances?nodeId=CH14NO_S14-4MAPESOLE) | Access limited; last reviewed 2026-10-18 | Official limits/exceptions link. Full text not independently retrieved. No legal limit is compared with digital values. |
| [PWC §14-7](https://library.municode.com/va/prince_william_county/codes/code_of_ordinances?nodeId=CH14NO_S14-7MEPR) | Access limited; last reviewed 2026-10-18 | Current procedure link. Do not reproduce a legacy three-reading/geometric-mean or automatic subtraction procedure. |
| [Signed PWC Ordinance 25-62](https://pwcgov.granicus.com/services/legistar/download/pdf/4103722/Ord._No._25-62.pdf) | Access limited; last reviewed 2026-10-18 | Signed PDF could not be retrieved. The planning document's adoption date and detailed thresholds are not newly verified by this build. |

The planning document describes Loudoun's receiving-development table and PWC's C-weighted steady-tonal limits. Those details were intentionally left out of the app's conservative summaries because the complete current code pages could not be independently retrieved here. County guidance, full current code, exceptions and property-specific approvals should be confirmed with the responsible agency. PWC standards do not automatically govern a Loudoun observation. Unknown/other jurisdiction applies neither county profile.

## Method and implementation references from the supplied plan

These links are retained for follow-up and attribution. They were **not independently reverified in this report/source task**. Consult actual implementation and numerical tests for what the current build does; a link is not a validation result.

- [B&K environmental-noise handbook](https://www.bksv.com/doc/br1626.pdf): low-frequency screening context; C−A does not uniquely establish tonality.
- [NTi frequency weightings](https://www.nti-audio.com/en/support/know-how/frequency-weightings-for-sound-level-measurements) and [conventional weighting equations](https://www.cross-spectrum.com/audio/weighting.html): response cross-checks; implementation normalizes at 1 kHz.
- [SciPy periodogram](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.periodogram.html): density versus spectrum scaling and one-sided power.
- [B&K tone-assessment manual](https://www.bksv.com/downloads/2250/be1778.pdf): professional tonality context; not the prototype heuristic.
- [NIOSH Sound Level Meter](https://www.cdc.gov/niosh/noise/about/app.html) and [external-microphone study](https://pmc.ncbi.nlm.nih.gov/articles/PMC5102154/): hardware-specific calibration/validation context. Their performance does not transfer to this prototype.
- [W3C Media Capture and Streams](https://www.w3.org/TR/mediacapture-streams/) and [Web Audio](https://www.w3.org/TR/webaudio/): capture constraints, returned settings and audio processing.
- [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia), [AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet) and [decodeAudioData](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData): permission, processing and decode/resampling behavior.
- [Vite](https://vite.dev/guide/), [FFT.js](https://github.com/indutny/fft.js) and [Vitest](https://vitest.dev/guide/): implementation dependencies; see the lockfile for actual installed versions.
- [NoiseCapture](https://noise-planet.org/noisecapture.html): existing environmental-noise alternative; no “first/only” product claim.

## Official event links

Retained from the supplied planning materials; schedule, track, eligibility and rubric details must be confirmed against the organizer's current instructions. These event pages were not independently reverified in this source task.

- [804 Hacks organizer and FAQ](https://www.804hacks.org/)
- [Official Devpost overview](https://804hacks.devpost.com/)
- [Devpost dates](https://804hacks.devpost.com/details/dates)
- [Devpost resources](https://804hacks.devpost.com/resources)
- [Supplied rubric document](https://docs.google.com/document/d/18qsN9ITcCPEGY4uMNW0Q54AK5lkNU78DbPR7Gfs0-SE): user-supplied reference, not independently verified here.

The supplied plan reports a preparation/building restriction and calls for disclosing the October 17 spikes before using pre-event code. This ledger does not claim organizer approval or event eligibility. Existing `mic_spike.html` and `range_finder.html` are research artifacts; do not treat their claims as hardware calibration or validated low-frequency accuracy.

## Claims removed from the earlier ledger

The previous “gap = tonal signature,” “no calibration needed,” “first regional standard,” and “validated 5–45 Hz range” statements are unsupported and must not appear as product facts. No consumer-speaker sweep here establishes acoustic calibration.

News anecdotes and the supplied tinnitus quotation are excluded from report/pitch factual copy until the original articles and context are checked. The supplied plan reports access failures for [NBC4](https://www.nbcwashington.com/news/local/northern-virginia/neighbors-raise-concerns-about-noisy-data-center-in-loudoun/4080249/) and [WUSA9](https://www.wusa9.com/article/news/local/data/loudoun-county-officials-data-center-noise/65-45884219-750f-4d47-a660-71a20d8db001). No hearing-protection, health, investigation-causation or distance claim is inferred from these references.

## Privacy and report handling

The report builder accepts in-memory analysis and manual context. It does not use raw HTML, include raw audio, collect GPS, retain a persistent device identifier, or submit a complaint. Only useful track settings are allowed into reports; `deviceId` and `groupId` are excluded. Review exported location and personal notes before sharing. Client timestamps are device-clock statements, not authenticated evidence or chain of custody.
