# TonalWatch validation record

Build date: **October 18, 2026 (America/New_York)**. This record distinguishes software checks from browser integration and physical measurement validation. Current algorithm: **`tw-screen-v2`**; earlier v1 checks remain historical evidence for unchanged weighting/PSD and their original peak-selection method.

**Current application/lab status:** **497 tests across 27 files**, with strict TypeScript/Vite build passed. The public community map passed real persistence, independent-visitor, retry, privacy and removal checks; all 32 release assets, including the unchanged 23 opaque AI payloads, matched. Observation accepts live microphone capture only. The UI keeps all three durations, the input meter, negative-dB explanations, concise text exports and the printed spectrum. The AI copy uses deterministic, independently checked resampling. See [deployment evidence](DEPLOYMENT.md). Historical test runs remain separately labeled.

## Automatic street-map follow-up

Street tiles load automatically when the map opens, recover on reconnect and
show retry only after failure. Fifteen local checks passed, including deliberate
tile failure and offline recovery; four expected request errors were confined
to the deliberate failure. Fourteen public checks passed with no page/console
errors, explicit city search and working layouts at 320/390/1280 px. The final
server-type configuration build was clean; six frontend artifacts matched and
the real public feed returned HTTP 200. No public writes or model queries were
performed. [Evidence](qa/2026-10-18-auto-street-map.json).

## Public community map

The current map replaces synthetic example pins with shared, self-reported
observations and a distinct dated OSM facility layer. Eighteen API/client tests,
40 discovery tests and 11 draft/session/UI tests passed, adding 69 checks to the
prior 428. Real Redis executed all three fixed Lua operations in an isolated QA
namespace: 16 checks passed, and every temporary row/bookkeeping key was removed.
Separate mocked browser checks covered 22 recovery/privacy/race behaviors,
30 route/width cases and the 20-owner-capability boundary. Their mock scope is
explicit; those results alone are not persistence evidence.

Public HTTPS then passed the actual browser → API → Redis → independent visitor
flow and owner removal after reload. Coordinates were rounded before transport;
private report context, audio, raw bins and AI hints were absent. The actual
15-second virtual microphone retained 720,000 samples/174 frames and the report's
printed spectrum; its native summary was 5,912 bytes/94 lines with zero bin rows.
All six routes fit 320/390/1280 px at viewport scale 1 with reachable footers and
no page/console errors. An initial layout assertion ran during asynchronous feed
growth; final checks wait for the loaded feed before measuring maximum scroll.
Initial selector/layout logs remain preserved in ignored output.

The complete pinned directory is 5,035 source records dated October 18, 2026;
92 qualifying records were displayed within 5 km of Ashburn. These are OSM tags,
not independently confirmed active facilities or sound sources. The software
check's public post was explicitly labeled and removed. No acoustic accuracy,
hardware calibration, field reliability, or source attribution is established.
See [public evidence](qa/2026-10-18-community-public.json),
[provider checks](qa/2026-10-18-community-provider.json),
[UI checks](qa/2026-10-18-community-ui.json), and
[directory provenance](DATACENTER_SOURCES.md). Earlier map examples below are
historical and are no longer displayed in the current app.

## Microphone-only observation

Removed file-import and synthetic-demo observation controls, their runtime imports and mode state. Observation opens directly to the microphone with 5/15/30-second controls. Home, Learn, Sources, empty results/reports and every capture-error path describe the available microphone workflow. Educational listening tones, illustrative map examples and scientific fixtures remain separate from recording inputs.

Chrome used a generated virtual microphone through the actual AudioWorklet: live meter samples arrived, cancel released every track without analysis, and a subsequent 15-second capture produced 720,000 samples / 174 complete frames at 48 kHz. Its report retained microphone provenance and the complete window. Native text download was 5,828 bytes / 94 lines, with no individual spectrum-bin rows; the graph remained visible under print media and controls hid. Navigating Home during another capture released every track and cleared the partial result. All six pages at 320/390/1280 px had no horizontal overflow, file inputs or stale input instructions, and scrolling reached the footer. These are software checks with generated input, not physical microphone validation.

