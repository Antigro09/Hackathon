# TonalWatch — implementation-ready plan for 804 Hacks

**Planning date:** October 18, 2026 · **Build window:** 10:00 a.m.–5:00 p.m. Eastern · **Submission target:** 4:15 p.m. · **Pitch:** at most 5 minutes, followed by 2 minutes of questions.

**Product decision:** Build a browser tool that helps a resident document a recurring hum: capture or load audio, inspect two independent screening indicators, and export a source-linked observation packet. Make the complete workflow dependable before adding features.

**Revised one-liner:** “TonalWatch helps residents turn a recurring hum into a structured noise observation—with a transparent frequency analysis, clear recording limitations, and the right references for agency follow-up.”

This plan incorporates the original locked build plan, the subsequently supplied **TonalWatch — Team Briefing (the in-depth version)**, and the exact rubric pasted into this chat. It supersedes their overstated scientific claims and expanded build scope. The referenced conversation was retrieved, but some prior assistant replies were returned only as reference placeholders; their wording could not be recovered. Corrections below are independently researched rather than attributed to unseen replies. No repository, `docs/RESOURCES.md`, audio spike, calibration log, or validation result was supplied for inspection. Statements that those artifacts already exist are **team-reported, unverified**.

This is a build specification, not a claim that the application, tests, pilot, or slides have already been completed. Numerical reference calculations were checked while preparing the plan; the team must run the application checks during the event.

