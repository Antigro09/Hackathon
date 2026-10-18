# TonalWatch validation record

Build date: **October 18, 2026 (America/New_York)**. This record distinguishes software checks from browser integration and physical measurement validation. Algorithm: **`tw-screen-v1`**.

**Expanded-workflow status:** Home navigation, Learn listening/actual-PSD exhibits, the synthetic/manual map, 5/15/30-second capture, and Buddy-check comparison passed the combined **264-test suite across 13 files** and production build. Local browser checks are recorded below. Deployment verification for this expanded version is pending; historical 129-test evidence remains separately labeled.

## Environment and pinned dependencies

Execution environment: Windows, PowerShell, Node.js **24.18.0**, npm **11.16.0**. Direct dependency pins in `package.json` and the lockfile are recorded below. The earlier release's `npm ls --depth=0` check preceded the Leaflet additions; the expanded checkout subsequently passed TypeScript and Vite production build with Leaflet included.

| Dependency | Version |
| --- | --- |
| `react` | 19.3.1 |
| `react-dom` | 19.3.1 |
| `fft.js` | 4.0.4 |
| `@huggingface/transformers` | 4.3.1 |
| `leaflet` | 1.9.4 |
| `@types/leaflet` | 1.9.22 |
| `@types/react` | 19.3.0 |
| `@types/react-dom` | 19.3.0 |
| `@vitejs/plugin-react` | 6.1.2 |
| `typescript` | 7.0.2 |
| `vite` | 8.3.4 |
| `vitest` | 5.0.5 |

The lockfile also pins the browser inference dependency `onnxruntime-web` to **1.31.0-dev.20260914-8d85527a0**. The optional model is `Xenova/clap-htsat-unfused` at immutable revision **`c28f2883575e590e04d3146ff0713c2448d691ba`**, `q8`, WASM, one thread. Its `onnx/model_quantized.onnx` file is **161,024,085 bytes**; working memory is greater than download size and was not benchmarked.

## Previous-release automated checks

- **Baseline before optional features:** `npm test` passed 74 tests across four files; `npm run build` passed.
- **Live meter focused run:** 23 tests passed across `tests/capture.test.ts` and `tests/meter.test.ts`; production build passed.
- **Historical integrated `npm test`: passed, 129 tests across seven files**, release check approximately 5.88 seconds after shared method-version metadata was added. A separate run during concurrent development exceeded the deterministic-fixture equality test's original 5-second timeout; this full-array check now has a 30-second limit for slower laptops. The subsequent complete suite passed. No fixture values or feature assertions were weakened.
- **`npm run build`: passed after meter, printed-spectrum, and AI integration.** This runs TypeScript checking and the Vite production build.
- **`npm ls --depth=0`: passed.** Direct dependencies were installed at the pinned versions above.

| Test files | Checked behavior | Scope |
| --- | --- | --- |
| `tests/weighting.test.ts`, `tests/engine.test.ts` | 50 tests: 1 kHz normalization; rounded A/C response checks; analytic and spectral goldens; DC/Nyquist handling; Parseval normalization; digital RMS-1 level; signed C−A; constant-gain invariance; 44.1/48 kHz bin frequencies and frame counts; reproducible seeded fixtures; peak persistence and counterexamples; quality gates; provenance and identifier filtering | Real numerical computation on generated PCM; no acoustic playback or microphone |
| `tests/capture.test.ts`, `tests/meter.test.ts` | 23 tests: exact warm-up/crop counts at both rates; irregular chunks; gap/duplicate rejection; safe settings; variable render block sizes and silent output; capture cleanup and permission/error branches; first-channel import and rejection paths; analytic sine RMS; retained clipping between throttled meter updates; ≤10 Hz update frequency; warm-up/recording readings; immediate cancellation; accessible silence/inactive states | Mocked browser/media APIs, synthetic PCM and the actual worklet processor source; no claim of hardware validation |
| `tests/report.test.ts`, `tests/reportSpectrum.test.ts` | 25 tests: synthetic labels; source/timestamp metadata; null/quality states; safe notes; reference separation; deterministic snapshots; immutable spectrum data; actual-engine graph/text consistency; logarithmic frequency geometry; highest-bin reduction without frequency shifts; finite coordinates and quality-state explanations | Report model, rendered HTML, SVG geometry and numerical text consistency |
| `tests/soundHints.test.ts` | 31 tests: eight fixed alternatives; relative-score policy and abstention; quality gates; true-rate local resampling without mutating DSP input; lazy model loading; local PCM worker inference; retry/disposal; immutable model URL configuration; actual pinned processor padding behavior | Policy, mocked inference lifecycle, local resampling wiring, and the actual Transformers.js 4.3.1 processor; not a field accuracy benchmark |

