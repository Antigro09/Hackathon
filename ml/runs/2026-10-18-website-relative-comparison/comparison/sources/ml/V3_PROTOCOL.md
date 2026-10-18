# Third sound-hint experiment and release criteria

Planning date: October 18, 2026, America/New_York. The user requested continued improvement, integration when ready, work on main, a push after each feature, and Vercel deployment. This protocol is fixed before any new final-audit predictions. Data-availability amendments may add independently attributed sources before fitting; they must not relax success criteria after observing scores.

## Problem and task

V2 had weak traffic coverage, accepted unfamiliar sounds and differed between native CPU and browser execution. Its tests are now historical diagnostics. Preserve the five broad labels: buzz, mechanical fan, speech, traffic and wind. They describe sound families rather than equipment, electrical hum, facilities or faults. A separate unknown/background training class and explicit abstention are required. Neither classifier scores nor acceptance indicate a calibrated probability or source identity.

## Canonical runtime

Use the pinned CLAP audio-only encoder and pinned single-threaded ONNX Runtime Web WASM as the canonical feature/embedding pipeline for fitting, calibration and qualification. Do not infer browser behavior from native Python/Node ONNX execution. Record model/config/processor/runtime bytes, browser version, execution settings, preprocessing source, input PCM identity and the complete extraction manifest. Compare repeated and fresh-session browser runs on development examples before extracting the final audit.

The observation remains five seconds of mono input at 48 kHz followed by five seconds of zeros for the encoder. Preserve the existing tested resampling and first-channel policy. Report qualification separately for prepared Float32 PCM and any original-file decoding checks. No hidden source normalization or repeated/padded short recordings may become real five-second audit examples.

Train a compact linear head with deterministic integer scoring instead of shipping all training embeddings. Freeze embedding/weight scales, symmetric rounding, integer bounds, tie order, margin definitions and conservative quantization guard before calibration. All dot products must remain exact within JavaScript's safe integer range. A local quantization guard does not establish tolerance to encoder/backend changes. A candidate must fail closed on malformed artifacts, non-finite input, incompatible contracts or unsupported runtimes; retaining old provisional rankings is not a fallback for failed trained-model validation.

## Learning and split roles

Fit a balanced regularized logistic classifier over five known classes plus unknown/background, comparing C in {0.01,0.1,1,10} and unknown weights in {1,2} using grouped cross-validation inside training only. Group-balanced weights prevent repeated clips from one source dominating a class. Prefer the simpler configuration on exact ties. Calibrate integer known-versus-all-rivals rejection margins on separate known/unknown calibration groups. Select the five class thresholds jointly under an aggregate 2.5% empirical unknown-calibration budget, requiring at least 20% correctly accepted coverage and 90% accepted-known precision per class. Prefer balanced minimum class coverage, then total correct acceptance, with deterministic ties.

Keep training, calibration, development audit and final audit source groups disjoint. Previously inspected first/second-run audio may support explicitly labeled development, including unknown-class training; it cannot be new final evidence. All new final groups, source IDs and original/prepared/PCM fingerprints must exclude every first/second-run record and all current development roles. Retain collection/hive/machine/uploader/source-recording lineage; do not count multiple crops, conditions, codecs or channels from one recording as independent groups. No final-audit predictions may select C, weights, threshold, input policy, supported class or runtime.

Choose sources, caps, segments and quality exclusions without model predictions. Preserve creator, original source, clip license, actual rate/channels, crop offsets and download/member hashes. Prefer CC0/CC BY sources. More restrictive collections cannot silently inherit the repository's MIT license or a clean-source label; distribution terms for any model artifact must be explicitly resolved before release. Record dataset/device confounding and source-label quality rather than treating public tags as field ground truth.

## Fixed final-audit readiness criteria

All criteria are required; a class cannot be dropped after failure:

- Each known class has at least 20 eligible final examples from at least three genuinely distinct source groups.
- For every true known class, at least 20% of its clips and at least five clips are correctly accepted.
- Every predicted known class has at least 90% empirical precision among accepted known examples.
- Overall accepted-known precision is at least 90%, with a clip-level Wilson 95% lower bound of at least 80%.
- At least 100 unknown final examples from at least ten groups are present, and their overall false-accept Wilson 95% upper bound is at most 5%.
- Report per-class confusion/coverage, unknown accepted labels, source-group results and counts, plus acceptance precision on the tested known/unknown mixture. Clip-level intervals do not account for correlated sources, threshold selection or field shift.
- The actual exported head and original gates must reproduce classification/acceptance exactly for the same canonical embeddings in the app worker. Repeated supported browser runs must not change those decisions. Original-file/resampler and quality/cancellation/network boundaries receive separate end-to-end checks.

Freeze a candidate before final evaluation and retain its input/output hashes. If any criterion fails, record that failure and preserve the audit as historical evidence; further learned changes need another untouched final set. Successful software checks alone cannot mark a model ready.

## Integration and release

Only a qualified, attributed candidate may replace the current live model. Sound-family hints remain optional, local, clearly limited and excluded from measurement reports. Unfamiliar or ambiguous input shows an abstention with no invented source. Keep quality gating, loading/cancel/reset isolation, first-five-second boundaries, worker disposal, ordinary analysis/report availability and explicit model downloads. Verify the full public HTTPS workflow after deployment. Work directly on main, commit/push each completed feature and deploy the verified app to the existing TonalWatch Vercel project.