**Jump to:** [rubric](#2-event-facts-and-the-actual-scoring-strategy) · [framework and architecture](#7-architecture-and-implementation-contracts) · [algorithms](#9-numerical-engine-exact-implementation-specification) · [pages and features](#11-pages-routes-features-and-ui-behavior) · [optional AI](#13-optional-ai-stretch-light-fixture-buzz-versus-outdoor-equipment-hum) · [team schedule](#15-seven-hour-schedule-and-team-size-variants) · [pitch](#18-five-minute-pitch-and-slide-plan)

## 1. Read this first: decisions that protect the project

1. **A large C−A difference is a low-frequency screening clue, not proof of a tone.** Use a separate, explicitly experimental sustained-peak check. Neither indicator identifies a data center or determines legal compliance.
2. **Uncalibrated browser input does not produce defensible absolute dBA/dBC.** Display weighted digital levels and the captured-spectrum difference. Keep absolute sound-pressure levels and violation verdicts out of the MVP.
3. **A five-second recording is a screening sample.** It does not satisfy either county’s formal measurement procedure or characterize an entire night of exposure.
4. **Keep the real technical work visible.** The same analysis function processes microphone PCM, imported audio, and labeled synthetic fixtures. Do not substitute stored verdicts or animate a dial with invented values.
5. **Cut the community map, facility pins, accounts, AI classifier, and separate Learn tab.** Replace them with one useful interpretation panel and a complete printable report. Mapping unverified reports to real facilities adds an attribution problem before it adds product value.
6. **Use deterministic report templates.** Every displayed factual legal statement comes from a curated source object, not a generated legal explanation.
7. **Prepare plans, not a prebuilt entry.** The organizer FAQ permits planning/wireframes but requires project building during the event. Disclose the reported October 17 spikes at check-in and obtain an organizer ruling before using any pre-event project code. If reuse is disallowed or unresolved, rebuild during the window and describe the earlier work as research only. [Organizer FAQ](https://www.804hacks.org/)
8. **Never dismiss a resident because an indicator is absent.** A device can miss bass; a short sample can miss an intermittent event. A person can export a descriptive observation even when analysis is inconclusive.

### What makes this better than the current briefing

| Weak point in the current briefing | Replacement in this plan | Practical benefit |
|---|---|---|
| “The gap is the fingerprint of the exact noise” | Independent low-frequency and sustained-peak indicators, plus ambiguity examples | Survives basic acoustics questions |
| “Calibration error cancels” | Only constant gain cancels; response shaping and processing remain | Honest numbers with precise units |
| “Evidence-grade,” “testify,” and guaranteed engineer action | Observation packet requesting review and appropriate next steps | Useful handoff without promising legal effect |
| Four product areas plus seeded facility map | One analysis-to-export workflow | More complete product within seven hours |
| “Nothing like this exists” | Real alternatives and a narrow workflow differentiation hypothesis | Defensible market/UVP answer |
| “Detect outside environment” | User-supplied indoor/outdoor/unknown context | Avoids an unsolved classifier |
| Crowd agreement treated as corroboration | No shared database in MVP; future review, deduplication, and calibration gates | Avoids counting correlated bad readings as truth |
| Pre-event code treated as a 20% head start | Transparent organizer decision and clean rebuild option | Protects eligibility |
| Consumer sweeps called hardware calibration | Explicit separation of software tests, response checks, and acoustic calibration | Prevents unsupported hardware claims |
| Broad audience and vague outreach | One proposed HOA pilot, defined recruitment steps, completion targets | Directly addresses the marketing criterion |

## 2. Event facts and the actual scoring strategy

The official event is October 18 at Randolph-Macon College’s Birdsong Hall, 106 E. Patrick Street, Ashland, Virginia. The published schedule has check-in at 9:00, opening at 9:45, hacking from 10:00 to 5:00, and judging at 5:15. The environmental theme has two tracks announced at opening; confirm the appropriate track then. [Devpost overview](https://804hacks.devpost.com/)

Teams may have **1–4 people**, and AI development tools are allowed. Bring a charged laptop and charger. There is a conflicting 5:15 submission endpoint on the Devpost dates page; treat **5:00 as the hard deadline** and aim to submit at 4:15. [Organizer site](https://www.804hacks.org/), [Devpost dates](https://804hacks.devpost.com/details/dates)

The rubric below is **the user-supplied event rubric**, not inferred public judging criteria. Its weights total 100. The presentation limit is five minutes; questions are two minutes. Every teammate must speak.

| Criterion | Points | Concrete evidence to deliver | Build/pitch implication |
|---|---:|---|---|
| Problem/Solution | 20 | Specific resident problem, environmental significance, credible path from observation to review | Explain one user’s task and the solution’s limits |
| Target Market and UVP | 10 | Initial user, alternatives, why this workflow helps that user | One comparison slide; avoid “first/only” claims |
| Marketing Plan | 5 | A repeatable channel and adoption process beyond social posts/flyers | Proposed HOA documentation clinic and five-household pilot |
| Functionality | 35 | A complete, working, inspectable product demonstrated live | Allocate most engineering time to analysis, failure handling, and export |
| Team Chemistry and Presentation | 20 | Every member speaks clearly; clean handoffs | Assigned ownership and two timed rehearsals |
| Questions | 10 | Accurate, confident answers grounded in actual implementation | Practice calibration, false positives, legal scope, and source attribution |
| **Total** | **100** | | |

**Do not optimize for a longer feature list.** A judge should be able to choose a fixture, see a real change in the analysis, enter an observation, and export the matching report. This is a tangible functionality claim. A future heat map is not.

### Success criteria at submission

- [ ] One tested browser can load the bundled demonstrations and produce a report without internet access once the local app is running.
- [ ] At least one real input route works: browser microphone preferred; local WAV import is the fallback.
- [ ] Two contrasting inputs produce explainable, reproducible results through the same engine.
- [ ] Silence, clipping, and interrupted recording produce sensible states rather than confident verdicts.
- [ ] No uncalibrated result is labeled dBA, dBC SPL, safe, harmful, compliant, or a violation.
- [ ] Every sample and report visibly identifies its origin: microphone, imported file, or synthetic fixture.
- [ ] Report includes context, limitations, method version, and clickable county sources.
- [ ] Every teammate can explain their actual contribution and speaks in the pitch.
- [ ] Submission, source code, attribution, and fallback video are accessible before the deadline.

## 3. Verified legal context: reference information, not a rules engine

**Checked October 18, 2026.** A county dropdown selects an informational reference profile. It cannot determine which ordinance, approval, exemption, receiving use, or property condition legally governs an observation. Do not encode a red/green compliance comparison.

### Loudoun County

The county acknowledges missing provisions specifically addressing tonal and low-frequency noise and anticipates amendments in spring/summer 2027. Treat that as a planning expectation, not an enacted amendment or guaranteed date. A-weighting de-emphasizes bass; saying it cannot measure that sound at all is inaccurate. [County explanation](https://www.loudoun.gov/6405/Noise-Air-Quality-Concerns)

Under the current §7.05.03 table, limits depend on **receiving development**: residential/rural economy 55, mixed-use residential 60, commercial/civic/institutional 65, industrial 70 dBA, day and night. Its procedure uses a Type 1 integrating meter, FAST response, nominal 15-second samples, at least three repeatable samples, and their arithmetic average. Alternative 10-second–one-minute periods may be used when necessary. Ordinary placement is the closest receiving lot-line point, five feet above grade; mixed-use residential has a separate open-window/aperture method. Extraneous sound matters. Exemptions include specified generator operations/testing and utility activities. Applicable studies require a Virginia-licensed professional engineer; the operational study is at least one month but no more than 12 months after issuance of the first Certificate of Occupancy. This is a summary; consult the full section for exclusions and applicability. [§7.05.03, especially C, E, G](https://online.encodeplus.com/regs/loudouncounty-va-crosswalk/doc-viewer.aspx?secid=1320)

Property-specific approvals, vested rights, older ordinances applicable to some Route 28 sites/grandfathered applications, and separate incorporated-town zoning can change the governing requirements. Staff must confirm applicability. [County zoning guidance](https://www.loudoun.gov/zoningordinance)

**Routing:** Loudoun’s LEx guidance distinguishes recurring exterior lot-line concerns from sound audible indoors with doors/windows closed. Follow the county’s instructions for the relevant situation. Public portal requests may expose identifying information; review its private-request option before posting. The prototype opens the guidance page only and never files a complaint. [LEx guidance](https://www.loudoun.gov/LEX)

### Prince William County

Ordinance 25-62 was adopted **October 28, 2025**, effective **12:01 a.m. May 1, 2026**. It is a verified nearby precedent; “first in the region” was not established. [Signed ordinance](https://pwcgov.granicus.com/services/legistar/download/pdf/4103722/Ord._No._25-62.pdf)

Current §14-4 adds steady-tonal limits of **73 dBC daytime / 68 dBC nighttime**, over a **five-minute interval**, at or within a residential property boundary in a residential zoning district. These supplement ordinary A-weighted limits. Daytime generator exercising is exempt from that C-weighted provision while remaining subject to the applicable A-weighted table; other exceptions matter, including certain emergency operations and nighttime residential HVAC/radon. The appendix’s octave-band levels are advisory. [Current §14-4](https://library.municode.com/va/prince_william_county/codes/code_of_ordinances?nodeId=CH14NO_S14-4MAPESOLE)

Daytime is 7 a.m.–10 p.m. weekdays and 9 a.m.–10 p.m. weekends/county-observed legal holidays. The steady-tonal definition includes droning that may be broadband, a single frequency, or a narrow cluster, with C-weighted **Slow** response and stated stability conditions (±3 dB, or ±5 dB for perceptibly beating sources). Our peak heuristic does **not** implement this legal definition. [§14-3](https://library.municode.com/va/prince_william_county/codes/code_of_ordinances?nodeId=CH14NO_S14-3DE)

The formal procedure requires a calibrated Type 1 integrating A/C-capable meter and source-level-based assessment. Do not copy the deleted legacy three-reading/geometric-mean or automatic −3 dB procedure. Ambient audio containing traffic and speech is not automatically the level of an alleged source. [§14-7](https://library.municode.com/va/prince_william_county/codes/code_of_ordinances?nodeId=CH14NO_S14-7MEPR)

Prince William directs steady-tonal concerns to its reporting/code-enforcement process. Link the county guidance rather than guessing a submission API. [Steady-tonal noise guidance](https://pwcaws.pwcva.gov/department/public-works/steady-tonal-noise)

### Product consequences

- Loudoun and Prince William reference profiles must remain distinct. PWC standards are **context only** for a Loudoun observation.
- Unknown/other jurisdiction is a supported selection. It receives no implied county applicability.
- Five-second relative browser analysis implements neither county’s prescribed procedure.
- A report may request review and ask what formal measurement is appropriate. It must not promise an engineer visit, county acceptance, enforcement, or input into a particular amendment.
- Never automatically assign a facility as the source or label its owner noncompliant.
- Pin source URLs and a verification date in code. If sources change or fail, say so; do not silently invent replacement rules.

## 4. Acoustics corrections the whole team must understand

### 4.1 Three different questions

| Question | MVP can offer | MVP cannot establish |
|---|---|---|
| Does this recording contain substantial low-frequency energy? | An A/C-weighted spectral contrast on the captured signal | Accurate environmental bass level with an unknown microphone response |
| Is there a sustained narrow spectral peak? | A documented exploratory peak/persistence indicator | Standardized tonality, legal steady-tonal status, or human annoyance |
| Is a specific facility violating a rule? | A structured observation and source links | Source attribution, applicable-law determination, or enforcement evidence |

The environmental-noise handbook describes C−A as an indicator of a possible low-frequency problem. It is not a unique tonal signature. The proposed **15 dB threshold is an adjustable prototype screening convention**, not a universal diagnostic law and not a trigger in the reviewed PWC ordinance. [Brüel & Kjær environmental-noise handbook](https://www.bksv.com/doc/br1626.pdf)

**Counterexamples to demonstrate:** a pure 1 kHz tone has about zero C−A difference; low-frequency broadband noise can have a large difference without one isolated tone. A bass tone mixed with strong higher-frequency sound can also have a small overall gap. These are useful product behaviors, not awkward exceptions.

### 4.2 What cancels, and what does not

For the same recorded samples, multiplying the entire signal by a constant gain multiplies both weighted powers equally. Thus `10 log10(PC/PA)` is unchanged, provided the signal is not clipped and numerical precision is adequate.

That does **not** remove frequency-dependent microphone response, high-pass filtering, noise suppression, compression, automatic gain changes, wind contamination, room modes, speaker distortion, or clipping. Different spectra can produce different errors. Browser requests to disable processing do not prove that the device delivered acoustically flat raw audio. [Media Capture and Streams specification](https://www.w3.org/TR/mediacapture-streams/)

### 4.3 Units and calibration policy

**MVP mode is always `uncalibrated`.** Do not ship a calibration wizard during the seven-hour build.

- For weighted digital power `PW`, define `LW = 10 log10(PW / 1²)` and label it **weighted digital level, dB relative to RMS 1**. For short display labels use “A relative” and “C relative”; the explanatory caption must state the digital reference.
- `C−A` uses dB and may be negative. Call it **captured-spectrum C−A difference**, with “uncalibrated input” adjacent to it.
- Do not relabel these values dBA/dBC SPL or add an arbitrary offset to make them look like familiar room levels.
- A 0.1-peak digital sine has RMS about 0.07071 and unweighted level about −23.01 dB relative to RMS 1. That value says nothing by itself about acoustic SPL at the microphone.
- If another instrument’s reading is entered in notes, label it **user-reported external reading**, with instrument, units, response, duration, and calibration information. Do not merge it into browser results. This is optional manual context, not a second measurement mode.

NIOSH’s validated app and calibrated external-microphone work demonstrate that hardware, calibration, and validation matter. Its published performance cannot be transferred to this browser prototype. [NIOSH app documentation](https://www.cdc.gov/niosh/noise/about/app.html), [NIOSH external-microphone study](https://pmc.ncbi.nlm.nih.gov/articles/PMC5102154/)

For a future calibrated mode, document the microphone/interface, acoustic calibrator, gain, calibration checks before/after recording, frequency response over the intended band, level linearity, and comparison to a reference instrument. A single 1 kHz adjustment can establish a sensitivity offset under specific conditions; it does not establish low-frequency accuracy or certify the whole system.

### 4.4 Claims to remove from the briefing

| Current wording/claim | Decision |
|---|---|
| “Fingerprint of the exact noise”; gap proves low-frequency tonality | Replace with the two independent indicators above |
| Noise is unmeasurable; law is deaf to the injury | Describe a specific regulatory/measurement limitation without asserting that measurement is impossible |
| “Nothing”: no map, protocol, or evidence infrastructure | Remove. Existing apps and county reporting channels demonstrably exist |
| Any five-second result tells whose complaint deserves an engineer | Remove. No negative result should block an observation or referral |
| Near-fence “90 dB legally requires hearing protection” | Remove. An unspecified short reading does not establish occupational exposure obligations; those depend on calibrated measurements, exposure duration, workplace context, and other conditions. [OSHA §1910.95](https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.95) |
| News4 measured 90 dB, mile-away audibility, investigation causation; WUSA9 tinnitus quote | Original articles could not be directly fetched during verification. Keep out of slides/report until the originals and context are checked. Links are in the source appendix, marked unverified here |
| Virginia has more data centers than anywhere on Earth; all equipment hum is 40–500 Hz | Omit unsupported superlatives and a universal equipment-frequency range |
| Consumer speaker/microphone sweep proves calibration from 5–45 Hz and 16–24 kHz | Unverified. Sweeps mix source, room, device, and software response. At 44.1 kHz the Nyquist limit is 22.05 kHz; at 48 kHz it is 24 kHz. Do not claim validated response at the Nyquist boundary or infrasound accuracy |
| Waze analogy and acquisition price prove this business | Omit. Product adoption and data quality require their own evidence |
| “Loudoun rewrites the code in 2027” | Say anticipated, with the source date |

At roughly 343 m/s, a 100 Hz wavelength is about 3.43 m. Barriers generally attenuate higher frequencies more effectively than lower ones, but effectiveness depends on geometry and other conditions. Neither walls nor berms universally fail, and a treeline is not a calibrated mitigation experiment. Keep the neighborhood anecdote as motivation only. [FHWA barrier acoustics](https://www.fhwa.dot.gov/Environment/noise/noise_barriers/design_construction/design/design03.cfm)

## 5. Target user, distinctive value, and adoption plan

### Initial user and job

**Primary user:** a Loudoun-area resident experiencing a recurring hum who wants to document what they heard, when and where it happened, and what a follow-up reviewer should know.

**First organizer/buyer hypothesis:** an HOA or neighborhood association that can coordinate a small documentation exercise. A county reviewer is a potential recipient and feedback source, not an assumed customer, partner, or guaranteed user.

**Job to be done:** “Help me make a clear observation without pretending my phone is a certified meter.”

Do not define the market as everyone within one mile of every data center. The one-mile radius is an unvalidated acquisition assumption, not an exposure boundary. Start with people already reporting the problem and test whether the workflow helps them.

### Alternatives and honest UVP

| Alternative | Existing strength | TonalWatch’s proposed differentiation |
|---|---|---|
| [NIOSH Sound Level Meter](https://www.cdc.gov/niosh/noise/about/app.html) | Validated iOS workplace-noise measurement application; supports multiple weighting metrics | Resident-focused context, transparent limitations, and a locally referenced observation packet; no claim of superior measurement accuracy |
| [NoiseCapture](https://noise-planet.org/noisecapture.html) | Open-source Android environmental-noise measurement and collaborative mapping | A focused hum-screening explanation and county follow-up workflow; do not claim that citizen noise mapping is new |
| County portal plus phone notes/voice memo | Existing reporting pathway and free-form resident testimony | Guided context, reproducible spectral analysis, and consistent export in one flow |
| Professional acoustic assessment | Appropriate instruments, expertise, and formal methods | Accessible preliminary organization of observations; complements rather than replaces assessment |

**UVP sentence:** “We combine a transparent hum-screening explanation with a careful, source-linked resident observation packet.” This is a design claim about the prototype. Whether residents and reviewers prefer it is a pilot question.

### Marketing plan: specific steps, not a channel list

Propose a **five-household HOA documentation pilot**, explicitly not an existing partnership.

1. **Recruit through one trusted organizer.** After the event, approach one HOA/environmental committee already discussing recurring noise. Offer a 20-minute walkthrough and a one-page observation checklist. Request permission before contacting residents through that organization.
2. **Onboard five volunteers together.** Explain uncalibrated units, privacy, consistent placement, and how to record recurring times. Give one common demonstration so the group understands what the app can and cannot infer.
3. **Use a shared validated measurement kit when available.** A library/HOA lending arrangement is a proposal requiring a partner, suitable equipment, instructions, and budget. The app works without assuming that partnership; accurate SPL evaluation still needs an appropriate measurement chain.
4. **Ask for three observation sessions per household across one week**, with context and timestamps. Maintain local/private reports during the pilot. The goal is workflow learning, not a scientifically representative exposure survey.
5. **Offer a reviewer feedback session.** Ask an acoustics professional or willing agency staff member whether the fields are useful and what is missing. A requested review is not an endorsement.
6. **Revise the checklist before expansion.** Repeat the process with a second organizer only if participants can complete reports and reviewers find the information useful.

**Proposed pilot targets, not achieved results:** at least 4/5 volunteers finish an observation/export without help; at least 3/5 return for another session; measure median task time, missing context fields, and reasons for inconclusive audio; obtain at least one qualified reviewer’s qualitative feedback. Report actual denominators. Do not count complaints, flagged readings, or map pins as proof of reduced pollution.

For the pitch, describe the recruitment → group onboarding → repeat observations → review → improvement loop. A portal is a destination, not an acquisition channel.

## 6. Frozen product scope and acceptance criteria

### P0: must ship

| Feature | Required behavior | Acceptance evidence |
|---|---|---|
| Input provenance | Choose a named synthetic fixture, local WAV, or microphone | Origin remains visible through export |
| Five-second analysis | One shared PCM engine; actual sample rate recorded | Known fixture produces expected values |
| Frequency view | One spectrum plot with units, band, and method explanation | Peak location changes when input changes |
| C−A screening | Gap plus conservative explanation; no regulatory comparison | High-gap broadband counterexample behaves sensibly |
| Quality checks | Near-zero, clipping, incomplete capture, processing status | Bad input cannot yield a definitive card |
| Context form | County/unknown, location description, indoor/outdoor/unknown, recurrence notes | Empty/unknown inputs are explicit, not guessed |
| Observation export | Preview, print/save PDF, plain-text download | Export matches the currently selected result |
| Source/reference view | Dated county links and applicability warning | Links and displayed wording checked |

### P1: do if P0 is stable by 1:00 p.m.

- Reliable browser microphone capture with clear permission handling. For three/four people, pursue this in parallel from the start; for two people, prioritize the fixture/import vertical slice first.
- Sustained narrowband-peak heuristic, gated by its fixtures. If it fails, remove the verdict and retain the spectrum plus C−A screen.
- Result chart in the printed packet. Text/numerical export is enough if chart printing is unreliable.
- Short input preview meter during capture. The final result always comes from the shared engine.

### Explicit cuts

No community map; real facility pins; report aggregation; crowd corroboration; definitive source identification; severity model; chatbot; backend; login; database; automatic complaint submission; geolocation; separate mobile app; social feed; mitigation simulator; multi-county legal rules engine; professional measurement certification; hand-coded PDF layout engine. The only model experiment is the separately gated, uncertain sound-type suggestion in §13.

Keep one short “How this works” panel on the analysis page. Do not build a second educational product to explain the first one.

### Core interaction

`Choose input → capture/load → analyze → inspect indicators/quality → describe observation → preview → download/print`

A user may export an inconclusive/descriptive observation. A synthetic fixture can export only a **demonstration report**, prominently watermarked as synthetic and never presented as a real complaint.

## 7. Architecture and implementation contracts

### Recommended stack

Use the team’s familiar frontend stack. Default: **Vite + React + TypeScript**, plain CSS, a small FFT library such as `fft.js`, and Vitest for numerical tests. No runtime API key, model download, geocoding service, or server API is needed. Bundle all assets and source metadata. Use a supported installed Node version that meets the selected Vite version’s requirements; commit the lockfile and record resolved versions during the build. [Vite setup](https://vite.dev/guide/), [FFT.js API](https://github.com/indutny/fft.js), [Vitest guide](https://vitest.dev/guide/)

Example **event-time** setup, after the starting signal and any organizer clarification:

```powershell
npm create vite@latest tonalwatch -- --template react-ts
cd tonalwatch
npm install
npm install fft.js
npm install -D vitest
```

Add a `test` script (`vitest run`), retain the generated production build script, and commit `package-lock.json`. If a package lacks usable TypeScript declarations, add a small local declaration matching only the API used rather than spend the event changing the stack. Do not upgrade dependencies during the final two hours without a specific blocking reason.

### Data flow

```text
AudioWorklet microphone capture ──┐
Decoded local WAV channel ────────┼─> mono Float32 PCM + metadata
Deterministic fixture generator ──┘              |
                                                 v
                                 shared analyzePcm() in Web Worker
                                    quality → FFT/powers → indicators
                                                 |
                                                 v
                                      immutable AnalysisResult
                                                 |
                               context + dated jurisdiction reference
                                                 |
                                                 v
                              report view → print/PDF or text download
```

### Suggested file layout

```text
src/
  App.tsx                         # state machine and current session
  audio/capture.ts                # permissions, graph, cleanup, sample count
  audio/decode.ts                 # WAV decoding and channel selection
  analysis/engine.ts              # pure analyzePcm function
  analysis/weighting.ts           # A/C gain per frequency, normalized at 1kHz
  analysis/quality.ts             # input quality and validity gates
  analysis/peaks.ts               # optional exploratory persistence heuristic
  analysis/fixtures.ts            # deterministic inputs, manifest IDs
  analysis/analysis.worker.ts     # thin message wrapper
  data/references.ts              # curated text, links, verification date
  report/buildReport.ts           # pure report-model construction
  report/ReportView.tsx           # accessible, printable semantic HTML
  components/InputPanel.tsx
  components/ResultPanel.tsx
  components/ObservationForm.tsx
  styles.css
  print.css
public/
  capture-worklet.js              # small recorder processor
tests/
  weighting.test.ts
  engine.test.ts
  quality.test.ts
  report.test.ts
docs/
  RESOURCES.md                    # source ledger copied from this plan
  VALIDATION.md                   # actual device/tests/results, not claims
```

### Stable result model

Freeze this contract by 10:20 so capture, DSP, UI, and report can proceed independently:

```ts
type InputKind = 'microphone' | 'imported-file' | 'synthetic';
type Screen = 'suggested' | 'not-indicated' | 'inconclusive';
type QualityCode =
  | 'near-zero' | 'clipped' | 'near-full-scale' | 'incomplete'
  | 'unsupported-rate' | 'processing-active' | 'processing-unknown'
  | 'imported-processing-unknown' | 'non-finite' | 'no-band-power';

interface AnalysisResult {
  id: string;
  algorithmVersion: string;        // e.g. tw-screen-v1; changes with constants
  inputKind: InputKind;
  fixtureId: string | null;
  analysisCreatedUtc: string;      // device clock, not authenticated time
  recordedAtUtc: string | null;   // capture time only; unknown for old files
  sampleRateHz: number;
  sampleCount: number;
  durationSeconds: number;
  channelPolicy: 'mono-capture' | 'first-channel';
  fftSize: number;
  hopSize: number;
  analyzedBandHz: [number, number];
  frameCount: number;
  aDigitalDb: number | null;       // reference RMS 1; never dBA SPL
  cDigitalDb: number | null;
  cMinusADb: number | null;
  lowFrequencyScreen: Screen;
  peakScreen: Screen | 'not-evaluated'; // distinguish disabled from absent
  peakCandidate: null | {
    centerHz: number;
    prominenceDb: number;
    persistentFrameFraction: number; // NOT probability/confidence
  };
  qualityCodes: QualityCode[];
  deviceSettings: Record<string, unknown> | null;
  spectrum: { hz: number[]; powerDb: number[] }; // digital PSD units declared
}

interface ObservationContext {
  jurisdiction: 'loudoun' | 'prince-william' | 'unknown-other';
  locationDescription: string;    // manual; optional; no automatic GPS
  environment: 'indoors' | 'outdoors' | 'unknown';
  recurrenceNotes: string;
  conditionsNotes: string;        // wind, traffic, speech, device handling
  suspectedSourceNotes: string;   // explicitly user-reported, unverified
}
```

Do not retain a stable hardware identifier or browser fingerprint for the report. Save human-readable device information only if the user supplies it. Filter technical track settings to useful fields (sample rate, channel count, requested processing flags), excluding persistent `deviceId`/`groupId`.

### Interface functions

```ts
analyzePcm(pcm: Float32Array, fs: number, meta: InputMeta): AnalysisResult
generateFixture(id: FixtureId, fs: number): Float32Array
buildReport(result: AnalysisResult, context: ObservationContext): ReportModel
```

Use typed Worker messages `{sessionId, pcm, fs, meta}` and `{sessionId, result}`. Ignore late results from an old session. A reset cancels or supersedes analysis and clears the active result. Disable export during analysis so a new filename or context cannot accidentally be paired with an old spectrum.

`InputMeta` contains only provenance/times/fixture ID/channel policy and filtered device settings; the engine derives duration, frames, and numerical outputs from the actual PCM. `ReportModel` groups the fields in §12 plus a selected immutable reference profile. Reference objects should contain `id`, `jurisdiction`, `title`, `summary`, `url`, `verifiedAt`, and `scopeNote`; do not fetch or generate legal text at runtime.

## 8. Input acquisition: implement one trustworthy path at a time

### 8.1 Microphone path

Microphone access needs a secure context and user permission. HTTPS and `localhost` are the intended environments. Opening an HTML file directly or visiting an HTTP laptop LAN address is not the mobile demo plan. Permission can remain unanswered, so provide cancel/recovery UI. [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)

1. Start from an explicit button gesture. Create/resume the `AudioContext` there.
2. Request mono audio with `echoCancellation: false`, `noiseSuppression: false`, and `autoGainControl: false` as preferences; no video. Inspect supported constraints and the returned track’s settings. If retrying with simpler constraints, disclose the resulting processing uncertainty.
3. Use `MediaStreamAudioSourceNode → AudioWorkletNode → zero-gain node → destination` so the recorder is actively pulled without audible microphone feedback. Explicitly keep output silent.
4. The processor copies mono samples into fixed chunks and transfers them to the main thread. Do not assume render blocks are permanently 128 samples; use their actual length. Avoid per-sample messages or FFT computation inside the audio callback.
5. Discard an initial 0.5-second warm-up, then collect exactly `round(5 * context.sampleRate)` samples. Use actual PCM sample count for duration, not only a timer animation.
6. Attach a monotonically increasing sample index to each transferred chunk. Detect gaps and end/visibility interruptions. If the graph is suspended, record ends early, or chunks are lost, mark incomplete instead of silently padding a successful capture.
7. Slice the final chunk precisely at the target count, stop all media tracks, disconnect nodes, and close the context in success/error/cancel paths. Handle React unmount cleanup.
8. Transfer the resulting PCM to the analysis worker. The first version may show only capture progress and analyze after the five seconds. An optional preview must not determine final results.

Capture errors need human-readable actions: permission denied → choose demo/file or browser permission settings; no microphone → demo/file; device busy/unreadable → retry or alternate input; ignored prompt → cancel remains available. If access is granted after cancellation, immediately stop the late stream.

For the two-person fallback, omit the worklet rather than replace it with a misleading interval of repeated `AnalyserNode` snapshots. For three/four people, budget one hour for capture integration before deciding whether to keep it.

### 8.2 Local audio import

Support PCM WAV as the guaranteed demonstration format. Other decodable formats are best effort and must fail gracefully. Limit file size to 10 MB, decode locally, select the **first channel**, and state that channel policy; averaging antiphase stereo could cancel useful audio. Use the decoded buffer’s sample rate. `decodeAudioData` can resample into the decoding context’s rate, so record the effective rate and do not claim preservation of the original encoding. [MDN decoding documentation](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData)

Analyze the first five seconds after an explicit start/crop choice; for MVP the choice can be fixed at offset zero and labeled. Reject shorter files with a clear explanation; do not loop them to fake five seconds. Imported files have unknown original recording time, acoustic calibration, and processing unless documented separately. The file-selection time is not the event time.

### 8.3 Synthetic input

Generate PCM arrays locally and call the same engine directly. This bypasses speakers, microphones, room acoustics, and permissions. Badge: **SYNTHETIC DEMO — validates software behavior, not field accuracy**. Optional audible playback requires an explicit play click, starts quiet, and is never necessary for the result.

## 9. Numerical engine: exact implementation specification

This is a transparent prototype spectral estimator. It is not an IEC-compliant sound level meter, a standardized tonality analysis, or a simulation of the counties’ FAST/Slow procedures.

### 9.1 Constants and preprocessing

```text
target analyzed duration = 5.0 s
FFT size N = 8192
hop H = 4096 (50% overlap)
window = periodic Hann: w[n] = 0.5 - 0.5*cos(2πn/N)
power integration band = [20 Hz, min(20000 Hz, fs/2)]
near-zero RMS threshold = 1e-5 (digital reference 1; engineering guard only)
clipping threshold = abs(sample) >= 0.999
invalid clipping fraction = >= 0.001 (0.1%)
near-full-scale warning = peak >= 0.98 or any clipping-threshold sample
low-frequency screening threshold = C-A >= 15.0 dB
```

Support 44.1 and 48 kHz as the tested rates. Other rates return `unsupported-rate` until tested; do not accidentally interpret bins as though every stream were 48 kHz. At 48 kHz, bin spacing is about 5.859 Hz and there are 57 complete frames in five seconds. At 44.1 kHz there are 52 frames. Keep only complete frames; report the number and do not silently zero-pad the tail into extra evidence.

Reject non-finite samples before doing any arithmetic. Measure clipping and peak/RMS on the original samples. Remove each frame’s arithmetic mean before windowing to suppress DC. This does not constitute an acoustic high-pass calibration. The near-zero guard detects effectively empty digital input; it cannot measure the microphone’s acoustic noise floor.

### 9.2 FFT and power normalization

Let the FFT be **unscaled forward DFT** of the windowed frame:

```text
U = Σ[n=0..N-1] w[n]^2
X[k] = FFT((x[n] - frameMean) * w[n])
q[k] = 1 at DC and Nyquist; 2 at other positive-frequency bins
PSD[k] = q[k] * |X[k]|² / (fs * U)        # digital amplitude² / Hz
Δf = fs/N
f[k] = k * Δf
```

If the chosen FFT uses another normalization, adapt this formula and prove it with Parseval tests. Do not average FFT magnitudes or dB values. Average **linear PSD** across equal-length frames, then weight/integrate and take logarithms. Equivalent: calculate frame weighted powers and average those powers.

For an `fft.js` real transform, the output is interleaved real/imaginary values; use the positive-frequency bins and verify DC/Nyquist treatment. The wrapper must have its own tiny tests so a complex-array indexing error cannot survive behind a good-looking chart.

### 9.3 A and C weighting

Use the conventional analog response shapes as a frequency-domain approximation, normalized to unity at 1 kHz. With `f` in Hz and constants `f1=20.598997`, `f2=107.65265`, `f3=737.86223`, `f4=12194.217`:

```text
RA(f) = f4² f⁴ /
        ((f²+f1²) * sqrt((f²+f2²)(f²+f3²)) * (f²+f4²))
RC(f) = f4² f² / ((f²+f1²)(f²+f4²))
gA(f) = RA(f) / RA(1000)
gC(f) = RC(f) / RC(1000)
A(f) = 20 log10(gA(f))
C(f) = 20 log10(gC(f))
```

At DC set both gains to zero. Precompute per-bin squared gains for each tested sample rate. The usual approximate tabulated A/C responses are a useful independent cross-check. This implementation uses normalized formulas; small differences from rounded tables are expected. [NTi explanation and weighting table](https://www.nti-audio.com/en/support/know-how/frequency-weightings-for-sound-level-measurements), [conventional response equations](https://www.cross-spectrum.com/audio/weighting.html)

```text
PA = Σ[in-band k] meanPSD[k] * gA(f[k])² * Δf
PC = Σ[in-band k] meanPSD[k] * gC(f[k])² * Δf
LA_digital = 10 log10(PA)
LC_digital = 10 log10(PC)
gap = 10 log10(PC/PA)
```

The squared gains matter: adding a dB correction to a bin is equivalent only if the subsequent power aggregation is done correctly. Do not average octave-band dB values or compute the gap from independently timed A/C captures. Keep the signed gap and full precision internally; display one decimal place.

Use nullable results for absent/invalid power. Do not convert `-Infinity` into a plausible level or use an epsilon to manufacture a meaningful gap from silence. A small numerical floor may protect plotting, but it must not drive interpretation.

The Web Audio `AnalyserNode` includes windowing, smoothing, and dB conversion behavior. It is suitable for a preview; this plan’s final metrics come from controlled PCM analysis so those hidden choices do not become measurement assumptions. [Web Audio specification](https://www.w3.org/TR/webaudio/)

### 9.4 Low-frequency screening logic

```text
hard input failure (non-finite / incomplete / unsupported / near-zero / clipped)
    OR PA/PC is non-finite, zero, or absent after band integration
    => screen=inconclusive, interpretation unavailable
otherwise:
    gap >= 15 => screen=suggested
    gap < 15  => screen=not-indicated
```

Processing active/unknown is a **warning**, not proof of usable field accuracy. Keep the numerical captured-signal result visible but always qualify its environmental interpretation. Do not invent a probability or a “95% confidence” badge.

A constant DC signal can pass the original-sample RMS guard yet have no power after frame mean removal. Mark that `no-band-power`, return null levels/gap, and keep both screens inconclusive. A disabled/unimplemented peak feature returns `peakScreen='not-evaluated'`, distinct from a completed test with no candidate.

### 9.5 Optional sustained narrowband-peak heuristic

Only enable the result badge after the test fixtures pass. Keep the spectrum if the heuristic is removed.

1. For each frame, inspect local maxima from **40–2000 Hz**. That search range is a prototype choice; peaks outside it are not evaluated.
2. For candidate bin `k`, define `core = sum(PSD[k−1..k+1])`. Background is the median of bins `k−6..k−3` and `k+3..k+6`, clipped to the analysis band; require at least four background bins in total.
3. Require `10 log10((core/3) / max(background, 1e-20)) >= 12 dB` and `core / sum(PSD[k−6..k+6]) >= 0.60`, using valid bins. These are engineering heuristics, not an acoustic standard. The background floor only protects this peak calculation; it must not manufacture a gap from silence.
4. For each possible center bin, count frames containing a qualifying candidate within ±1 bin. Collapse overlapping tracks, prefer greatest persistence, and break ties by median prominence. Report the median **actual candidate** frequency, not the lower edge of a search cluster. At 48 kHz a 63 Hz tone may appear at approximately 64 Hz; show the 5.859 Hz resolution.
5. Require at least 20 complete frames and presence in at least 80% of **all complete recorded frames**, including silent/no-candidate frames. Never exclude silence from the denominator and turn a short beep into a sustained result. Corrupt/incomplete/clipped recordings fail the overall quality gate rather than quietly losing inconvenient frames. Report the median prominence and descriptive frame fraction; overlapping frames are correlated, so that fraction is **not** statistical confidence.
6. In numerical reference checks with the fixed fixtures, pure tones and the mixed-tone case persisted throughout; the LF broadband fixture's largest candidate cluster appeared in only 2/57 frames. This supports the demonstration cases, not a general field-accuracy claim. If a strong broadband floor or processing artifact defeats the test, return no reliable peak candidate. Absence does not prove a non-tonal environment.

Tune only against the predefined fixture set, record changed constants under a new algorithm version, and keep the known failure cases visible. Do not call this “ISO tonality,” “DIN tonality,” or the PWC steady-tonal definition.

### 9.6 Interpretation copy

| Captured-signal outcome | User-facing text |
|---|---|
| Large gap + sustained peak | “Low-frequency contribution suggested; a sustained narrowband peak is also present in this recording.” |
| Large gap + no reliable peak | “Low-frequency contribution suggested. This does not by itself indicate a tone.” |
| Small gap + sustained peak | “A sustained narrowband peak is present; the C−A difference is below this prototype’s bass-screen threshold.” |
| Small gap + no reliable peak | “Neither indicator was strong in this short recording. This does not rule out recurring or device-missed noise.” |
| Invalid/very limited input | “Recording is inconclusive. You can retry or export a descriptive observation.” |

Under every card: **“Uncalibrated screening only. No source identification or legal-compliance determination.”**

If peak analysis was cut or disabled, replace all combined-indicator language with the low-frequency result alone and “Sustained-peak analysis was not evaluated.” Never use a missing implementation as a negative finding.

## 10. Reproducible demonstrations and numerical goldens

Use two types of validation: **analytic/reference expectations** for DSP, and **software-generated contrasting scenarios** for the product story. Neither proves field accuracy.

### 10.1 Fixture manifest

All fixtures use mono floating-point PCM, five analyzed seconds, `fs=48000` unless a rate test says otherwise. `t=n/fs`. Do not peak-normalize individual fixtures unless specified; keep their construction explicit.

| ID | Definition | Expected behavior |
|---|---|---|
| `sine-63` | `0.1*sin(2π*63*t)` | Large gap; persistent peak near 63 Hz |
| `sine-125` | `0.1*sin(2π*125*t)` | Gap just above 15; persistent peak |
| `sine-1000` | `0.1*sin(2π*1000*t)` | Approximately zero gap **despite a clear tone** |
| `mixed-63-1000` | `0.1*sin(2π*63*t)+0.1*sin(2π*1000*t)` | Small gap despite the bass component; avoid claiming absence |
| `hum-harmonics` | `0.1*sin(2π*63*t)+0.04*sin(2π*126*t)+0.02*sin(2π*189*t)` | Large gap and sustained peaks |
| `lf-broadband` | Seeded noise through two 40 Hz one-pole low-pass stages, below | Large gap; should not produce a persistent isolated-peak badge |
| `white-noise` | Same seeded uniform generator, RMS-normalized to 0.05 | Broad spectrum; no persistent isolated peak; gap below 15 |
| `short-burst` | 1 kHz sine at 0.1 peak only from `t=2.0` to `<2.2` | No sustained peak across 80% of frames |
| `silence` | All zeros | Null levels/gap; inconclusive |
| `clipped` | `clip(2*sin(2π*125*t), -1, 1)` | Clipping gate overrides interpretation |

### 10.2 Deterministic noise recipe

Implement this recipe during the event in `fixtures.ts`. Use unsigned 32-bit xorshift state initialized to `0x08042026`, identical each regeneration:

```ts
let state = 0x08042026 >>> 0;
function uniformNoise(): number {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  state >>>= 0;
  return 2 * (state / 4294967296) - 1;
}
```

For `lf-broadband`, generate **seven** seconds using `alpha=exp(-2π*40/fs)`:

```text
s1 = 0; s2 = 0
for every generated sample:
    u = uniformNoise()
    s1 = (1-alpha)*u + alpha*s1
    s2 = (1-alpha)*s1 + alpha*s2
    save s2
discard first 2 seconds
subtract arithmetic mean of retained 5 seconds
scale entire retained array to RMS 0.05
convert final samples to Float32
```

For `white-noise`, generate five seconds directly, subtract its mean, scale to RMS 0.05, and convert to Float32. Reset the seed for each fixture. Do not use `Math.random()` for tests. If a fixture is saved as WAV, record whether quantization changed it and maintain separate tolerances for decoded WAV versus Float32 generation.

### 10.3 Reference values

The following values were numerically checked for the specified normalized curves. Analytic values assume ideal pure components; the finite-window engine differs slightly because energy spreads across neighboring bins.

| Fixture | Analytic C−A, dB | Reference spectral result, dB (48 kHz, N=8192) | Initial acceptance tolerance |
|---|---:|---:|---|
| `sine-63` | 25.3992 | 25.3340 | ±0.15 from spectral reference; within 0.5 of analytic |
| `sine-125` | 16.0162 | 16.0090 | ±0.15 |
| `sine-1000` | 0.0000 | 0.00003 | ±0.10 |
| `mixed-63-1000` | 2.6090 | 2.6062 | ±0.15 |
| `hum-harmonics` | 20.4524 | 20.4287 | ±0.15 from spectral reference |
| `lf-broadband` | Not a single-frequency analytic case | Approximately 22.1355 | ±0.20 with the exact recipe; investigate deviations |

For mixtures, independently calculate `10 log10(Σ ai²*gC(fi)² / Σ ai²*gA(fi)²)`; the common sine factor 1/2 cancels. Never average the components’ dB gaps. At 44.1 kHz, compare to the analytic expectation with a 0.5 dB allowance and record a separate numerical golden after checking the implementation; do not force the 48 kHz window result to match exactly.

### 10.4 Judge demonstration sequence

1. Load `white-noise`: broad spectrum and no sustained-peak badge.
2. Load `hum-harmonics`: visible peaks, larger gap, qualified interpretation.
3. Load `sine-1000` briefly: clear peak with almost zero gap. Say, “That is why subtraction alone is not a tone detector.”
4. If asked, load `lf-broadband`: high gap without a sustained isolated peak. This is the complementary counterexample.
5. Enter sample context, select Loudoun references, and print/download a **synthetic demonstration report**. Show the provenance label and links.
6. Optionally capture five seconds of the actual room. Present the actual result, even if inconclusive or mundane. Never promise that a noisy hall will produce a specific gap or detection.

A speaker-to-microphone demo is optional audience engagement, not the reproducible proof. Small speakers can fail to reproduce bass, and rooms/devices can reshape it. Digital injection is the primary controlled demonstration.

## 11. Pages, routes, features, and UI behavior

### Page map

Use a single React application with hash navigation (`#/`, `#/measure`, `#/report`, `#/sources`) so a static host needs no custom route rewrites. A small hash-state hook is sufficient; a router already familiar to the team is also acceptable. Keep results/context in a top-level session store using React state or a reducer; no state-management library is required.

| Page / route | Components and features | Primary action | Empty/error state |
|---|---|---|---|
| **Home** `#/` | One-liner, resident use case, three-step flow, privacy/uncalibrated note, link to sources | “Try a synthetic demo” or “Start an observation” | Never requests mic on page load |
| **Measure** `#/measure` | Input tabs (Demo / Microphone / File), capture progress, spectrum, independent indicators, quality banner, context form, inline method explanation | “Review observation” | Retry, choose demo/file, or export description when inconclusive |
| **Report** `#/report` | Read-only preview from the active result/context, provenance banner, limitations, dated references, print and text-download buttons | “Print / save PDF” | Direct navigation without a session shows “Create an observation first” |
| **Sources & Method** `#/sources` | County profiles, method/units, version/date, limitations, links, source status | Return to active session | External-link failures do not prevent core analysis |

If routing/polish slips, Home and Sources may be sections on the Measure page. Preserve the functional input → results → report flow. Do not add Map or Learn routes.

### Measure page layout

```text
TonalWatch                       [Sources & method]
Record a short observation. Describe what you heard.

[ Demo ] [ Microphone ] [ File ]      Origin: SYNTHETIC DEMO / REAL INPUT
[Choose fixture ▼] [Analyze]          or [Start 5-second capture]

[Quality banner: uncalibrated; processing unknown / warnings]

Frequency spectrum                   [C−A difference: 20.4 dB]
Frequency (Hz, log scale)             [Low-frequency screen: suggested]
Digital PSD (dB re 1²/Hz)             [Sustained peak: candidate ≈64 Hz]

Interpretation + limitations          [How this works ▾]

Observation context
County [Unknown/Other ▼]   Setting [Unknown ▼]
Location description [optional]       Recurrence / conditions [notes]
Suspected source [optional; user-reported and unverified]

[Review observation] [Clear session]
```

Avoid a giant “danger” dial. The important comparison is between frequency content, two separate indicators, and recording quality. A compact gap bar is optional, with no legal threshold scale.

### UI state machine

```text
idle → permission-pending → warming-up → recording → analyzing → ready
  └───── file/demo selection ────────────────────────┘
any active state → canceled/error → idle or alternate input
ready → edit context → report preview
new input / reset → clear prior result → new session ID
```

Capture progress reflects sample count; it is not a fake signal-strength animation. Disable double-start and conflicting input changes while recording. A cancel button remains active. Preserve typed context when retrying a capture, but clear input-specific results and AI suggestions.

### Visual and accessibility requirements

- Use a light, high-contrast layout, large type, and clear normal-language explanations. The judge should understand the primary result from a few feet away.
- Use neutral/blue for information, amber for limitations, and red for actual recording failure. Do not use red to imply a source is illegal.
- Keyboard-operable controls; explicit form labels; visible focus; status announcements via an appropriate live region; text alongside color.
- Spectrum: log-frequency x-axis, digital PSD y-axis, plotted analysis band, approximate peak label, and frequency-resolution caption. Do not call a PSD bin height “sound pressure level.”
- A fixed synthetic badge persists when switching pages and printing. Imported files have a separate “recording context unknown” label.
- No autoplay. No external fonts or runtime chart CDN needed. SVG is sufficient for the spectrum and easier to print than a complex chart package.
- Responsive enough for laptop and phone screens, but promise only browsers actually tested. Desktop Chromium is the primary judging target; mobile is a bonus.

## 12. Observation packet: useful, conservative, and reproducible

### Report fields

The report model is derived once from the immutable result plus current context. Use the same model for HTML and plain text.

1. **Title:** “TonalWatch noise observation — screening only.” Synthetic reports begin “SYNTHETIC DEMONSTRATION — NOT A FIELD OBSERVATION.”
2. **Origin:** microphone / imported file / synthetic fixture ID. Never infer field provenance from a filename.
3. **Times:** recorded-at if known; analysis/export time separately; UTC ISO values and human-readable Eastern time with zone/offset. Explain that device clock timestamps are not authenticated. Imported recording time is “not established” unless manually supplied and labeled as such.
4. **Context:** manual location, environment, recurrence, conditions, and optional suspected-source notes. Mark omitted fields “not provided”; source notes are unverified resident statements.
5. **Method:** actual duration, effective sample rate, channel policy, FFT/window/hop, analysis band, frame count, algorithm version, and uncalibrated status.
6. **Observed outputs:** A/C weighted digital levels with defined reference, captured-spectrum difference, independent peak candidate if enabled, and quality flags. Null values print as “unavailable,” not zero.
7. **Interpretation:** the qualified copy in §9.6. Include the threshold and experimental status; no safety or enforcement verdict.
8. **Limitations:** input response/processing unknown, short duration, ambient sources not separated, no certified instrument, no legal procedure replicated, no source identification.
9. **Jurisdiction references:** the selected informational profile plus verification date and full URLs. For unknown/other, say applicability was not evaluated.
10. **Requested next step:** neutral request for the recipient to advise on appropriate follow-up and any required measurement.

### Reusable report wording

```text
I am documenting a recurring sound as described in the observation notes.
The attached TonalWatch output is a short, uncalibrated screening analysis
of the recorded signal. Its numerical values are relative digital values,
not certified sound-pressure measurements.

The result does not establish a source, an ordinance violation, or the
applicability of a particular property requirement. A weak or inconclusive
indicator does not rule out an intermittent or device-missed sound.

Please advise whether further review is appropriate and which measurement
procedure or qualified professional, if any, is needed for this situation.
The county references are supplied for context and should be confirmed by
the responsible agency.
```

For synthetic input, replace the resident request with: “This report demonstrates the software workflow using generated audio. It is not intended for complaint submission.” Do not insert a real facility name or location into the synthetic example.

### Export implementation

- Print the report route using `window.print()` and dedicated print CSS; the browser’s Save as PDF is the PDF path. Do not promise a silent/direct PDF download.
- Include print margins, wrapped URLs, black text, page-break controls around small result blocks, and a synthetic header on every printed page where feasible.
- Keep a **Download text** fallback using a UTF-8 `Blob`, a temporary object URL, and a sanitized filename such as `tonalwatch-observation-YYYYMMDD.txt`. Revoke the object URL afterward.
- Native React text rendering escapes user content. Never interpolate notes into raw HTML, execute imported content, or allow arbitrary source links in the template.
- If SVG export fails, print text and the result table; do not delay submission for chart layout.
- Do not attach raw audio by default. An optional locally generated PCM WAV download can be added only after the report works and the user explicitly chooses to retain audio.

## 13. Optional AI stretch: light-fixture buzz versus outdoor equipment hum

**Requested stretch feature:** help a user explore whether a recording resembles a nearby light-fixture buzz or outdoor commercial electrical/mechanical equipment. The honest feature is **sound-type suggestions**, not a model that “knows the source.”

Similar tones and harmonics can come from multiple devices, and a recording may contain several sources. Indoor/outdoor context is user-provided. Neither AI nor proximity to a facility proves where the noise originated. Keep the deterministic analysis authoritative about its own numerical outputs; the model cannot override quality flags or convert them into a legal conclusion.

### Go/no-go gate

Attempt only if all P0 requirements work by **1:15 p.m.**, the core tests pass, and one person can spend **at most 45 minutes** without delaying microphone/report QA. The eight-recording contrast set and its license/provenance notes must already be available at that gate, assembled during the event under the organizer's asset rules. D may check asset availability only after core integration is on track; if suitable clips are missing, skip the model rather than spend the slot searching. Best for a four-person team; normally skip for two people. Stop by **2:00 p.m.** if the model cannot run reliably and pass the small contrast set. The project remains complete without it.

### Preferred technical experiment

Use a pretrained **CLAP audio-text model** through `@huggingface/transformers`, with `Xenova/clap-htsat-unfused` as a concrete browser-compatible candidate. Its published example supports zero-shot audio classification against candidate text labels. This verifies that the API exists; it does not verify this particular discrimination task. Pin the resolved package and model revision if the experiment is retained. [Model card](https://huggingface.co/Xenova/clap-htsat-unfused), [Transformers.js pipeline API](https://huggingface.co/docs/transformers.js/v3.8.1/en/api/pipelines#module_pipelines.ZeroShotAudioClassificationPipeline)

The model configuration uses 48 kHz audio, a ten-second maximum/chunk, and repeat-padding for shorter clips; its feature range starts at 50 Hz. Feed a separately resampled copy of the PCM and preserve the core DSP input unchanged. Record padding/preprocessing rather than claiming five seconds became ten seconds of observation. This model is not a substitute for the lower-frequency DSP screen. [Model preprocessing configuration](https://huggingface.co/Xenova/clap-htsat-unfused/blob/main/preprocessor_config.json)

Implement the resampling helper outside the model worker: create a mono `AudioBuffer` at the real input rate, render it through an `OfflineAudioContext` targeting 48 kHz for `ceil(inputLength*48000/inputRate)` samples, and send the resulting Float32 channel to the model worker. Already-48-kHz input needs only a copy. Do not reinterpret a 44.1-kHz array as 48 kHz; that changes both apparent pitch and duration. Let the pinned model processor apply its documented short-clip padding, and log that transformation.

Suggested candidate descriptions, fixed before evaluating the demonstration clips:

```ts
const labels = [
  'a buzzing indoor fluorescent light fixture or lamp ballast',
  'an outdoor electrical transformer humming',
  'outdoor industrial ventilation fans or cooling machinery humming',
  'a household fan or air conditioner running',
  'road traffic passing outside',
  'wind blowing across a microphone',
  'people talking in a room',
  'a quiet room with background noise',
];
```

Include alternatives rather than forcing a binary choice. An “unknown” text label alone does not create reliable rejection; the application must be able to abstain independently.

Event-time integration sketch:

```ts
import { pipeline } from '@huggingface/transformers';

// Lazy-loaded in a separate worker after an explicit user click.
const classify = await pipeline(
  'zero-shot-audio-classification',
  'Xenova/clap-htsat-unfused',
);
const rankings = await classify(pcmResampledTo48000, labels);
// Treat scores as label-set-relative model scores, not calibrated probabilities.
// Dispose the pipeline when the optional feature is unloaded.
```

Before enabling it, inspect actual download size/license, cold-start time, memory use, and latency on the judging laptop. Model files may be substantial. Prefer the compatible WASM/default path; do not spend the event debugging WebGPU. Use only quantized artifacts actually available and tested for the pinned model. A first successful model load is a feasibility spike, not completion.

### Feature/UI integration

- Feature flag defaults off. Add `ai/soundHints.worker.ts`, `ai/labels.ts`, and a small `SoundHintsPanel` beneath the deterministic result; no new page.
- Explicit action: **“Explore possible sound types (experimental)”**. Explain the model download before starting it.
- Lazy-load package/model once; reuse the model; show progress, cancel, error, and unavailable states. Never delay standard report export while AI is loading.
- Keep raw audio on the device. Downloading a model must not turn into uploading a recording. Check browser network activity before making that privacy claim.
- Reuse retained PCM or make a copy before transferring it to the DSP worker; transferring an `ArrayBuffer` can detach the sender’s copy. Clear retained audio/model results on session reset and ignore late AI messages by session ID.
- Show at most two suggestions with **relative model scores**, plus “These are possible sound resemblances, not confirmed sources.” Do not present percentages as “probability this is a data center.”
- Initial abstention rule for experimentation: no hint on invalid/near-zero/clipped input; otherwise require top score ≥0.55 and margin over second ≥0.20. These are provisional UI gates, not calibrated confidence thresholds. If validation cannot support them, always show the ranked alternatives under an uncertain heading or remove the feature.
- Do not combine indoor/outdoor self-report with the model’s raw score and then claim the audio independently determined the setting.
- Keep AI suggestions out of the complaint/observation report by default. If later included, preserve model ID/revision, label set, preprocessing, experimental status, and uncertainty as a separate appendix.

### Mini-evaluation and kill criteria

Prepare an **eight-recording contrast set** only from original, permissioned, or appropriately licensed audio: two distinct light-fixture recordings; two distinct known outdoor equipment recordings; one household HVAC/fan; one traffic/wind; one speech; one quiet/unknown clip. Record source and recording conditions. Never split a single recording into train/test excerpts and call them independent examples. No training is needed for the stretch experiment.

Keep labels fixed while evaluating; log rankings, abstentions, and errors. Check at least two prompt phrasings during development, then freeze one for demonstration. This small check cannot establish general accuracy.

Keep the feature only if it runs on the target laptop, gives at least one sensible hint for each requested category, handles unrelated/quiet clips without a confident source assertion, and completes repeated warm inferences within a measured acceptable demo budget (target under ten seconds). If it confuses the categories, produces confident wrong hints, downloads unreliably, or destabilizes the core app, hide it and explain the future validation work on the roadmap.

**Fallback:** preserve the spectrum/peak analysis and ask the user to describe nearby possible sources. Do not train a new classifier during this event. A future targeted model would need independently labeled recordings across many devices, environments, equipment types, distances, weather conditions, and confounders, with source-grouped held-out evaluation and an explicit unknown class/rejection policy.

## 14. Implementation tickets and integration order

Assign names at check-in. **A = DSP**, **B = capture/UI**, **C = report/sources**, **D = QA/product/pitch**. Everyone contributes to implementation and testing; D is not excluded from building.

Estimates are focused effort, not guaranteed durations. Workstreams run in parallel. Integrate small increments into one working branch rather than leave four isolated components until late afternoon.

| Ticket | Priority / owner | Estimate | Dependency | Definition of done |
|---|---|---:|---|---|
| T0: rules, track, contribution boundaries | P0 / all | 10–15 min | Organizer access | Pre-event code decision and track recorded; no assumed permission |
| T1: scaffold, types, session reducer | P0 / B+D | 20–30 min | Start signal | App runs; result/context contract committed; empty pages navigate |
| T2: curves and FFT wrapper | P0 / A | 40–50 min | T1 types | 1 kHz normalization, PSD scale, sine tests pass |
| T3: deterministic fixtures and Worker | P0 / A+D | 30–40 min | T2 | Fixtures analyzed through real engine; correct origin/values |
| T4: WAV import | P0 / B | 20–30 min | T1 | Valid file works; short/invalid file fails cleanly |
| T5: microphone worklet | P1, parallel / B | 45–60 min | T1 | Exact sample count; cancel/deny/cleanup tested |
| T6: result view and quality states | P0 / B+D | 30–45 min | T3 | Spectrum/gap respond to input; null/clipped states readable |
| T7: context and source metadata | P0 / C | 30–40 min | T1 | Profiles scoped; unknown supported; notes escaped |
| T8: printable/text report | P0 / C | 45–60 min | T7 + result contract | Current session exports accurately; synthetic watermark survives |
| T9: sustained peak candidate | P1 / A | 30–40 min | T3 | Tone/broadband/burst contrast tests pass or badge disabled |
| T10: full-flow and device QA | P0 / D+all | 45–60 min | T4/T6/T8 | Manual matrix completed with actual results |
| T11: optional AI sound hints | Stretch / free owner | ≤45 min | P0 green by 1:15 | §13 gate/evaluation passed; isolated flag; otherwise cut |
| T12: pitch, recording, submission | P0 / all | 60–75 min | Stable build | Timed pitch, all members speak, video/source/submission verified |

**First integration target:** fixture → numerical result → context → text report. A visually plain working slice is the foundation. Add graph polish and live capture around it.

## 15. Seven-hour schedule and team-size variants

### Before 10:00: preparation and rules check

- Bring this plan, charged equipment, charger, and any necessary adapters. Research, architecture, and wireframes are preparation; do not assume prewritten TonalWatch code is allowed.
- Confirm track, team registration, AI-use disclosure requirements, existing-library/audio-asset policy, submission fields, presentation format, and handling of the reported October 17 spikes.
- Designate one demo laptop and one backup operator. Choose the familiar stack and assign owners.
- Record permitted starting materials and AI/library/model attributions honestly. Do not backdate commits or imply pre-event work was built today.

### Build window: 10:00 a.m.–5:00 p.m.

| Time, Eastern | A: DSP | B: capture/UI | C: report/sources | D: QA/product | Exit gate |
|---|---|---|---|---|---|
| 10:00–10:20 | Agree algorithm/fixtures | Scaffold and reducer | Scope references | Rubric/rules checklist | Shared contracts and one running app |
| 10:20–11:00 | Curves, FFT, quality | Page shell, WAV import; start mic | Context fields, curated sources | Fixtures/test skeleton; pitch outline | First numeric sine result |
| 11:00–11:30 | Goldens and Worker | Hook input to result view | Text report from contract | End-to-end integration | Fixture → result → text export works |
| 11:30–12:15 | Peak heuristic if stable | Mic cleanup and spectrum | Print styles and report preview | Browser/failure cases; source check | One real input path works; print usable |
| 12:15–1:00 | Numerical edge tests | Finish core state handling | Unknown county/privacy/provenance | Full-flow QA; eat/rotate breaks | All P0 complete; no missing report path |
| 1:00–1:15 | Fix core defects | Fix core defects | Fix core defects | Decide optional feature gate | AI allowed only if core is already green |
| 1:15–2:00 | Optional AI only with free owner; otherwise hardening | Reliable demo input | Report verification | Contrast testing and first rehearsal | Stop AI spike at 2:00; decide mic/peak cuts |
| 2:00–3:00 | Final numerical regression | Accessibility/responsive cleanup | Sources and exported copy review | Final manual matrix; prepare submission | **3:00 feature freeze** |
| 3:00–3:40 | Explain actual method | Run cold start/backup | Verify print/text | Full pitch rehearsal; Q&A drill | Pitch ≤4:40 and all members speak |
| 3:40–4:15 | Only blocking fixes | Record fallback video | Final README and attribution | Fill submission; verify links | **Submit by 4:15** |
| 4:15–5:00 | Keep stable build | Check submitted artifact access | Backup local files | Final rehearsal; logistics | No new features; hard cutoff 5:00 |

Build time is seven hours. Planning for submission at 4:15 deliberately reserves 45 minutes for upload/network problems and presentation readiness. If the official submission form is unavailable at 4:15, save the final artifacts and submit as soon as it opens; keep the stricter deadline in view.

### Team-size adaptations

| Team | Assignments | Scope adjustment |
|---|---|---|
| 4 people | A DSP; B input/UI; C report/sources; D QA/integration/pitch | Most realistic path to live mic plus peak screen; optional AI only after core passes |
| 3 people | A DSP+tests; B capture/UI; C report+QA/pitch | Drop AI by default; simplify visual styling; share integration tests |
| 2 people | A DSP+input; B UI+report+sources; both test and speak | Start with local file/fixture flow; microphone and peak badge are conditional; no AI |
| Solo | One fixture/import flow, spectrum/gap, source links, text/print report | Drop mic, peak verdict, AI, separate Home; present implementation honestly |

No one spends the whole event on slides while others build. Every person owns a concrete product contribution and can demonstrate it. Use short integration check-ins around 11:00, noon, 1:00, and 3:00; avoid repeated whole-team redesigns.

## 16. QA and tests: what must actually be checked

Keep `docs/VALIDATION.md` as a concise table of test, input/device/browser, expected result, observed result, pass/fail, and unresolved issue. Record actual outcomes; do not copy this checklist as proof of passing.

### Numerical tests

| Test | Expected assertion |
|---|---|
| Weighting normalization | A(1000) and C(1000) equal zero dB within numerical tolerance |
| Weighting sanity | 63/125 Hz response contrasts match independent formula/table checks |
| FFT normalization | Full-band PSD integral equals the window-weighted mean square within tolerance; known unweighted sine approaches amplitude²/2 |
| Goldens | §10.3 values within stated tolerances, with exact method/constants |
| Gain invariance | Halving a nonclipped waveform lowers each digital level by 6.0206 dB; gap remains unchanged |
| Average in power | Unequal-energy frame mixture matches linear-power reference, not arithmetic mean of dB |
| Silence / DC | Zero and constant-only inputs yield no meaningful in-band gap after DC removal |
| Non-finite input | NaN/Infinity rejected before FFT; no crash or successful report values |
| Sample-rate correctness | Regenerated 44.1/48 kHz tones appear at the correct frequency; no hardcoded-rate drift |
| Off-bin frequency | 100 Hz and 997 Hz inputs remain interpretable within frequency resolution/leakage tolerance |
| Mixed spectra | 63+1000 Hz can have a small overall gap; no “no bass” conclusion |
| High-gap broadband | LF noise has a large gap without the sustained-peak badge |
| Persistence | 0.2-second burst and single impulse do not become sustained across five seconds |
| Clipping | Saturated fixture produces inconclusive interpretation regardless of a large gap |

Meaningful minimal test shape:

```ts
const x = generateFixture('sine-63', 48000);
const r = analyzePcm(x, 48000, syntheticMeta('sine-63'));
expect(r.cMinusADb).not.toBeNull();
expect(Math.abs(r.cMinusADb! - 25.333959)).toBeLessThan(0.15);

const half = Float32Array.from(x, value => value * 0.5);
const r2 = analyzePcm(half, 48000, syntheticMeta('half-sine-63'));
expect(Math.abs(r2.cMinusADb! - r.cMinusADb!)).toBeLessThan(0.01);
expect(Math.abs((r2.aDigitalDb! - r.aDigitalDb!) + 6.0206)).toBeLessThan(0.02);
```

Do not expand tests into a framework project. Protect the calculations, provenance, and failure states that would materially mislead a user.

### Browser and workflow matrix

- [ ] Demo selection → analysis → context → print/text completes in the production build.
- [ ] Microphone allow, deny, no-device, unanswered prompt/cancel, retry, and reset behave sensibly.
- [ ] Mic indicator turns off after complete/cancel/error/navigation; no audible feedback.
- [ ] Tab suspension, ended track, or incomplete sample sequence cannot pass as a full capture.
- [ ] WAV import works; invalid file, short file, oversized file, and decoding error recover cleanly.
- [ ] Synthetic → real → synthetic transitions clear old results and retain correct origin.
- [ ] Late worker/AI responses cannot replace a newer session.
- [ ] All null/inconclusive values display consistently and export without `NaN`, `Infinity`, or misleading zeros.
- [ ] Report matches the current result ID and current context; unknown county remains unknown.
- [ ] Report has no applicability/violation verdict and no accidental PWC threshold applied to Loudoun.
- [ ] Synthetic watermark, references, units, and limitations survive print-to-PDF and text export.
- [ ] Long notes, `<script>` text, and unusual characters render as text; no overflow or execution.
- [ ] Browser network inspection confirms no raw audio upload or note/location transmission in the core flow.
- [ ] All source links work or are clearly marked with a fallback link/date.
- [ ] Keyboard navigation, visible focus, readable contrast, small screen, and browser zoom work adequately.
- [ ] Cold start and refresh work on the actual judging laptop. Direct Report route without state recovers.
- [ ] Local production preview works after disconnecting internet; AI may be unavailable unless explicitly cached/self-hosted and verified.

Test desktop Chromium as the primary target, then one additional browser/device if available. Record compatibility limits instead of claiming universal support. For AI, run §13’s separate contrast set and failure checks; do not mix its scores into DSP validation.

### Commands and release sequence

```powershell
npm test
npm run build
npm run preview -- --host 127.0.0.1
```

Use the production preview for the final rehearsal. Keep the source checkout, lockfile, built `dist/`, and any allowed licensed demo audio together. A local preview still needs its server running. If a public URL is required, use a familiar static HTTPS host during the build window, test the exact submitted URL and microphone permission there, and retain localhost as backup. Hosting is optional unless the submission rules require it; avoid introducing a new hosting stack late in the event.

## 17. Fallbacks with explicit triggers

| Trigger | Decision | Honest demo/report behavior |
|---|---|---|
| Pre-event spike reuse not explicitly permitted | Rebuild during event | State exactly which code was built today; retain research as allowed planning |
| No correct numerical fixture by 11:00 | Stop UI polish; pair on FFT/weighting/normalization | Do not substitute hardcoded output |
| No end-to-end export by 11:30 | Build text report before print/graph polish | Plain complete flow takes priority |
| Worklet/mic unreliable by 2:00 | Hide/label mic unavailable; use file import and synthetic fixtures | Claim a working audio-analysis workflow, not live capture |
| Peak heuristic fails broadband/burst tests | Disable peak verdict; keep spectrum and C−A | Explain that standardized tonal assessment remains future work |
| No suitable AI clips/model success within its 45-minute slot | Remove AI entry point | Roadmap only; no simulated AI inference |
| AI download/network fails | Core app remains fully usable | “Optional sound hints unavailable”; do not show cached suggestions for new audio |
| Room/speaker demo yields unexpected result | Present it as observed; switch to digital fixtures | Distinguish room capture from controlled software demonstration |
| Print/PDF layout fails | Text download and simple print result table | Report functionality still demonstrated |
| County portal/source is unreachable | Show dated locally bundled reference text and URL | Explain source availability; no invented legal update |
| Internet fails | Run local preview with bundled assets | Open source links only if connectivity returns; use local video if needed |
| Demo laptop fails | Backup laptop or prerecorded screen recording + source | Identify the video as prerecorded; no claim that playback is live |
| Behind at 3:00 | Freeze features immediately; fix only core defects | Narrow submission to what is truly functional |

Prepare a 60–90-second screen recording before 4:15: show named synthetic input, changed results, context, and export. Include a real input only if it actually worked. Save the video locally and in the submission destination if permitted; do not depend on a streaming site alone.

## 18. Five-minute pitch and slide plan

Target **4:40**, leaving 20 seconds for transitions. Use four simple slides and the actual app. Two minutes of Q&A follow. Do not spend the functionality points on a long legal lecture.

### Slides

| Slide | On-screen material | Purpose |
|---|---|---|
| 1: Recurring hum → useful observation | One resident scenario; one sourced county-context sentence | Problem/Solution |
| 2: The working product | App demo, with visible synthetic/uncalibrated labels | Functionality |
| 3: Who uses it and how they find it | Resident → HOA clinic → five-household pilot → reviewer feedback; compact alternatives comparison | Market/UVP + Marketing |
| 4: What we built / what needs validation | Actual implemented components; calibration/source limits; one next step | Technical understanding + credible close |

Put all extra roadmap items and source links in backup material, not the main pitch. Use “built” only for completed functionality and “proposed” for pilot/partnerships.

### Speaking schedule

| Time | Speaker (4-person team) | Content |
|---|---|---|
| 0:00–0:30 | A | Problem and user task |
| 0:30–0:55 | B | Target user and distinctive workflow |
| 0:55–2:35 | C | Working deterministic audio demonstration |
| 2:35–3:15 | D | Context/export/provenance and source links |
| 3:15–3:50 | B | Concrete recruitment/pilot plan |
| 3:50–4:25 | C | Actual technical work and limits |
| 4:25–4:40 | A | Environmental value and next validation step |

For three people, D’s segment goes to A. For two people, C’s segments go to A and D’s to B. Ensure the split still reflects real contributions. A solo entry naturally has one speaker under the allowed team policy.

### Rehearsal-ready script

Adapt the bracketed feature statements to what is actually working at the freeze. Do not read a claim about a cut feature.

**A, opening:** “A recurring hum can be hard to document. A resident may know when it happens but not what a phone recording means or what to include in a report. Loudoun itself identifies a gap in its rules for tonal and low-frequency noise. We built TonalWatch to make a careful observation easier to share.”

**B, user and value:** “Our first users are residents and the HOAs helping them organize. Existing sound-meter and mapping apps are useful. Our focus is this specific handoff: a transparent frequency analysis, clear limits, and a consistent observation packet with local source links.”

**C, demo:** “These inputs are visibly labeled synthetic. They test the software without depending on a room or phone speaker. Here is broadband noise. Now I switch to a harmonic hum. The same engine recomputes the spectrum and the A/C-weighted difference. [Point to the actual changed outputs.] [Only if enabled: ‘We also look separately for a sustained narrow peak.’] Now this is a 1 kHz tone: the difference is almost zero, although the tone is obvious in the spectrum. That is why a big difference alone is not a tone detector. These are digital screening values, not certified sound-pressure measurements.”

**D, export:** “I add when and where the sound was observed and relevant conditions. The report preserves the input origin, method, warnings, and references. This demonstration report is marked synthetic. A real user can print or save a text observation and decide whether to contact the appropriate agency. The app does not automatically submit it or accuse a facility.”

**B, marketing:** “Our proposed first pilot is one HOA and five households. We would recruit through an organizer, run a short documentation clinic, ask volunteers for repeat observations, and request qualified feedback on the reports. We would measure completion, repeat use, missing information, and reviewer usefulness before expanding. A shared validated measurement kit is a possible partner project, not something we already have.”

**C, engineering:** “Today we implemented [name actual input paths], shared PCM analysis, [quality checks/peak heuristic if working], and report export. Our main engineering decision was to test the calculation against known signals and show uncertainty. We cannot identify a data center from a buzz or determine a violation from five seconds of uncalibrated audio. [If AI passed: ‘An optional model suggests sound resemblances, separately from the measurements.’ Otherwise omit.]”

**A, close:** “Better documentation can help residents and reviewers have a clearer conversation about community noise. Our next step is a small pilot and comparison with suitable reference equipment. TonalWatch turns a recurring hum into an observation someone else can inspect.”

Leave time for visible clicks and changed results. If over time, cut a demonstration fixture or a roadmap sentence, not the export or another teammate’s speaking turn.

### Two-minute emergency pitch

Use only if organizers request a shorter version: 20 seconds problem/user; 60 seconds fixture comparison and export; 20 seconds pilot/UVP; 20 seconds actual build/limits/close. Split those segments so every teammate still speaks. Do not assume the original two-minute skeleton satisfies the supplied five-minute rubric better than a prepared complete pitch.

## 19. Judge Q&A: concise answers everyone should know

Practice three random questions in two minutes. Answer directly, point to a real artifact when possible, and avoid promises about future capabilities.

| Judge question | Suggested answer |
|---|---|
| Does C−A prove the noise is tonal? | “No. It screens for low-frequency contribution in the captured signal. A separate exploratory peak check looks for sustained narrowband structure. Our fixtures demonstrate the distinction.” |
| Why is 15 dB your cutoff? | “It is a prototype screening convention, not a legal trigger or universal diagnosis. We show the numerical result and limitations rather than turning it into an enforcement verdict.” |
| Why not just use NIOSH or NoiseCapture? | “Those are real alternatives. We are testing whether a resident-focused explanation and county-linked observation packet make this particular documentation task easier. We are not claiming better instrument accuracy.” |
| Are these dBA and dBC measurements? | “Without a validated acoustic calibration chain, they are weighted digital values. We define the reference and do not compare them with legal sound-pressure limits.” |
| Doesn’t calibration cancel in the difference? | “Only a common constant gain cancels mathematically. Frequency response, filtering, compression, clipping, and environmental contamination remain.” |
| Does five seconds meet the county procedure? | “No. It is a quick screen. The report records its actual duration and directs users to the formal requirements rather than pretending to reproduce them.” |
| Is this PWC’s legal steady-tonal definition? | “No. Our sustained-peak heuristic is a software aid. We link the legal definition and do not use the badge to decide compliance.” |
| Can you tell the buzz is from a data center? | “No. Multiple sources can sound similar. The user’s suspected source remains an unverified note; attribution needs investigation.” |
| What about lights versus outdoor equipment? | “The optional model can rank sound resemblances if our small test supports it. It must allow uncertainty and cannot establish equipment identity or location.” |
| What do the AI scores mean? | “They compare the supplied label descriptions for that clip. They are not calibrated probabilities of a physical source. Changing the alternatives can change the scores.” |
| Does a negative screen invalidate a complaint? | “No. The device or short capture may miss the sound. A descriptive observation remains exportable.” |
| How do you avoid false positives from HVAC, speech, or wind? | “We expose context and recording-quality limits and avoid source claims. The contrast fixtures test some failure cases, but field performance still needs validation.” |
| What did the team actually build today? | “Here are the committed components, current workflow, and recorded test results. Pre-event research/code and any permitted reuse are disclosed separately.” |
| How did you test it? | “Known tones, mixed signals, seeded broadband noise, silence/DC, clipping, short bursts, rate checks, and report consistency. Those validate software; reference-instrument comparison is next.” |
| Why no map? | “The most useful complete product today is an inspectable observation and export. Shared mapping needs privacy, calibration comparability, attribution, and moderation work before real deployment.” |
| How do you reach users? | “One proposed HOA clinic recruits five volunteers, supports repeat observations, and gathers qualified feedback. We have specific completion and repeat-use targets rather than relying on broad social promotion.” |
| What is the environmental benefit? | “It supports documenting community noise and asking informed follow-up questions. We have not demonstrated reduced noise, energy consumption, emissions, or health impacts.” |
| Will the county accept this or send an engineer? | “We cannot guarantee either. We provide a clear observation and ask the responsible agency what follow-up is appropriate.” |
| What if the law changes? | “Reference text is dated and versioned. A maintained release would recheck official sources. The prototype does not dynamically decide applicable law.” |
| What is AI doing in the core product? | “Core calculations and report wording are deterministic. We disclose AI development assistance if used; optional audio hints remain a separate experimental feature.” |

## 20. Privacy, credibility, and future work

### MVP data handling

- Process PCM and notes in memory. No accounts, cloud storage, analytics, or automatic sharing.
- Ask for microphone access only on a deliberate action. Stop tracks promptly and give a visible reset.
- Do not automatically collect GPS. Manual location is optional; avoid exact home addresses in synthetic demos.
- Audio can contain conversations. Do not retain or include it in exports by default. Clear PCM when the session is reset or closed; if AI is enabled, retain only the needed in-memory copy until analysis finishes.
- A downloaded report can contain personal notes/location. Give the user a preview and remind them to review before sharing. Link official portal privacy guidance where relevant.
- For optional model downloads, distinguish model/network requests from audio upload. Verify actual behavior; a local-processing claim must match the implementation.
- A client-created timestamp or optional hash is not chain of custody. Do not claim tamper-proof evidence or authenticated location.

### Roadmap in order of value

1. **Validate the workflow:** five-household pilot, qualified reviewer feedback, measured completion and missing-field rates.
2. **Validate a specified measurement chain:** reference-meter comparisons across frequencies/levels/devices, documented uncertainty, repeat sessions, calibration discipline.
3. **Evaluate stronger acoustic methods:** professional standardized tonality analysis and longer observation protocols, with appropriate expertise.
4. **Evaluate targeted sound-type models:** independent source-labeled recordings, held-out equipment/sites/devices, confounders, unknowns, and source-identification limits.
5. **Only then consider shared reporting:** consent, coarse/private locations, deduplication, provenance, moderation, raw-audio policy, calibration comparability, and no automatic facility blame. Crowd agreement alone is not verification.
6. **Later research:** frequency-aware mitigation or siting tools with validated models. Do not carry unrelated game/conservation ideas into the current product roadmap merely because they appeared in earlier brainstorming.

## 21. Source ledger and verification notes

Links below support the bounded factual summaries in this plan. Prefer the current official text over slides, news, search snippets, old code, or this summary. No claim that a future code update is guaranteed. Source access was checked October 18, 2026 unless noted.

### User-provided planning inputs

- **Original locked build plan:** supplied in the referenced “Hackathon Game Ideas” chat; includes the original seven-hour scope.
- **Current team briefing:** supplied as `Pasted text.txt` in this chat; includes expanded Map/Learn scope and reported pre-event spikes. Underlying repository/source logs were not available to verify its “demonstrated” claims.
- **Exact 804 Hacks rubric:** pasted by the user in this chat: 20/10/5/35/20/10; five-minute presentation and two-minute questions.
- **Prior technical-correction replies:** not fully retrievable; do not treat unseen replies as verified evidence.

### Event sources

- [804 Hacks organizer site and FAQ](https://www.804hacks.org/) — schedule, team size, AI allowance, preparation/building rule.
- [Official Devpost overview](https://804hacks.devpost.com/) — date, venue, theme, schedule; public judging criteria deferred to in-person instructions.
- [Devpost dates](https://804hacks.devpost.com/details/dates) — conflicting submission endpoint; use stricter organizer deadline.

### County sources

- [Loudoun: Noise & Air Quality Concerns](https://www.loudoun.gov/6405/Noise-Air-Quality-Concerns) — current gap explanation and anticipated amendment timing.
- [Loudoun §7.05.03](https://online.encodeplus.com/regs/loudouncounty-va-crosswalk/doc-viewer.aspx?secid=1320) — receiving-development table, measurement, exemptions, studies.
- [Loudoun zoning ordinance applicability guidance](https://www.loudoun.gov/zoningordinance) — older-code/vested-right and town context.
- [Loudoun LEx guidance](https://www.loudoun.gov/LEX) — routing and public/private request considerations.
- [PWC signed Ordinance 25-62](https://pwcgov.granicus.com/services/legistar/download/pdf/4103722/Ord._No._25-62.pdf) — enactment/effective date and amendments.
- [PWC §14-3](https://library.municode.com/va/prince_william_county/codes/code_of_ordinances?nodeId=CH14NO_S14-3DE) — definitions, time periods, steady-tonal definition.
- [PWC §14-4](https://library.municode.com/va/prince_william_county/codes/code_of_ordinances?nodeId=CH14NO_S14-4MAPESOLE) — levels, applicability, exceptions.
- [PWC §14-7](https://library.municode.com/va/prince_william_county/codes/code_of_ordinances?nodeId=CH14NO_S14-7MEPR) — measurement procedure.
- [PWC steady-tonal reporting guidance](https://pwcaws.pwcva.gov/department/public-works/steady-tonal-noise) — resident reporting route.

### Acoustic, browser, and implementation sources

- [B&K environmental-noise handbook](https://www.bksv.com/doc/br1626.pdf) — A/C contrast as low-frequency context.
- [NTi frequency-weighting explanation/table](https://www.nti-audio.com/en/support/know-how/frequency-weightings-for-sound-level-measurements) — independent response sanity check.
- [Cross-Spectrum weighting equations](https://www.cross-spectrum.com/audio/weighting.html) — conventional response equations; this plan normalizes at 1 kHz.
- [SciPy periodogram documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.periodogram.html) — PSD versus spectrum scaling and one-sided power handling.
- [B&K tone-assessment manual](https://www.bksv.com/downloads/2250/be1778.pdf) — professional tone assessment context; not implemented by the MVP heuristic.
- [NIOSH Sound Level Meter](https://www.cdc.gov/niosh/noise/about/app.html) — tested app/instrument context and an existing alternative.
- [NIOSH external-microphone study](https://pmc.ncbi.nlm.nih.gov/articles/PMC5102154/) — hardware/calibration specificity.
- [OSHA §1910.95](https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.95) — why an unspecified brief anecdotal reading cannot establish occupational obligations.
- [FHWA barrier acoustics](https://www.fhwa.dot.gov/Environment/noise/noise_barriers/design_construction/design/design03.cfm) — frequency/geometry-dependent attenuation and diffraction.
- [W3C Media Capture and Streams](https://www.w3.org/TR/mediacapture-streams/) — constraints/settings and capture behavior.
- [W3C Web Audio](https://www.w3.org/TR/webaudio/) — node behavior and analysis processing.
- [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) — permission/secure-context/error handling.
- [MDN AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet) — worklet processing environment.
- [MDN decodeAudioData](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData) — decoding and resampling behavior.
- [Vite](https://vite.dev/guide/), [FFT.js](https://github.com/indutny/fft.js), [Vitest](https://vitest.dev/guide/) — selected framework/library documentation.
- [NoiseCapture](https://noise-planet.org/noisecapture.html) — existing environmental-noise and collaborative-mapping alternative.
- [CLAP browser model card](https://huggingface.co/Xenova/clap-htsat-unfused), [preprocessor configuration](https://huggingface.co/Xenova/clap-htsat-unfused/blob/main/preprocessor_config.json), [Transformers.js stable pipeline API](https://huggingface.co/docs/transformers.js/v3.8.1/en/api/pipelines#module_pipelines.ZeroShotAudioClassificationPipeline), [upstream CLAP project](https://github.com/LAION-AI/CLAP) — optional sound-similarity experiment, not evidence that light-versus-industrial discrimination is reliable.

### Media references deliberately not used as proof

- [NBC4: Neighbors raise concerns about noisy data center in Loudoun](https://www.nbcwashington.com/news/local/northern-virginia/neighbors-raise-concerns-about-noisy-data-center-in-loudoun/4080249/) — direct fetch returned access denied; the briefing’s precise numbers, distance, and causal sequence were not independently confirmed here.
- [WUSA9: Loudoun County officials/data-center noise](https://www.wusa9.com/article/news/local/data/loudoun-county-officials-data-center-noise/65-45884219-750f-4d47-a660-71a20d8db001) — direct fetch returned access denied; do not quote the supplied tinnitus line until checked in the original.

## 22. Final submission checklist

- [ ] Project name, track, team members, and contact information are correct.
- [ ] Description leads with the resident task and actual finished functionality.
- [ ] “Built today,” permitted reused work, libraries/assets/models, and AI assistance are disclosed accurately.
- [ ] Source repository includes setup instructions, lockfile, licenses/attribution, limitations, and actual validation notes.
- [ ] Public link, if required, opens without owner login; the exact submitted version was tested.
- [ ] Local production preview and video backup are ready on the demo laptop.
- [ ] Report export is demonstrated end to end and preserves synthetic/uncalibrated labels.
- [ ] Slides contain no unverified news quote, first/only claim, legal verdict, promised county action, or unearned accuracy metric.
- [ ] Every teammate speaks; pitch is at most five minutes; two-minute Q&A has been practiced.
- [ ] Submission is saved by the 4:15 target and verified before the 5:00 cutoff.

**Final product promise:** Help someone make a clear, inspectable noise observation. Earn the stronger measurement, attribution, and adoption claims through later validation.