This table records the earlier release, not a new total after the approved extensions. These checks do not establish environmental measurement accuracy, legal applicability, or field classification performance.

## Expanded-workflow checks

**Combined release checks:** `npm test` passed **264 tests across 13 files**; `npm run build` passed TypeScript checking and the Vite production build. The following focused counts describe earlier implementation runs and are not additional tests beyond that combined total.

The following focused runs were observed during implementation. Their test files overlap; **do not add these counts together** or treat them as a full-suite count.

| Focused run | Observed result and scope |
| --- | --- |
| `tests/capture.test.ts`, `tests/meter.test.ts`, `tests/longCapture.test.ts` | 58 passed. Exact 5/15/30-second collection/cropping at 44.1/48 kHz; unchanged half-second microphone warm-up; progress beyond five seconds; cancellation/resource release; invalid-duration and selected-duration short-file errors; first-channel imports; full-duration Hann frame counts and weighted levels; all complete frames remain in the persistence denominator. Mocked capture plus real numerical DSP, not physical-device evidence. |
| `tests/report.test.ts`, `tests/reportSpectrum.test.ts` | 30 passed. Actual-engine 15/30-second microphone/import reports retain full duration, sample count, frame count, PSD arrays and provenance. Optional five-second AI metadata is excluded. Synthetic/uncalibrated markers and source-access limitations remain. |
| `tests/soundHintInput.test.ts`, `tests/soundHints.test.ts` | 52 passed. Independent first-five-second prefix at the actual 44.1/48 kHz rate, input preservation, invalid/short rejection, separate long-observation disclosure, and the existing worker/padding/quality policy. No accuracy claim. |
| TypeScript | `npx tsc --noEmit --incremental false` passed after the duration/report/AI-window changes; the subsequent combined `npm run build` also passed. |

The expanded source adds:

- Home navigation and Learn's five explicit-play tones, lifecycle cleanup, capture/playback interlock, and a 20–200 Hz plot of the active result's actual PSD. Dashed 60/120 Hz lines are references, not detections or proof of a power-grid source. Zooming adds no FFT resolution.
- Fourteen synthetic map examples with invented devices/times and approximate illustrative positions; per-pin/card provenance; separate low-frequency/peak descriptions; manual, confirmed recording coordinates or an unplaced session entry. The default neutral grid/list uses no external tile service. Explicit online OpenStreetMap opt-in exposes the IP/viewed area to its provider; unavailable tiles leave the grid/list usable. This does not promise an uncached hosted app can boot offline.
- Default-five-second, selectable 15/30-second microphone/file observations. Full PCM feeds DSP and report/spectrum metadata. Only a separate first-five-second copy feeds the pinned AI worker; its five seconds of zero padding add no observed time. Longer duration does not establish compliance with a county procedure.
- Buddy-check's descriptive current-minus-previous gap, retaining provenance and synthetic warnings. Missing/inconclusive gaps do not become zero; the feature does not calibrate devices, connect phones, or pool/correct map readings.

Local Chrome integration observations for the expanded build:

| Check | Observed result |
| --- | --- |
| Real AudioWorklet duration selection with a virtual input | 5/15/30 seconds at 48 kHz produced the expected exact sample counts and **57/174/350 complete frames**. The 30-second report retained the full DSP duration rather than the AI prefix. This is browser integration, not a physical microphone test. |
| Native longer-file import | 15/30-second imports at 48 kHz succeeded. A five-second file selected for a 30-second observation was rejected. |
| Buddy-check comparison | Harmonic-hum 20.4 dB → near-zero-gap fixture displayed a signed **−20.4 dB** difference. The same audio analyzed for 15 versus 30 seconds displayed **0.0 dB**. Clipped current/previous results disabled the comparison; session clear reset it. These are generated/virtual-input observations, not cross-device calibration. |
| Learn layout and print | Twenty viewport cases passed. Two- and three-page learning PDF outputs passed visual QA. Reference lines remain distinct from the actual PSD/candidate; no additional frequency resolution or source identity is claimed. |
| Map behavior | Online/offline, manual placement, and reset checks passed. Resize verification retained **14 synthetic icons and 14 provenance badges**. The neutral grid/list remains the fallback when tiles are unavailable. |

