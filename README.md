# TonalWatch
https://devpost.com/software/1491280/joins/Nij1p-V0pzKgPOyTLHf5SQ

TonalWatch helps a resident document a recurring hum: record a short live microphone sample, inspect its frequency content, add observation notes, and export a source-linked observation packet.

**Live app:** [tonalwatch.vercel.app](https://tonalwatch.vercel.app). Open **Observation**, select **5, 15, or 30 seconds**, then start microphone capture. Live microphone is the only observation input. Audio is analyzed locally and is never sent to a server.

The app reports **uncalibrated weighted digital levels**, a captured-spectrum C−A difference, and a separate experimental sustained-peak indicator. Optional local AI can suggest one of five broad sound families or leave a sound unclassified. These limited experimental hints do not identify equipment, establish legal compliance, or replace a qualified acoustic measurement. A weak or inconclusive result still supports a descriptive observation.

**V3 release status, October 18, 2026:** the frozen comparison against the website's actual eight-description baseline passed all recorded relative recognition criteria. The mounted V3 app passed local build and browser QA; public V3 HTTPS deployment is verified at source `3488836`. See [measured results and remaining limits](docs/AI_V3_RESULTS.md) and [browser evidence](docs/qa/2026-10-18-v3-browser.json); [public release evidence](docs/qa/2026-10-18-v3-public.json) records the deployed V3 workflow. Earlier deployment records remain historical.

## Run locally

The build was checked with Node.js **24.18.0** and npm **11.16.0** on Windows. Dependency versions are pinned in `package.json` and `package-lock.json`.

```sh
npm ci
npm run dev
```

Open the localhost URL printed by Vite, normally `http://127.0.0.1:5173`. Microphone capture requires HTTPS or localhost, browser permission, and AudioWorklet support. Opening the HTML directly from disk is not a supported launch method.

```sh
npm test
npm run build
npm run preview
```

The production build is written to `dist/`; preview normally serves it at `http://127.0.0.1:4173`. Deploy the contents of `dist/` to a static host. Hash routes do not require application route rewrites. No API key, backend, account, or environment file is required.

## Current workflow

- **Navigation and Learn:** Home, Observation, Learn, Map, and Sources & method are reachable from the main navigation. Learn and the compact explanation under the results explain the independent indicators. Five click-to-play tones (63, 125, 500, 1,000, and 8,000 Hz) start quietly, have a stop control, and release playback on navigation. Playback is blocked during capture/analysis; microphone recording is blocked while a tone plays. The 20–200 Hz exhibit plots actual PSD bins from the active result, with 60/120 Hz reference lines and the existing peak candidate when applicable. It does not identify mains electricity or add frequency resolution.
- **Microphone:** explicit start, a 0.5-second warm-up, then exactly the selected **5, 15, or 30 seconds** of mono PCM through a silent AudioWorklet graph; five seconds is the default. A live digital RMS/peak meter previews the actual incoming samples and flags the digital limit. Capture detects missing chunks and interruptions, supports cancel, and releases audio resources.
- **Analysis:** a worker-based PCM engine analyzes the captured microphone samples. A frequency spectrum accompanies two independent screening indicators and recording-quality flags.
- **Context and report:** manual setting/location, recurrence, conditions, and unverified suspected-source notes; separate Loudoun, Prince William, and unknown/other reference profiles; a read-only preview, print/save-PDF with the captured spectrum, and concise text download with spectrum metadata and no individual bin rows. Duration, sample count, complete frames, spectrum, and weighted levels describe the **entire selected DSP window**. Reports snapshot the selected result so later inputs cannot change an export.
- **Demonstration map:** 14 invented examples retain synthetic labels on pins and cards, with fictional devices/times and illustrative coordinates. Map colors describe only the low-frequency screen; peak results remain separate. An active observation can be added to the session list or placed using manually entered coordinates associated with that observation. No location is inferred; unknown locations stay unplaced, and inconclusive readings remain descriptive. Everything resets on reload or session clear. The default neutral coordinate grid needs no tile service. **Load street map** explicitly opts into OpenStreetMap requests that disclose the viewed area and IP address to its provider; tile failure returns to the grid/list. No offline street-map package is provided.
- **Previous-capture comparison:** the Buddy-check control shows current C−A minus the previous completed capture's gap, retaining input provenance and synthetic warnings. Two usable gaps are required; missing/inconclusive values are not zero. This descriptive session comparison neither calibrates devices nor links phones, corrects readings, or pools map data.
- **Optional V3 sound hints:** an explicit Explore action downloads about **51 MB** of same-origin model/runtime assets. A verified CLAP audio encoder runs in one dedicated worker; a frozen trained head accepts a broad buzz-like, mechanical fan-like, speech-like, traffic-like or wind-like family, or abstains. Only accepted families appear, without percentages, scores or closest-label guesses. The model sees **only the first five seconds**, even when DSP/report analysis covers 15 or 30 seconds. A separate copy preserves the full recording. Silence, clipping and other blocking quality states cannot request the model. Startup hash checks, cancel, reset and replacement input protect the current session; AI failure leaves standard analysis and reports available. Clear hints unloads the worker.
- **Session handling:** new input and reset invalidate old results. Analysis replies carry a session ID so late replies cannot replace the current observation.

The app processes audio, notes, comparisons, and manual map locations in browser memory. It has no audio upload, analytics, automatic GPS, account storage, or automatic complaint submission. V3 AI loads static same-origin model/runtime files only after Explore; PCM stays local and inference makes no audio request to a server. Online map tiles are a separate opt-in network path. Browser caches may retain static files or tiles, not recordings or notes; availability across model starts/reloads is not guaranteed. Raw audio and AI suggestions are not attached to exports. Downloaded reports can include personal notes and location descriptions; the preview asks the user to review these before sharing.

Once served, microphone capture, Learn player/exhibit, neutral-grid map/list, calculation, meter, and report paths use no external service. Opening official reference links, choosing online map tiles, or downloading the optional AI model/runtime requires connectivity. Cached model availability depends on the browser; offline AI is not guaranteed. This repository does not include a service worker or an installable offline app.

## Method and limits

Algorithm version: **`tw-screen-v2`**. The tested sample rates are 44.1 and 48 kHz. The engine uses complete 8,192-sample frames, a periodic Hann window, and a 4,096-sample hop. It removes each frame's mean, computes a normalized one-sided PSD, averages linear power, and integrates normalized A/C-weighted power from 20 Hz to min(20 kHz, Nyquist). Complete frame count follows `1 + floor((actual samples - 8192) / 4096)` for usable inputs. Five seconds produces 52 complete frames at 44.1 kHz or 57 at 48 kHz; longer observations retain all complete frames without padded tails.

The short level labels “A relative” and “C relative” mean dB relative to **digital RMS 1**, not dBA/dBC sound-pressure levels. C−A can be negative. Its 15 dB screen is a prototype convention. Constant gain cancels mathematically; frequency-dependent microphone response, processing, wind, clipping, and room acoustics do not.

The experimental peak check searches 40–2,000 Hz for a narrow peak with at least 12 dB local prominence, at least 60% local power concentration, and presence in at least 80% of all complete frames, with at least 20 frames required. Among qualifying tracks, v2 selects the strongest median three-bin linear power, then persistence/prominence ties. This prevents a much weaker clean quantization artifact from winning solely on local prominence; it does not establish a fundamental frequency or source. A/C levels, PSD and eligibility gates are unchanged from v1. Frame persistence is descriptive, not a confidence probability. This is not standardized tonality or a county's legal steady-tonal definition.

The live input meter is an unweighted preview in dB relative to digital RMS 1, with a −90 to 0 dB display range and a separate peak mark. It aggregates worklet chunks at no more than ten updates per second, including warm-up; it does not feed the final analysis or estimate acoustic sound pressure.

V3 sound hints use the frozen audio-only `Xenova/clap-htsat-unfused` encoder at revision `c28f2883575e590e04d3146ff0713c2448d691ba`, with Transformers.js **4.3.1**, quantized weights and the qualified single-thread standard WASM runtime. The audio graph is **34,301,667 bytes** and the WASM binary is **14,264,838 bytes**; modules, configuration and the small head bring the disclosed download to about 51 MB. The head was trained on frozen CLAP embeddings; the encoder was **not fine-tuned**. Its fixed integer scores and original rejection rules produce five broad families plus an unknown outcome. Two deterministic synthetic startup inputs must reproduce exact intermediate hashes before the worker processes recorded audio.

The separate five-second copy retains its actual supported 44.1/48 kHz rate until the canonical worker resamples to 48 kHz. The processor appends five seconds of zeros; this adds no observation time. Its approximate 50 Hz–14 kHz feature band differs from the full-window screening engine. Hints remain limited and experimental; the buzz class includes insects and does not validate electrical-hum or equipment identification.

Non-finite, unsupported-rate, incomplete, near-zero, clipped, and no-band-power input remains inconclusive. Known or unknown processing is disclosed. A 5/15/30-second browser sample cannot characterize a night of exposure or reproduce the counties' formal measurement procedures. Longer duration does not establish procedural compliance. County selections supply dated reference context and cannot determine applicability or a violation.

## Code and validation

| Location | Purpose |
| --- | --- |
| `src/analysis/` | FFT/PSD, normalized weighting, peak heuristic, fixtures, typed worker |
| `src/audio/` and `public/capture-worklet.js` | Microphone lifetime and indexed sample collection (decoder retained for historical research tests) |
| `src/ai/` | Optional local model worker, pinned downloads, resampling, fixed labels and abstention policy |
| `src/report/` | Deterministic report model, preview, print rendering |
| `src/data/references.ts` | Curated source summaries, dates, access status, interpretation text |
| `src/data/readings.ts`, `src/analysis/comparison.ts` | Synthetic/manual map provenance and descriptive capture comparisons |
| `src/App.tsx` and `src/components/` | Input → result → context → report workflow |
| `tests/` | Numerical reference, quality, mocked capture/import, and report tests |

The application and lab passed **428 tests across 21 files** (388 existing checks plus 40 V3 panel/head-loader checks), TypeScript and Vite build. All 23 opaque product payloads stayed byte-exact in the build. In a fresh Chrome session, a generated virtual microphone completed a 15-second/48 kHz capture with a live meter, 720,000 samples and 174 frames. No AI request preceded Explore; the real model returned **No sound family suggested** for this synthetic software fixture. The panel validated successful startup provenance; the transient self-test text was too quick to observe.

The mounted app passed one-worker ownership, clear/unload, retry/cancel, navigation/stale-result isolation and same-size corrupt-head/graph rejection while preserving the ordinary report. The native text download was 7,718 bytes/117 lines with no raw bins or AI result; print retained the actual spectrum. All six routes fit 320/390/1280 px at scale 1 with reachable footers. The final session recorded 99 same-origin GETs, zero request-body bytes and no page/console errors. Separate numerical qualification covers 1,360 fitted-head development/synthetic cases and 26 original worker fixtures plus two startup cases. See [VALIDATION.md](docs/VALIDATION.md) and [raw browser evidence](docs/qa/2026-10-18-v3-browser.json). Public V3 HTTPS verification also passed; see [deployment evidence](docs/DEPLOYMENT.md). Software/generated-input checks do not validate a physical measurement chain or AI field accuracy.

View the current pages: [Home](docs/screenshots/home.png) · [Observation](docs/screenshots/observation.png) · [Learn](docs/screenshots/learn.png) · [Map](docs/screenshots/map.png) · [Report](docs/screenshots/report.png) · [Sources & method](docs/screenshots/sources.png) · [Local AI panel](docs/screenshots/sound-hints.png). These screenshots show the locally verified build; hosted release evidence is recorded separately.

The previous public HTTPS build was checked in Chrome with virtual-microphone AudioWorklet capture, legacy local inference and report download. That evidence does not verify the V3 release. See [deployment verification](docs/DEPLOYMENT.md).

## Planning history and attribution

The app follows the corrected technical claims in [BUILD_PLAN.md](docs/BUILD_PLAN.md), with the user-approved Learn/Map/longer-capture/comparison extension described in [CODEX_ORDER.md](docs/CODEX_ORDER.md). Planning schedules, pilots, and future validation are not completion claims. [TEAM_BRIEFING.md](docs/TEAM_BRIEFING.md) is retained as historical material and contains superseded claims. The current implementation status and claims are recorded here and in [VALIDATION.md](docs/VALIDATION.md). Official-source access and verification status are documented in [RESOURCES.md](docs/RESOURCES.md).

`mic_spike.html` and `range_finder.html` are retained pre-existing research artifacts. The current React/TypeScript runtime and analysis were implemented separately; those HTML spikes are not imported or used by the app, and their old validation/calibration claims are not current results. This record does not establish an organizer ruling about event eligibility or code reuse.

The standalone [`field_lab.html`](field_lab.html) supports the separate E1–E5 campaign with persistent logging, CSV, raw PCM WAV export, and descriptive comparison. Its repaired full-window estimator matches the main engine in numerical tests; exact5/15/30-second capture, quality gates, interruption cleanup, and storage recovery passed separate browser checks. These verify software behavior rather than physical accuracy. [FIELD_LOG.md](docs/FIELD_LOG.md) preserves supplied notes as unverified historical observations; missing audio/provenance and inconsistent durations do not establish hardware accuracy, a device calibration offset, or source identity.

## V3 sound-family comparison

The frozen V3 system passed the [precommitted comparison](ml/BASELINE_COMPARISON_PROTOCOL.md) against the website's actual unmodified eight-description model on 416 reserved public clips. Both systems used the same pre-AI quality mask: 409 eligible examples (218 known, 191 unknown), with seven blocked rows retained as joint abstentions.

| Recorded measure | V3 | Legacy website baseline |
| --- | ---: | ---: |
| Ungated known-family macro F1 | 0.777994 | 0.394497 |
| Correct among emitted known-family hints on true-known clips | 98/103 (95.15%) | 95/216 (43.98%) |
| Family hints on eligible unknown clips | 7/191 (3.66%) | 182/191 (95.29%) |
| Hint coverage on eligible known clips | 103/218 (47.25%) | 216/218 (99.08%) |

The gain comes with abstention: V3 leaves more than half the eligible known examples without a hint. Correctly accepted coverage is 18/36 buzz, 17/35 fan, 30/49 speech, 11/52 traffic and 22/46 wind; traffic is weakest. The original strict development audit failed, and the strict criteria still fail on this final cohort: the eligible-unknown 95% Wilson upper bound is 7.37% (limit 5%), and accepted-known wind precision is 22/25 = 88% (limit 90%). The revised relative comparison does not erase either failure. Creator labels, insect-buzz collections, dependent groups and possible encoder-pretraining overlap limit interpretation; these numbers do not establish field or general-population accuracy. See [full results, denominators and evidence](docs/AI_V3_RESULTS.md).

## Historical sound-hint experiments — superseded

On October 18, 2026, the first [Colab experiment](https://colab.research.google.com/github/Antigro09/Hackathon/blob/main/notebooks/TonalWatch_Audio_Training.ipynb) completed on **725 selected public clips**. It trained a small classifier on frozen CLAP embeddings; it did not fine-tune the encoder or replace the eight-description deployment at that time. Its dataset, uploader/content separation and held-out metrics remain historical evidence, with `promotionAllowed: false`. See [measured results and limitations](docs/AI_EXPERIMENT_RESULTS.md) and [experiment methods](ml/README.md). It is superseded by the separately qualified V3 candidate; its old parity/promotion status is not a statement about V3.

The October 18, 2026 [second preregistered experiment](ml/V2_PROTOCOL.md) completed on **1,226 public clips**, adding separately attributed MIMII machine recordings and 23 held-out IVBEE honeybee clips. Training-group CV selected a balanced linear classifier, C=10; validation alone selected rejection gates. On that same historical test cohort, frozen v1 versus v2 macro F1 was **0.8281 versus 0.8496**, with **61/65 versus 71/72** accepted known hints correct. V2 correctly accepted **0/20 traffic clips** and falsely accepted **11/190 unknown clips**, and was not integrated. Its model, results and research checks remain superseded historical evidence. V3 excludes MIMII from fitting/calibration and uses a separately frozen cohort; scores across those different cohorts are not a paired improvement estimate. See [V2 results and limitations](docs/AI_V2_RESULTS.md), [raw artifacts](ml/runs/2026-10-18-v2/), and the [experimental browser scorer](ml/browser/README.md).

OpenAI Codex assisted with implementation, tests, documentation, and software verification. Core DSP and report generation remain deterministic. Optional sound hints use the [Xenova CLAP conversion](https://huggingface.co/Xenova/clap-htsat-unfused) of [LAION CLAP](https://huggingface.co/laion/clap-htsat-unfused), through [Transformers.js](https://github.com/huggingface/transformers.js) and [ONNX Runtime](https://github.com/microsoft/onnxruntime). The upstream LAION model declares Apache-2.0; the conversion card does not separately declare a license. Model and dependency licenses remain separate from the project's [MIT License](LICENSE). See [the source ledger](docs/RESOURCES.md) for attribution and [validation notes](docs/VALIDATION.md) for exact pinned versions and limits.
