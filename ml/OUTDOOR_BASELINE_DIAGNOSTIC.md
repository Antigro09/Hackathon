# Outdoor development diagnostic — frozen before classifier queries

Protocol date: 2026-10-18. This is a **development diagnostic**, not a new held-out
evaluation, model fit, data-center classifier, or promotion decision. The existing
V3 five-family head, thresholds, encoder and production assets remain frozen.

The candidate pool uses the first five decoded seconds of these newly retrieved
INVC originals, in this fixed order. The spoken sports-facility control was
excluded during source annotation, before any classifier query:

| ID | Original SHA-256 | Provider context |
| --- | --- | --- |
| invc-outside-inside | `89d05d6cdb0c3c922fe2513264d0728eb31d39c46ab29b359a33d83abe58f4f3` | Exterior portion of an outside/inside data-center cooling comparison. |
| invc-before-after | `628d37c3e977b64bbe1e8dc917d6b8ef7d0a5124b80c1bec9d81ad4b962589bd` | Before mitigation in the consultant's chiller/AHU case. The after section is still a data-center recording, never a negative. |
| invc-150m | `fad13734deeeb8d6422ccf941a0c768692933d9840450d773fe7d5310f792b7b` | Resident smartphone recording described by the consultant as 150 m from an existing site. |
| invc-sports-dry-cooler | `338d3ea6a8d1498f395f003482d2e089a1e3d95b08f94a4d4bca898c0d96bac8` | Outdoor cooling at a sports facility; a candidate non-data-center confound. |
| invc-university-compressor | `b5ae7b6951b090edbec216c3a5955c04942969a09227fc57f5e632343f15f4c6` | Replacement development confound: rooftop chiller compressors at a university building; no speech detected in the fixed first five seconds. |

Treat these as **one conservatively dependent provider collection**, with
anonymous facilities, incomplete capture metadata and source claims supplied by
the provider. These are candidate contextual labels, not independently audited
causal truth. Their first-five-second intervals precede the documented edit
transitions and were selected by a fixed start rule before model predictions.
ASR/VAD annotations may flag narration; their absence cannot prove natural audio
or a physical source. The full before/after source has a later near-full-scale
sample; preserve that fact rather than changing gain or describing the full file
as free of such samples. Pinned local ASR/VAD found spoken introductions in the
sports-facility file and no uninterrupted five-second speech-free interval.
Exclude that file from this diagnostic. The three data-center candidates had no
detected speech; that does not independently validate their physical source.

Preparation uses FFmpeg's ordinary MP3 decoder, mono PCM Float32 WAV, exactly
five seconds, with no gain, normalization, padding or repetition. Preserve native
44.1 kHz for the first input. Explicitly resample the three native 22.05 kHz
eligible inputs to 44.1 kHz; this restores no lost bandwidth and is part of the recorded
preparation contract. Reject a short, silent, nonfinite or near-full-scale
prepared input instead of altering it to pass. Record original/prepared/PCM
hashes, software version and exact commands before inference.

Use `ml.browser.prepareCanonical` then `extractCanonicalNode.mjs` with the
existing pinned browser-WASM encoder. Apply the deployed, hash-verified
`tonalwatch-head-v3.json` and exact `integerHeadV3.js` to every completed embedding.
Report all four eligible accepted families or abstentions, including failed inputs and
the excluded spoken control. Do
not select a different crop or tune thresholds after viewing these outputs.
Do not query or reuse any inspected V1/V2/V3 evaluation recordings.

A fan-like suggestion on a data-center example is broad acoustic context. The
same suggestion on the sports-facility example demonstrates why it cannot be
interpreted as a data-center detector. No recognition accuracy percentage,
unseen-facility performance, microphone fidelity or causal attribution follows
from this diagnostic. Once inspected, these files remain development data and
cannot be relabeled as a fresh final test.

The separate outdoor-corpus audit must identify an independent prospective
training/calibration/test collection and real lookalike controls before fitting
a new source-specific head. A metadata pass is not a promotion gate. Preserve
this protocol and all results, including abstentions and failures, in Git; keep
raw third-party recordings in ignored local research storage.
