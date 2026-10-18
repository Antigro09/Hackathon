# TonalWatch

TonalWatch helps a resident document a recurring hum: capture or load a short audio sample, inspect its frequency content, add observation notes, and export a source-linked observation packet.

**Live app:** [tonalwatch.vercel.app](https://tonalwatch.vercel.app). Open **Observation → File → Choose File → Analyze file** to import a recording. PCM WAV is the supported baseline: at least five seconds, up to 10 MiB. Audio is analyzed locally and is never sent to a server.

The app reports **uncalibrated weighted digital levels**, a captured-spectrum C−A difference, and a separate experimental sustained-peak indicator. It also offers an optional, local AI sound comparison that always remains uncertain. These features do not identify equipment, establish legal compliance, or replace a qualified acoustic measurement. A weak or inconclusive result still supports a descriptive observation.

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

- **Synthetic demos:** ten deterministic five-second signals, including tones, a harmonic hum, seeded broadband noise, a short beep, silence, and clipping. Every synthetic result and report remains labeled as a demonstration.
- **Microphone:** explicit start, a 0.5-second warm-up, then exactly five seconds of mono PCM through a silent AudioWorklet graph. A live digital RMS/peak meter previews the actual incoming samples and flags the digital limit. Capture detects missing chunks and interruptions, supports cancel, and releases audio resources.
- **Local file:** browser decoding, first channel, first five seconds from offset zero, up to 10 MiB. PCM WAV is the baseline format; other codecs depend on the browser. Files shorter than five seconds are rejected. The effective decoded rate is reported because decoding can resample.
- **Analysis:** the same worker-based PCM engine handles every input. A frequency spectrum accompanies two independent screening indicators and recording-quality flags.
- **Context and report:** manual setting/location, recurrence, conditions, and unverified suspected-source notes; separate Loudoun, Prince William, and unknown/other reference profiles; a read-only preview, print/save-PDF with the captured spectrum, and text download including the spectrum metadata and numerical bins. Reports snapshot the selected result so later inputs cannot change an export.
- **Optional AI sound hints:** an explicit Explore action loads a quantized CLAP model in a dedicated worker and compares the recording with eight fixed sound descriptions. The top two relative scores are similarities within that comparison set, not probabilities or confirmed sources. Silence, clipping and other blocking quality states cannot request the model. Cancel, reset and replacement input invalidate pending hints; model failure leaves standard analysis and reports available.
- **Session handling:** new input and reset invalidate old results. Analysis replies carry a session ID so late replies cannot replace the current observation.

The app processes audio and notes in browser memory. It has no audio upload, analytics, automatic GPS, account storage, or automatic complaint submission. Optional AI requires external model/runtime downloads only after Explore; inference receives the PCM locally. Browser caches may retain downloaded model files, not recordings or notes. Raw audio and AI suggestions are not attached to exports. Downloaded reports can include personal notes and location descriptions; the preview asks the user to review these before sharing.

Once served, the bundled demonstration, calculation, meter, and report paths use no external service. Opening official reference links or downloading the optional AI model/runtime requires connectivity. Cached model availability depends on the browser; offline AI is not guaranteed. This repository does not include a service worker or an installable offline app.

## Method and limits

Algorithm version: **`tw-screen-v1`**. The tested sample rates are 44.1 and 48 kHz. The engine uses complete 8,192-sample frames, a periodic Hann window, and a 4,096-sample hop. It removes each frame's mean, computes a normalized one-sided PSD, averages linear power, and integrates normalized A/C-weighted power from 20 Hz to min(20 kHz, Nyquist). Five seconds produces 52 complete frames at 44.1 kHz or 57 at 48 kHz.

The short level labels “A relative” and “C relative” mean dB relative to **digital RMS 1**, not dBA/dBC sound-pressure levels. C−A can be negative. Its 15 dB screen is a prototype convention. Constant gain cancels mathematically; frequency-dependent microphone response, processing, wind, clipping, and room acoustics do not.

The experimental peak check searches 40–2,000 Hz for a narrow peak with at least 12 dB local prominence, at least 60% local power concentration, and presence in at least 80% of all complete frames, with at least 20 frames required. Frame persistence is descriptive, not a confidence probability. This is not standardized tonality or a county's legal steady-tonal definition.

The live input meter is an unweighted preview in dB relative to digital RMS 1, with a −90 to 0 dB display range and a separate peak mark. It aggregates worklet chunks at no more than ten updates per second, including warm-up; it does not feed the final analysis or estimate acoustic sound pressure.

Sound hints use `Xenova/clap-htsat-unfused` at revision `c28f2883575e590e04d3146ff0713c2448d691ba`, with Transformers.js **4.3.1**, quantized `q8` weights and single-threaded WASM. The main weights file is **161,024,085 bytes**, with additional configuration/tokenizer and ONNX runtime downloads. A separate copy is resampled from its actual rate to 48 kHz. The processor uses five seconds of captured audio followed by five seconds of zeros; this does not add observation time. Its feature band is approximately 50 Hz–14 kHz and differs from the screening engine. All rankings remain **uncertain**, including those that pass provisional score/separation gates, because independent source-type performance has not been validated.

Non-finite, unsupported-rate, incomplete, near-zero, clipped, and no-band-power input remains inconclusive. Known or unknown processing is disclosed. Five seconds cannot characterize a night of exposure or reproduce the counties' formal measurement procedures. County selections supply dated reference context and cannot determine applicability or a violation.

## Code and validation

| Location | Purpose |
| --- | --- |
| `src/analysis/` | FFT/PSD, normalized weighting, peak heuristic, fixtures, typed worker |
| `src/audio/` and `public/capture-worklet.js` | Capture lifetime, indexed sample collection, local decoding |
| `src/ai/` | Optional local model worker, pinned downloads, resampling, fixed labels and abstention policy |
| `src/report/` | Deterministic report model, preview, print rendering |
| `src/data/references.ts` | Curated source summaries, dates, access status, interpretation text |
| `src/App.tsx` and `src/components/` | Input → result → context → report workflow |
| `tests/` | Numerical reference, quality, mocked capture/import, and report tests |

The current integrated suite passed **129 tests** covering the engine, capture/meter, report spectrum, and AI policy/lifecycle; the original baseline passed 74 tests before these additions. See [validation notes](docs/VALIDATION.md) for completed runs, browser evidence, and outstanding physical-device checks. Chrome checks include actual local model inference, a five-page PDF with the spectrum, and AudioWorklet capture with a virtual input. Software and synthetic-input checks do not validate a physical measurement chain or AI source accuracy.

View the pages: [Home](docs/screenshots/home.png) · [Observation](docs/screenshots/observation.png) · [Report](docs/screenshots/report.png) · [Sources & method](docs/screenshots/sources.png).

The public HTTPS deployment was checked in Chrome with native WAV decoding, AudioWorklet capture using a virtual input, optional local model inference, and report download. See [deployment verification](docs/DEPLOYMENT.md) and the [File input screenshot](docs/screenshots/file-input.png).

## Planning history and attribution

The current app implements the corrected user-supplied plan preserved in [BUILD_PLAN.md](docs/BUILD_PLAN.md). Its proposed schedules, pilots, and future validation are not completion claims. [TEAM_BRIEFING.md](docs/TEAM_BRIEFING.md) is retained as historical material and contains superseded claims. The current implementation status and claims are recorded here and in [VALIDATION.md](docs/VALIDATION.md). Official-source access and verification status are documented in [RESOURCES.md](docs/RESOURCES.md).

`mic_spike.html` and `range_finder.html` are retained pre-existing research artifacts. The current React/TypeScript runtime and analysis were implemented separately; those HTML spikes are not imported or used by the app, and their old validation/calibration claims are not current results. This record does not establish an organizer ruling about event eligibility or code reuse.

OpenAI Codex assisted with implementation, tests, documentation, and software verification. Core DSP and report generation remain deterministic. Optional sound hints use the [Xenova CLAP conversion](https://huggingface.co/Xenova/clap-htsat-unfused) of [LAION CLAP](https://huggingface.co/laion/clap-htsat-unfused), through [Transformers.js](https://github.com/huggingface/transformers.js) and [ONNX Runtime](https://github.com/microsoft/onnxruntime). The upstream LAION model declares Apache-2.0; the conversion card does not separately declare a license. Model and dependency licenses remain separate from the project's [MIT License](LICENSE). See [the source ledger](docs/RESOURCES.md) for attribution and [validation notes](docs/VALIDATION.md) for exact pinned versions and limits.
