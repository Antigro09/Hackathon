# Outdoor development diagnostic

Protocol and input identities were committed/pushed before classification at
`54f24c63af267a788543bac72fc81265d0010777`. All four prepared windows passed their
fixed five-second digital checks. The unchanged production V3 head abstained on
all four: three provider-documented data-center candidates and the university
cooling confound. This exposes a real development coverage gap; it is not a new
recognition accuracy estimate or evidence that the sites were quiet.

No new head was fitted or promoted. The corpus audit remains blocked: these
anonymous cases share one conservative provider group, source/music audition is
incomplete, and there are no independent calibration/test sites with the required
controls. Training on some of these files and testing on variants would not
establish improvement on an unseen facility. They are now inspected development
data and cannot become a fresh final test.

`annotation-summary.json` records input/annotation hashes, local speech-screen
versions, the pinned tiny.en revision and model-file hashes. Automated screening
rejected narration in the sports cooling example and WWMT news package. It does
not prove the remaining candidates' source identity or absence of music. Neither
raw audio nor full news transcripts are included in Git.

`source-manifest.json` and `staged-manifest.json` preserve exact original,
prepared WAV and Float32 PCM identities, first-five-second crop commands, native
rates and quality values. Three native22.05kHz inputs were explicitly prepared
at44.1kHz without restoring their original bandwidth. No gain, padding, repeated
audio or prediction-selected crops were used. The annotated later full-source
near-full-scale sample is retained in the source review; it was outside the
predeclared before-mitigation window.

`canonical-contract.json`, `embeddings.json` and `canonical-checkpoints/` retain
all four pinned512D browser-WASM encoder outputs and runtime bindings. The model
graph, preprocessing, resampler, head and integer scorer are unchanged. Original
head SHA256 is `1e373cd18cbd706812dac10b19a320b73a568e6ee40e3f34236e03ae6122f491`.
`baseline-results.json` retains every abstention. The scorer's initial wrapper
mistakenly looked for a checkpoint hash at the top level; it failed before any
prediction. The corrected wrapper uses the existing checkpoint validator and
per-repeat hash. No input or scoring rule changed.

Reproduction uses the ignored original files at the paths in the preparation
script, FFmpeg, NumPy and soundfile0.13.1, then the existing pinned canonical
encoder. `prepare_inputs.py` refuses an existing output directory. Preserve a
previous run rather than overwriting it. The source URLs/hashes allow retrieving
the same public originals, subject to their availability.

```powershell
python ml/runs/2026-10-18-outdoor-development/prepare_inputs.py
python -m ml.browser.prepareCanonical --manifest output/outdoor-development-2026-10-18/source-manifest.json --output output/outdoor-development-2026-10-18/staged
node ml/browser/extractCanonicalNode.mjs --manifest output/outdoor-development-2026-10-18/staged/manifest.json --output output/outdoor-development-2026-10-18/canonical --cache output/ml-cache --repeats 1
node ml/runs/2026-10-18-outdoor-development/score_baseline.mjs
```

The user selected public sources only; no outreach was sent. Provider and raw
media availability are not evidence of dataset independence or field fidelity.
