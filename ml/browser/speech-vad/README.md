# Local speech interference feasibility

The fixed upstream Silero model can add a short-window speech screen to a whole 5, 15 or 30 second microphone capture. It is separate from the frozen CLAP family head. Speech interference supports advice to record the equipment again without talking. It does not establish whether a sound is from a data center, and a clean screen does not establish speech absence or physical recording fidelity.

## Pinned public source and interface

- Official repository: [snakers4/silero-vad](https://github.com/snakers4/silero-vad/tree/1e261b036686cd0017d500ee96acd1c4ba572a9d).
- Model: [`src/silero_vad/data/silero_vad_16k_op15.onnx`](https://raw.githubusercontent.com/snakers4/silero-vad/1e261b036686cd0017d500ee96acd1c4ba572a9d/src/silero_vad/data/silero_vad_16k_op15.onnx), **1,289,603 bytes**, SHA256 `7ed98ddbad84ccac4cd0aeb3099049280713df825c610a8ed34543318f1b2c49`.
- Source revision: `1e261b036686cd0017d500ee96acd1c4ba572a9d`; [MIT license](https://github.com/snakers4/silero-vad/blob/1e261b036686cd0017d500ee96acd1c4ba572a9d/LICENSE).
- `input`: Float32 `[1,576]` comprising 64 prior context samples and 512 new mono 16 kHz samples. The final partial frame alone is zero padded.
- `state`: Float32 `[2,1,128]`, initialized to zero for every recording. `sr`: Int64 scalar `16000` with dimensions `[]`.
- Outputs: `output` Float32 `[1,1]`, `stateN` Float32 `[2,1,128]`. Carry state and last 64 input samples to the next frame. Reset for each new recording.
- The existing faster-whisper asset is different: `silero_vad_v6.onnx`, 1,245,151 bytes, batched `input,h,c` interface. The production wrapper must not confuse these schemas.

The [prospective protocol](protocol.json) was written before sample predictions. Its thresholds and duration rules follow the pinned [upstream implementation](https://github.com/snakers4/silero-vad/blob/1e261b036686cd0017d500ee96acd1c4ba572a9d/src/silero_vad/utils_vad.py): threshold 0.5, negative threshold 0.35, speech longer than 250 ms, 100 ms silence before splitting, and 30 ms padding. Time steps are 32 ms, so intervals are approximate. Short speech and masked or distant speech can be missed. These scores are not calibrated probabilities of recording accuracy.

## Observed feasibility results

The browser used the exact already qualified ORT-Web `1.31.0-dev.20260914-8d85527a0` WASM, loader and JavaScript bundle from `public/ai/canonical-v3`, with one thread, fixed SIMD and sequential WASM execution. No new inference runtime is needed.

1. The standalone 16 kHz anti-aliasing resampler matched independent **SciPy 1.15.3** Float32 `resample_poly` output byte for byte for six fixtures: 44.1/48 kHz impulse, random and 12 kHz controls. The high-frequency controls were attenuated before downsampling. No source PCM was changed, normalized or denoised.
2. Interval segmentation matched the upstream pure probability-to-timestamp function on **2,000** independently generated traces at fixed defaults, including hysteresis, padding and partial tails.
3. All **12** browser recordings were run twice with exact repeat results and no input mutation. Python ORT 1.31.0 and browser intervals matched, with maximum per-frame score difference `0.0000020265579223632812`.
4. Three INVC candidate recordings and the university compressor comparator had no speech flagged, for both full files and first five seconds. These agree with earlier separate automated annotation and are not independently adjudicated field labels.
5. The narrated sports cooler control was flagged at **0.066–2.174 s** and **6.562–8.670 s**. Its first five seconds retained the first flag.
6. A **software 30 second fixture** containing the narrated excerpt starting at 20 seconds was flagged at **20.066–22.174 s**. A 30 second zero waveform had no flags. The fixtures establish temporal coverage, not field recognition performance.

On this desktop Chrome run, the 30 second scan took about 0.49–0.51 seconds and the 44.1-to-16 kHz conversion about 0.08 seconds. Other devices can be slower. Model load and large existing ORT download are separate from those times. The browser released the session after completion. The single browser console error was a research-server `favicon.ico` 404; model and runtime resources loaded successfully.

Raw full-file probabilities, source hashes, native preparation commands, Python reference and browser evidence are retained under ignored `output/speech-vad-study/`. Only compact qualification metadata belongs in the repository. These were development probes on an already researched provider cluster. There was no training, threshold fitting, query of the old 416-clip comparison cohort, or new CLAP query.

## Production implementation and qualification

The implementation is now in new `src/ai/speechVad*.ts` files, with a typed `scanSpeechInterference(pcm, sampleRateHz, { signal, onProgress })` API. The caller retains its native PCM. The dedicated worker verifies model/runtime bytes, passes the fixed32-frame startup reference, scans the complete capture, releases its inference session, and is terminated before the promise resolves. The model, MIT license and provenance are under `public/ai/speech-vad/`; no field recordings were added to public assets.

The actual Vite-compiled worker passed **16 browser checks** across **nine complete captures**:5/15/30 seconds and both native rates. The15s software control flagged10.082–12.254s; the30s control flagged20.066–22.174s at both44.1/48kHz. Same-size model corruption and existing WASM corruption failed closed before inference. Cancellation during model startup rejected with `AbortError`; a subsequent scan succeeded. Every observed worker terminated before its promise returned, maximum concurrent worker count was one, all native inputs were preserved, and analysis network traffic was same-originGET with no PCM upload. There were no browser execution errors in the qualification flow.

The **28 focused unit tests** cover capture lengths, copied transfer ownership, cancellation/stale messages, result provenance/interval coherence, timeout/crash paths, independent SciPy byte references, alias rejection, interval hysteresis/tails, tensor/context/state reset and disposal, startup failures, and exact downloaded model/runtime bytes. Strict TypeScript passed. Compact results, raw-evidence hashes, fixed parameters and source hashes are retained in [qualification.json](qualification.json). The isolated browser harness initially had a relative-path/output-buffer error and an overexact15s timestamp assertion; those were harness corrections, with no model/policy adjustment. Initial deep-array unit comparisons also exceeded the test timeout and were replaced with complete-buffer hashes.

VAD downloads its1.29MB model and the existing pinned14.36MB runtime before the51MB CLAP bundle starts. Although the runtime files are shared assets, each verified worker currently fetches them again, so a fresh combined run transfers about67MB in total (about52MB unique assets). Keep the user disclosure consistent with actual network requests.

## App use and limits

Run the worker on the full native44.1/48kHz capture and await it before the existing CLAP family worker begins. Keep microphone audio local and existing cancellation/stale result ownership in the panel. If VAD fails, show **Speech check unavailable**; do not infer a clean recording.

Expose **Possible speech interference** and approximate intervals when a qualifying segment is found, with advice to avoid talking and record the persistent equipment sound again. Otherwise say **No speech flagged**, with a short reminder that quiet or masked speech can be missed. Keep the separate CLAP family result for broad sound identification. A fan-like result remains compatible with multiple cooling/equipment sources and is not a verified data-center match.

Useful product tests include late speech in 15/30 second captures, both microphone rates, expected 157/469/938 frame counts for 5/15/30 seconds, partial inference tails, state reset, input preservation, no model requests before explicit analysis, model/runtime corruption, exact model schema rejection, canceled operations, resource release and stale results after a new recording or route change.

## Reproduce the local diagnostic

1. Download the pinned official model, source `utils_vad.py` and MIT license into `output/speech-vad-study/`. Prepare an isolated SciPy 1.15.3 / NumPy 2.2.6 dependency directory under `output/speech-vad-study/python`.
2. With the previously retrieved public INVC research files in their existing ignored source directory, run `prepare.py`, then `node verify-preprocessing.mjs`, then `node prepare16k.mjs` from the repository root with the full script paths.
3. Run `cpu_reference.py` in the existing ignored annotation virtual environment (ORT 1.31.0), then `node ml/browser/speech-vad/server.mjs`.
4. Open `http://127.0.0.1:4194` in a fresh browser and click **Run fixed study**. The exact existing WASM executes each record twice and compares it to the CPU reference, saving `browser-proof.json` locally.

This is a feasibility study. It does not qualify any new data-center source classifier for release.