### Recorder startup follow-up

Public Chrome testing reproduced Cancel → Retry failing before its first audio chunk: the old context had closed, but the new graph briefly lost its provisional input. Before any complete 2,048-sample chunk has been posted, the worklet now discards provisional samples and restarts at index zero. It never fills a gap or joins discontinuous audio. After the first chunk, all missing inputs or render gaps still fail closed; the existing no-data watchdog remains. The complete 0.5-second warm-up and selected capture duration are collected from the new continuous sequence. Device-clock recording times remain estimates, not authenticated sample timestamps.

Six added regression cases verify fresh sample contents/indices, repeated provisional starts, silent outputs and strict post-commit interruption. All 37 capture tests pass. Chrome then completed immediate Cancel → Retry and a 15-second capture through text/print export, retaining 720,000 samples and 174 frames at 48 kHz. No software check establishes physical accuracy.

## Prior capture-control and resampling follow-up

The initial Observation mode was Demo, which hid the existing recording-duration selector and displayed a fixed five-second sample. Demo now discloses that distinction and provides a direct action selecting a 15-second microphone observation. Microphone/File expose 5/15/30-second buttons with pressed states and capture-time disabling. The method text distinguishes more time frames from unchanged FFT frequency spacing. Negative A/C digital levels relative to RMS 1 are explained separately from the signed C−A difference; −20 dB corresponds to one-tenth of the reference RMS amplitude, not negative pressure or calibrated dB SPL.

Local Chrome integration exercised the new shortcut and a real AudioWorklet with virtual microphone input: a 15-second result/report retained 720,000 samples and 174 complete frames at 48 kHz. The virtual input clipped and correctly produced an inconclusive quality state. A separate 15-second 4 kHz WAV import produced A −22.0 dB, C −23.8 dB and C−A −1.8 dB, with the explanations visible and the AI panel retaining its first-five-second boundary. Selecting 30 seconds rejected that shorter file. At 1366, 1024 and 390 px, duration controls fit without document-width overflow. These are software/browser checks, not physical-device validation.