The exact expanded deployment still requires verification before these local results are treated as hosted-release evidence. Current screenshots cover all six pages. All six pages passed 30 route/width cases at 320, 390, 760, 1280, and 1920 CSS pixels without document-width overflow, with accessible footers. Physical microphone, independent field, and AI promotion checks remain outside this software integration result.

## Observed numerical fixture results

Five seconds of Float32 mono PCM were generated by `generateFixture` and passed through the same `analyzePcm` function used for microphone/file input. Noise uses the fixed unsigned xorshift seed `0x08042026`. The low-frequency noise fixture follows the two-stage 40 Hz low-pass recipe, including two seconds of warm-up, retained mean removal, and RMS 0.05 scaling.

| Fixture | Observed C−A at 48 kHz (dB) | Observed C−A at 44.1 kHz (dB) | Sustained peak |
| --- | ---: | ---: | --- |
| `white-noise` | −1.4050 | −1.4022 | Not indicated |
| `hum-harmonics` | 20.4287 | 20.4324 | Suggested |
| `sine-1000` | 0.00003 | 0.00003 | Suggested |
| `lf-broadband` | 22.1355 | 22.2916 | Not indicated |
| `sine-63` | 25.3340 | 25.3441 | Suggested |
| `sine-125` | 16.0090 | 16.0101 | Suggested |
| `mixed-63-1000` | 2.6062 | 2.6067 | Suggested |
| `short-burst` | 0.0029 | 0.0026 | Not indicated |
| `silence` | Unavailable | Unavailable | Inconclusive: near-zero input |
| `clipped` | Unavailable | Unavailable | Inconclusive: clipping gate |

Complete analyzed frame counts are **57 at 48 kHz** and **52 at 44.1 kHz** for non-silent five-second fixtures. Silence is rejected by the near-zero guard before FFT processing, so its analyzed frame count is zero. No tail is zero-padded into another frame. A 63 Hz tone reports its actual peak bin at **64.453125 Hz** at 48 kHz, consistent with the **5.859375 Hz** bin spacing.

The six supplied 48 kHz spectral-reference goldens passed their specified tolerances (±0.15 dB, or ±0.20 dB for LF broadband). Pure-component/mixture checks at 44.1 kHz passed the independent analytic expectation within 0.5 dB, then separate 44.1 kHz regression goldens were recorded. The broadband, LF broadband, and short-beep fixtures produced no persistent isolated-peak result at either rate. Tone/mixture/hum fixtures retained a sustained peak at both rates.

The 0.1-peak 1 kHz sine produced approximately **−23.0103 dB relative to digital RMS 1** for both weighted levels. No acoustic sensitivity offset was added. The test at the clipping boundary confirmed 239 full-scale samples in 240,000 warn without meeting the invalid fraction, while 240 meet the **0.1%** clipping gate.

## Previous-release browser integration checks

The previous production build was served at `http://127.0.0.1:4173` in **Chrome 155 on Windows**. Playwright CLI exercised the actual browser, native audio decoder, AudioWorklet and analysis worker. Checks below passed for that release unless explicitly limited; they do not establish verification of the new Learn/Map/comparison or longer-capture integration.