The AI resampler matches independent SciPy references for 20 signals/rates at 448 positions per case. A separate six-signal browser diagnostic found bit-exact complete PCM after conversion and measured remaining native/WASM embedding drift; see [AI experiment evidence](AI_EXPERIMENT_RESULTS.md#browser-resampling-correction). No trained classifier or thresholds were promoted.

## Concise text export

The text report retains recording context, important results, quality notes, references and a short spectrum summary. It no longer serializes individual frequency/power bins. Full immutable arrays, the actual SVG path and the printed graph remain unchanged. The report offers “Download text summary” and explains that Print / save PDF includes the visual graph.

The focused report suite passed 35 checks, including actual 15-second, 8,192-point FFT results at 44.1/48 kHz with over 3,000 bins. A native browser download was 7,623 bytes and 109 lines, with no bin rows; notes, references and 174-frame metadata remained. The SVG path was identical before and after download, and the graph was visible in the generated PDF. Report controls fit 320/390 px without horizontal overflow. Actual report length varies with user notes and references.

The public HTTPS release at `55a0dcb` independently produced a 7,610-byte, 109-line native download with no bin rows. Its 15-second result retained 720,000 samples, 174 frames, context and official references. The actual spectrum path remained visible under print media; the toolbar hid as intended. No page/HTTP errors occurred.

## WAV rate and decoder provenance

The original default AudioContext resampled 44.1 kHz WAV files to 48 kHz before the explicit AI converter. A bounded RIFF/WAVE hint now requests supported 44.1/48 kHz rates, while the browser remains responsible for format validation. Unknown, malformed, ambiguous and unsupported headers use default decoding; unavailable requested rates fall back explicitly. Actual decoded rate always governs cropping and analysis. Contexts close on success, failure and cancellation. Analysis and reports separately filter twelve non-identifying decoder fields and omit private device/file metadata.

Two generated five-second PCM16 WAVs (63 Hz/1 kHz) decoded at 44.1 kHz in Chrome, retaining 220,500 samples. Their actual AI requests used that prefix and converted to 240,000 samples at 48 kHz, bit-exact to SciPy applied to the **browser-decoded** waveform. Chrome's slight asymmetric PCM16 conversion still differs from the native symmetric reference: maximum PCM error about 3.08e−6, with same-native-encoder cosine 0.99971/0.99966. This distinction is separate from the previously measured native/WASM ONNX drift. No gain compensation or full WAV codec was introduced, and no classifier threshold was changed. Source-rate preservation is verified; raw-file-to-native-float equivalence is not claimed. The full 365-test run includes these parsing, lifetime, provenance and privacy checks.

Public HTTPS verification of `0b94eb0` additionally retained 661,500 samples and 160 frames from an actual 15-second 44.1 kHz PCM16 file. Requested/effective rate, matched hint, fallback and crop fields survived into the report and its 6,352-byte / 99-line native text download, with no bin rows. A test-only observer confirmed the separate AI prefix retained its original 44.1 kHz rate before conversion. Print preserved the graph; no model download or page/console/network error occurred.

## Second classifier experiment

The completed Colab run and an independent hash/leakage/arithmetic audit are recorded in [AI_V2_RESULTS.md](AI_V2_RESULTS.md). The v2 candidate remains research-only, with useful-coverage and unknown-rejection failures. Python tests and isolated JavaScript scorer checks are separate from the app/lab count above. Saved results were not refit or retuned after fresh-test inspection.

## Sustained-peak selection correction

A generated 15-second, 44.1 kHz PCM16 63 Hz tone exposed a v1 ranking defect. Its main candidate near 64.600 Hz had three-bin power 0.004975741 and 47.36 dB local prominence; a quantization artifact near 1954.138 Hz had power 5.9798e−13 and 49.16 dB prominence. Both appeared in all 160 frames. V1 selected the artifact despite its being 99.20 dB weaker because it ranked persistence then prominence.

V2 first requires the existing per-frame 12 dB prominence/60% concentration criteria and track persistence of at least 80% of all frames, with at least 20 frames. It then selects the eligible track with strongest median three-bin linear power, breaking ties by persistence, prominence and frequency. Adjacent candidates within a frame follow the same power priority. Filtering eligibility first prevents a louder brief event from hiding a quieter sustained track. This is an experimental representative-peak rule, not fundamental-frequency estimation or standardized tonality. Weighted A/C results, averaged PSD and quality/eligibility thresholds are unchanged.

The dependency-free standalone lab mirrors this correction as `tw-field-lab-v3`. Its schema and storage key stay unchanged; explicitly recognized structured v2/v3 campaign rows keep their original algorithm, values and observer metadata. Old results are not silently recomputed or relabeled. Earlier unversioned and unknown-method rows retain their raw legacy wrappers.

The [recorded before-fix audit](validation/peak-ranking-before.json) preserves the generated-signal comparison. Regression checks cover quantized tones at both supported rates and 5/15 seconds, stronger ~80%-persistent versus weaker fully persistent tracks, ineligible ~75% tracks, low-gain tones, noise/burst rejection, complete main/lab PSD and A/C parity, and historical structured-record preservation. **380 tests across 19 files and the production build passed** after the correction.

Public release `c54ab68` then reported the generated 15-second 44.1 kHz PCM16 tone near **64.599609375 Hz**, retaining 661,500 samples/160 frames and the prior A/C values/PSD references. Text download was 6,576 bytes/99 lines with no bin rows; report/print kept the graph. At 320/390/1280 px, Report and Sources fit horizontally and their footers were fully reachable at maximum vertical scroll. No runtime/network errors occurred. These generated-input checks do not validate physical source identification.

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

**First expanded integration:** `npm test` passed 264 tests across 13 files before the team restored the separate lab. Its five retirement tests were replaced; that follow-up passed 294 tests across 14 files, including 259 application and 35 standalone checks. The earlier expanded deployed application archive passed 259 application tests and build. The newer total is recorded above. Focused counts below overlap and are not additional tests.

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

The expanded deployment passed the public checks in [DEPLOYMENT.md](DEPLOYMENT.md). Current screenshots cover all six pages. Locally all 30 route/width cases at 320/390/760/1280/1920 px had no document-width overflow and accessible footers; production repeated30 cases at 320/375/760/1280/1920 px. Physical microphone, independent field, and AI promotion checks remain outside this software result.

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

The standalone [`field_lab.html`](../field_lab.html) serves the E1–E5 campaign, with its own persistent logging, CSV, comparison, and optional PCM WAV export. Its35 separate tests cover all 10 main-engine fixtures at both rates, full PSD/weighted-level parity, changing-signal averages, quality gates, true-bin60/120 candidates, collection/storage/export behavior, and interruption races. Native virtual-microphone captures at 48k yielded240,000/720,000/1,440,000 samples and 57/174/350 frames for 5/15/30 s. Every track ended and context closed. Stop, hidden page, muted/pre-muted input, and late permission canceled without logging a numeric row. Corrupt storage was preserved for recovery; Clear persisted after reload. Browser widths320/390/1280 had no document overflow or page/console errors. The campaign table intentionally scrolls horizontally within its container.

These checks do not establish hardware accuracy or retroactively validate [FIELD_LOG.md](FIELD_LOG.md). Its original notes retain explicit missing-provenance, duration, source, and unsupported-device-offset limitations; the instrument/version that produced them is unknown.

OpenAI Codex assisted development and software verification. Core calculations and report wording are deterministic. The optional local CLAP comparison uses downloaded model/runtime files and no remote inference endpoint. No generative legal text, audio upload, or automated complaint submission is included. Upstream model and library attribution is recorded in [RESOURCES.md](RESOURCES.md).

## V3 recorded relative comparison — October 18, 2026

The [frozen comparison protocol](../ml/BASELINE_COMPARISON_PROTOCOL.md) was committed before the 416 reserved clips were encoded or classified. The exact original website eight-description worker/runtime was compared with the frozen audio-only CLAP encoder plus trained integer head. The encoder was not fine-tuned; prompts, parameters, rejection rules, quality policy and metrics were unchanged during final evaluation.

The original website DSP worker froze a common mask before either classifier: 409 eligible rows (218 known, 191 unknown), seven blocking-quality joint abstentions, zero baseline errors and all 416 paired rows retained. Full denominators remain 222 known and 194 unknown. Saved row outcomes independently reproduce known-family macro F1 **0.7779942504 versus 0.3944968826**. V3 emitted 103 known-family hints on eligible true-known rows, 98 correct (**95.15% precision; 103/218 = 47.25% coverage**); baseline emitted 216, with 95 correct (**43.98% precision**). Unknown family-hint rates were **7/191 versus 182/191**. Correct V3 accepted coverage was 18/36 buzz, 17/35 fan, 30/49 speech, 11/52 traffic and 22/46 wind. All five predeclared relative recognition checks passed; [AI_V3_RESULTS.md](AI_V3_RESULTS.md) includes full denominators, subgroups, actual top-two baseline exposure and limitations.

This does **not** pass the older strict bar. The original development audit retains its 6/116 unknown accepts and 10.8268% Wilson upper bound. On eligible final unknown rows, 7/191 gives a **7.3705%** upper bound above 5%; full 194 upper bound is 7.2594%. Accepted true-known predictions of wind are 22/25 = **88%**, below 90%. Creator labels, repeated hive/collection conditions, source/class confounding and possible encoder-pretraining overlap prevent a field/general-accuracy conclusion. Traffic's 11/52 correct acceptance and ToBee OSBH's 0/11 correct acceptance remain visible.

Software prechecks available before mounted-app integration:

| Check | Recorded result / scope |
| --- | --- |
| Frozen fitted-head parity | 1,360 development/synthetic cases, zero quantized-coordinate, six-score, margin, label or gate differences. |
| Verified worker qualification | All 26 original software fixtures plus two startup cases matched full stage hashes and 512D vectors exactly; no fresh final recordings were used for this qualification. |
| Exact legacy transport | Two fixed synthetic inputs completed through the unchanged public eight-description worker; pinned artifact bytes/options retained, including the 307 streaming transport. |
| Prepared panel/head loader | 40 tests passed; strict TypeScript check passed. Lazy loading, native first-five-second copying, quality blocking, one-worker ownership, abort/stale isolation, integrity rejection and accepted-family-only output were checked without mounting the new app. |
| Comparison/harness regressions | 12 comparator and eight harness synthetic checks passed. They cover fixed denominators/arithmetic, input/source/quality/browser bindings, immutable snapshots and mismatch rejection; they do not query fresh audio. |
| Prepared public payloads | All 23 byte-index entries verified, totaling 50,887,143 bytes. Recording credits match all 1,358 development rows; licenses are CC0/CC BY. No MIMII recording is in fitted-head data. |

Recognition evidence: [paired archive](../ml/runs/2026-10-18-website-relative-comparison/), completion SHA256 `a00a2e2adfff98b7021076c62ac1a2cc82e02a635d8c24bdf2d42cdc2c1d6375`, result SHA256 `c0958e60c0bbf70dbbb1b0d3737b8a3f6a57f5fcad6b57a11dca1eacfea41e23`. Historical strict fit evidence remains in the [first-fit archive](../ml/runs/2026-10-18-v3-first-fit/README.md).

### Completed local mounted-app V3 checks

The final isolated Chrome session `v3-app-final` exercised the built app at loopback with a generated 63 Hz/48 kHz virtual microphone. The [raw browser record](qa/2026-10-18-v3-browser.json) binds its actual source hashes and results. This does not validate a physical microphone or recognition accuracy on real nuisance sounds.

| Check | Actual observation |
| --- | --- |
| Combined suite and build | **428 tests across 21 files**, TypeScript/Vite build passed; all 23 opaque static payloads remained byte-exact. |
| Live 15-second capture | Meter responded, capture completed at 48 kHz, report retained **720,000 samples and 174 frames**. AI disclosure retained first 5 seconds versus full 15-second DSP/report scope. |
| Consent / real model | No AI request before Explore. The actual model returned **No sound family suggested** for the generated tone. This software fixture has no claimed expected family. |
| Startup evidence | The successful result passed the panel's exact provenance and `selfTestPassed` checks. Transient self-test UI text was too quick to observe, so the record does not claim it was seen or timed. |
| Lifetime | At most **one** encoder worker. Clear/unload, retry/cancel and navigation while the unchanged graph request was held passed; releasing the old request produced **zero stale hints**. |
| Corruption | Same-length corrupt head and graph each failed closed, with the standard spectrum/report still available. No fallback classifier or guessed family appeared. |
| Native text and print | **7,718-byte/117-line** native TXT omitted individual bins and AI. PDF print retained the unchanged **6,579-character** actual SVG path and full 15-second metadata. |
| Six pages and footers | Home, Observation, Learn, Map, Sources and Report at **320/390/1280 px**, visual viewport scale 1: zero horizontal overflow and reachable footer bottoms within **0.5 CSS px**. |
| Network and runtime | **99 same-origin GETs**, zero request-body bytes, zero page errors and zero console errors in the final session. |

The first session crossed preview rebuilds and requested a stale Map chunk, causing a 404; its ignored logs are preserved. The final evidence above comes from a fresh session against the fixed completed build. Updated six-page screenshots are linked from [README.md](../README.md). Public V3 HTTPS verification also passed at source `3488836`; [its separate evidence](qa/2026-10-18-v3-public.json) records real loading, startup checks, cancellation, report export and 320/1280 px layouts. Previous legacy-model evidence remains historical. The software result leaves all recorded strict model failures, coverage limitations and outstanding hardware/field validation intact.