| Browser check | Observed result |
| --- | --- |
| Contrasting fixtures through UI → worker → results | White noise −1.4 dB/no sustained peak; 1 kHz tone 0.0 dB/peak near 1002 Hz; LF broadband 22.1 dB/no sustained peak; harmonic hum 20.4 dB/peak near 64 Hz. Silence and clipped inputs returned unavailable levels and inconclusive indicators. |
| Native PCM WAV import | 48 kHz mono 63 Hz file and antiphase stereo file both produced 25.3 dB, demonstrating first-channel selection. A 44.1 kHz file decoded at an effective 48 kHz and was labeled accordingly. Seven-second file containing a later 1 kHz segment retained only the first five seconds. |
| Invalid file recovery | Two-second, larger-than-10-MiB, and corrupt WAV inputs showed clear errors. Previous analysis/export was cleared before each replacement. |
| Synthetic observation → report → text download | Download succeeded as `tonalwatch-synthetic-demo-2026-10-18.txt`; output retained fixture ID, 20.43 dB result, notes, distinct timestamps, Loudoun references and synthetic designation. |
| Safe notes and report consistency | Literal script markup remained escaped text; no script executed. Editing notes invalidated the cached report, including browser Back/Forward navigation. |
| Keyboard skip link | Focus moved to `main-content`; `#/measure` route and observation remained intact. |
| Microphone integration with a virtual input | Chrome fake-media device was fed the generated 63 Hz WAV. Native getUserMedia → AudioWorklet → worker produced exactly 5.00 seconds at 48 kHz and 25.3 dB. Tracks were `ended` and AudioContexts `closed` after success, cancellation, and navigation away during capture. This is browser integration QA, **not a physical microphone test**. |
| Print/save-PDF rendering | Baseline export produced four Letter pages. After adding the captured spectrum, browser PDF export produced five pages; every page was rendered and visually inspected, including the actual graph and synthetic header on every page. No clipping, URL overflow or overlap was observed. Native printer dialog selection was not automated. |
| Responsive geometry | Four routes checked at widths 320, 375, 390, 600, 760, 761, 800, 900, 1024, 1280, 1440 and 1920 CSS pixels. No document-width overflow observed. Full-page screenshots captured for all routes. |
| Normal-window scrolling at 100% zoom | Windows display scaling 150%; actual browser viewport 1280×665 and outer window 1280×752. Right edge fit and each page footer reached the bottom of the visible viewport. |
| Network / console, standard workflow | Production assets and analysis worker loaded from localhost only. No external requests, audio uploads, console errors or warnings were observed in the standard demo/report flow. The optional AI path has separate download checks below. This does not claim an installable offline app or a disconnected local server. |

### Optional AI and input-meter feature checks

The live meter reads real indexed AudioWorklet chunks during warm-up and capture, with no more than ten wall-clock updates per second. A known 0.1-peak sine produced **−23.0103 dB relative to RMS 1** in tests. A clipping transient between emitted updates was retained; cancellation and completed capture prevented further callbacks. This is digital signal/capture verification, not acoustic validation.

An actual Chrome run loaded CLAP and performed local inference on a synthetic hum via virtual input. The first observed load took approximately **11.8 seconds**, inference approximately **1.2 seconds**, and warm inference approximately **0.4 seconds**. The top relative rankings were transformer hum **0.412** and light-fixture buzz **0.389**; the app retained an **uncertain** result. These are timing and integration observations from one laptop/session, not performance guarantees or source-classification accuracy results.

Network observation found **no external GET before Explore**. Requests observed during the AI run were model/runtime **GET downloads with no request body**; no audio upload was observed. Model and runtime caches can persist in the browser. Model loading and inference use a dedicated worker, while standard indicators and reports remain deterministic and do not include AI suggestions. Cancel/reset and input replacement terminate the optional worker and ignore stale session messages.

After enforcing immutable download paths, a fresh browser run loaded the model in **11.2 seconds**, inferred in **1.0 second**, and repeated in **0.5 seconds**. Every observed model resolve URL used the pinned revision; no `/resolve/main/` model request remained. Rankings stayed uncertain and matched the earlier integration run.

Recovery checks passed: cancel left the core result and report review available; silence disabled Explore while preserving descriptive export; replacing an input removed old hints and ended its model worker. In a separate clean browser context with Hugging Face blocked, model loading showed the unavailable state, and the standard report still rendered with its spectrum and no AI suggestions.

The five-second AI input is a separately resampled copy at 48 kHz. With Transformers.js 4.3.1, the actual processor adds five seconds of zeros for this exact input despite its `repeatpad` configuration; an automated check exercises the installed processor to establish that behavior. The model feature band is approximately 50 Hz–14 kHz and differs from the DSP integration band. No padding is treated as an extra observation. Download paths are pinned to the same immutable revision even for library discovery helpers that omit the pipeline revision option.

No independent eight-or-more-real-recording contrast set has been evaluated. All rankings therefore remain uncertain even if a provisional score/separation gate passes. The optional feature is a sound-description comparison, not source attribution, an acoustic measurement, or legal evidence.

**Preview-window issue resolved:** an earlier headed automation window emulated 1440×1000 CSS pixels inside a smaller visible window. It caused the screenshot-reported right/bottom cutoff even though document layout had no overflow. The two automated windows were closed and replaced with a normal window configured with `viewport: null`, allowing the actual client area to determine layout. Screenshot emulation should be used only in isolated QA sessions, not the user’s interactive preview.

Denied/no-device/unanswered-permission and late-grant branches are covered by mocked capture tests, not claimed as physical browser permission tests. A fake-device permission-denial experiment did not provide a valid denial test because automatic fake-media approval remained active. Mobile hardware and non-Chromium browser behavior remain unverified.

Page screenshots are in [`docs/screenshots/`](screenshots/). Temporary WAVs, browser scripts, report downloads and PDF renderings are under ignored `output/playwright/`.

## Hardware and field validation still pending

- Actual microphone capture and resource release on a named physical device/browser, including its observed processing settings.
- Reference-instrument comparison across relevant frequencies, levels, devices, and environments.
- A documented microphone/interface response, acoustic calibration chain, level linearity, before/after checks, and uncertainty budget.
- Environmental contamination, intermittent events, and peak-heuristic failure cases beyond the fixed software fixtures.
- Independent real-recording evaluation of the optional sound hints, including light fixtures, transformers, ventilation, household equipment, and nuisance alternatives, with held-out examples and recorded abstentions/errors.
- Any resident pilot, reviewer-usefulness evaluation, or agency acceptance.

No hardware calibration or field accuracy is established by this build. A 5/15/30-second uncalibrated browser sample does not implement a county measurement procedure. A negative screen does not rule out a recurring sound, and neither indicator identifies a physical source.

## Separate Colab classifier experiment

The **725-clip public-data run completed**, producing a classifier artifact and held-out evaluation. It fitted a small classifier on frozen CLAP embeddings; it was not full encoder fine-tuning and has not replaced the deployed eight-description comparison. The recorded splits contain 291 training, 78 validation, 196 known-test, 80 unknown-validation, and 80 unknown-test clips. The dataset and experiment preserve license/source records, uploader/content split checks, and first-five-second preprocessing. Training-only group cross-validation selected regularization; validation/unknown-validation data selected rejection thresholds; held-out test data did not select either.

Held-out metrics and their sample limits are documented in [AI_EXPERIMENT_RESULTS.md](AI_EXPERIMENT_RESULTS.md). The exported artifact retains `promotionAllowed: false`: browser/native parity and independent recordings resembling actual use remain required before deployment. Public data may overlap encoder pretraining, and broad sound tags do not establish exact equipment or a facility. The separate-branch q8 embedding baseline also differs from the live combined graph; [ML methods](../ml/README.md) describe that distinction. Completion of this public-data experiment does not establish field reliability or authorize replacing the live model.

## Provenance and historical artifacts

The React/TypeScript app, PCM estimator, fixtures, worker, capture path, and report implementation were created for the current corrected-plan implementation. Existing `mic_spike.html` and `range_finder.html` remain research artifacts and are not part of the current runtime. Their historical “validated” or “calibration” descriptions are not adopted as results for this app. Event eligibility and any organizer reuse ruling require a separate team record.

The restored standalone [`field_lab.html`](../field_lab.html) serves the E1–E5 field-research campaign, including its own logging and CSV export. Its measurement implementation and resource/quality handling are under review; the main React app's 264-test result does not validate this separate instrument. Lab fixes, deterministic checks, and actual field observations require their own recorded evidence before drawing experimental conclusions. [FIELD_LOG.md](FIELD_LOG.md) preserves the original hand-entered notes with explicit missing-provenance, duration, source, and unsupported-device-offset limitations. Those notes are not validated field data and do not establish which instrument/version produced them.

OpenAI Codex assisted development and software verification. Core calculations and report wording are deterministic. The optional local CLAP comparison uses downloaded model/runtime files and no remote inference endpoint. No generative legal text, audio upload, or automated complaint submission is included. Upstream model and library attribution is recorded in [RESOURCES.md](RESOURCES.md).
