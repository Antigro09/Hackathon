# Frozen candidate versus the website's actual sound-hint baseline

Protocol date: October 18, 2026, America/New_York. The user explicitly changed the acceptance goal to **better than the base model the website uses**. This protocol is frozen before any encoding or classifier query on the reserved 416-record cohort. It compares two fixed systems; it does not authorize another fit, prototype filter, prompt search, threshold change or final-driven model selection. The proposed v4 support-filter experiment is stopped and is not part of this comparison.

The original v3 development audit failed its strict preregistered criteria. Preserve that failure and all original metrics. Neither this relative comparison nor the user's revised product criterion makes the original v3 experiment pass. The old calibration and audit outputs have already been inspected and are historical development evidence, not an independent test for this new decision.

## Cohort and unchanged inputs

Use exactly `ml/runs/2026-10-18-v3-data/final-data.json`, raw SHA256 **`197e24e42c36de1368f9cd25424c98a4f8935af7c60429c4521d8d80feaa9520`**: 416 rows, comprising buzz 36, mechanical fan 35, speech 52, traffic 52, wind 47 and unknown 194. Thus 222 rows have one of the five known labels. The creator-label, collection and field-domain limitations in that source audit remain applicable. The `quiet background` prompt is not a ground-truth label for all 194 unknown sounds.

The cohort has been downloaded and screened using metadata/quality rules, but has **not been encoded or predicted by either comparison system at protocol freeze**. Preserve every selected row and order. All final IDs, uploader/physical-session/collection groups and original/prepared/PCM hashes must exclude every historical v1/v2 record, including excluded sources, and all v3 development roles. Retain failed/superseded final reservations too. The exact reservation SHA256 is `08f9e9bcd5eecdcf7fe3273ffd8d8e75397ce3291938fd0d32fe6b8e10ea5b7b`.

Both systems receive the same five-second, first-channel, prepared Float32 recording with the same actual sample rate and frozen quality checks. Preserve finite samples, peak below 0.999, RMS at least 1e-5, no gain, no additional crop selection, no looping/padding short audio and no source normalization. The AI processor's five seconds of zero padding adds no observation. Preserve original recording and PCM hashes; no model-dependent quality or class exclusion is allowed.

**Before either classifier's outputs**, run the exact public built `analysis.worker-BwKrUFVx.js` on all 416 original five-second inputs at their actual rate, using the original `tw-screen-v2` analysis method. Apply the unchanged legacy blocking-quality-code policy equally to both systems. Freeze the common quality-eligible row mask and its known/unknown/per-class denominators before any classifier result is inspected. The primary recognition comparison uses that same eligible subset for both systems. Preserve all 416 rows' eligibility, quality codes, errors and full original class denominators. Blocking quality means **both abstain/no hints** in the end-to-end outcome; it cannot advantage the candidate. Report full-cohort coverage too, with blocked rows retained as abstentions. No outcome-based dropping or substitution is allowed. A technical analysis error remains recorded and prevents claiming a completed comparison until its non-predictive cause is resolved; it is not an extra favorable exclusion. Prepared public inputs are software/recognition fixtures, not actual microphone-acquisition validation.

## Fixed website baseline

The baseline is the actual legacy website implementation at immutable commit **`322d40e0d9a0146e35c61e1a46b05d7e9fffb662`**, including `src/ai/soundHints.worker.ts`, `environment.ts`, `input.ts`, `resample.ts`, `policy.ts`, `labels.ts`, `model.ts` and `SoundHintsPanel.tsx`. `package-lock.json` raw SHA256 is `4690db98c91f334bf00441f83519cb4313c942fa75f34222df9b58d5f869510a`; the label file SHA256 is `2be9a6b5e8381def215842bb72e4e4ea102e2359e782a7c304bbc54515948be8`.

Use the **unmodified, fetched public build**. Public/local byte comparisons established these identities before fresh model queries:

| Exact baseline/public asset | Bytes | SHA256 |
| --- | ---: | --- |
| `soundHints.worker-BshSXPiJ.js` | 5,204 | `26f40691a2c49f2c717beee0a4f415a1003db4f2d5c4c72ebc27cc2d644005b8` |
| `transformers.web-B7_wdX-V.js` | 545,164 | `06dfd43d60e53f8c5c191f9054abf594297c4f577eb68b337b89cd26824af8af` |
| `analysis.worker-BwKrUFVx.js` | 10,766 | `a5918dda07bf28fd7b705d797734185446be9d13ab0feb7f5b5a5025717d443f` |
| `ort-wasm-simd-threaded.asyncify-CxOG5pUO.wasm` | 26,861,777 | `49871f5a4409519797e127440868a6d1923339d9185907f301a5b2a1d90af082` |
| ONNX Runtime Web `ort-wasm-simd-threaded.asyncify.mjs` | 53,057 | `0966b6105cd936744498aa60df7a22cbd47af3374dbc64a9ab561c08a71e3611` |

The built worker, transformer, analysis worker and WASM assets are from `https://tonalwatch.vercel.app/assets/`; the matching versioned asyncify loader is `https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.0-dev.20260914-8d85527a0/dist/ort-wasm-simd-threaded.asyncify.mjs`. Retain exact fetched bytes and request provenance. The legacy asyncify runtime and the candidate's qualified standard WASM artifact set are different; preserve each actual system's runtime rather than swapping one backend's outputs into the other.

Reproduce its Transformers.js **4.3.1** `pipeline('zero-shot-audio-classification', ...)`, model `Xenova/clap-htsat-unfused`, revision `c28f2883575e590e04d3146ff0713c2448d691ba`, `dtype='q8'`, `device='wasm'`, one WASM thread and `proxy=false`. Preserve `hypothesis_template: '{}'`, the actual tokenizer padding/truncation, combined audio/text graph and all eight original alternatives. Do not substitute the earlier matched-five-label zero-shot research baseline or the audio-only branch for the website pipeline.

| Pinned baseline file | SHA256 |
| --- | --- |
| `onnx/model_quantized.onnx` (161,024,085 bytes) | `3f559313ec268518193101007fc0569ee4b2cfac03e369091c50adb4795f5c5d` |
| `config.json` | `39c6d90fe29cf2cce650dd5c92c38a1e35b130d9ce0bb98585222ad687ad979b` |
| `preprocessor_config.json` | `9739f58296aa6f9ac18008fd0150fb2649bc554985fbde86d0a4041c882ac753` |
| `tokenizer.json` | `dc239041d98de27ffc3975473a1a23e3db4c937b23c138c38bbc66588bd247e5` |
| `tokenizer_config.json` | `2c964a338683aec3695ea37687271e75b40905233f5d2a5bbb9be8cb40c4d0a0` |

Preserve the legacy download environment: revision-pinned Hugging Face URL template, browser model cache enabled, local model discovery disabled, and explicit user initiation in product use. Benchmarking may serve the **same pinned bytes** from local storage, without audio uploads. Such a transport adapter must be documented and must not change prompts, tokenization, graph, numerical operators or output policy. Use the pinned browser library/ONNX Runtime Web WASM path, not native Python/Node ONNX Runtime. Record exact model/config/tokenizer/library/runtime bytes, actual runtime/session options, OS, browser or Node/V8, software/source hashes and any import/transport adapter before the fresh run. Relevant lockfile runtime is ONNX Runtime Web `1.31.0-dev.20260914-8d85527a0`; do not silently choose another backend or fall back after failure. Numerical reproduction checks on existing development/software fixtures precede fresh queries and are reported separately from accuracy.

The descriptions and their **predeclared coarse evaluation mapping** are:

| Original index | Exact prompt | Coarse label |
| ---: | --- | --- |
| 0 | `a buzzing indoor fluorescent light fixture or lamp ballast` | `buzz` |
| 1 | `an outdoor electrical transformer humming` | `buzz` |
| 2 | `outdoor industrial ventilation fans or cooling machinery humming` | `mechanical_fan` |
| 3 | `a household fan or air conditioner running` | `mechanical_fan` |
| 4 | `road traffic passing outside` | `traffic` |
| 5 | `wind blowing across a microphone` | `wind` |
| 6 | `people talking in a room` | `speech` |
| 7 | `a quiet room with background noise` | `__unknown__` (evaluation control only) |

The unmodified website worker internally ranks the original **eight** descriptions but returns only its top two. Map the first returned original prompt to obtain baseline top-one. Do not sum scores from two prompts into a family, rerun with five descriptions, or modify the worker to expose all eight scores. Exact score ties preserve original prompt order, as the stable sort of the original pipeline-order results does in the website. Preserve the exact two returned labels/scores plus `status`, `reason` and `provisionalGatePassed`, their mapped families, worker preprocessing/timing metadata and any failure. Do not claim an observed full eight-score matrix.

The actual website always returns `status='uncertain'` and shows its closest **two** descriptions after a successful comparison. Its provisional `top1>=0.55` and `top1-top2>=0.20` check changes explanatory wording, not whether those rankings appear. Do not misrepresent its uncertain banner as universal abstention. Conversely, mapping prompt 7 to `__unknown__` is a fixed metric control, not proof that the website rejects every unfamiliar sound, nor proof of a quiet recording. Relative CLAP scores are not probabilities.

## Fixed candidate

Use the already fitted v3 head, with **every original gate unchanged**:

| Frozen artifact | SHA256 |
| --- | --- |
| `research_head_v3.json` raw bytes | **`1e373cd18cbd706812dac10b19a320b73a568e6ee40e3f34236e03ae6122f491`** |
| Frozen parameters and original rules | **`6f1119be47ffeea7fcf8b3e1b4212af7d387cdef14667c3c871f46e9c98c8a92`** |
| Fit completion raw bytes | `74cf3f85891cba5f940d8e19ef61eae1d922e1e1640605df48dac09d376a7dee` |
| Development source manifest raw bytes | `e0c86b5613b2c0b16e3f6df8f19abe7241228eb30b3df40f67ba1632b08d9ff7` |
| Complete development embeddings raw bytes | `4c6cfb659085a23b9420fd11d3945d3e670adaf7e6ed302c4e85c0f317c59200` |

The head was selected with C=0.1 and unknown weight=1.0. This is provenance, not a new search grid. Its fixed class order is buzz, mechanical fan, speech, traffic, wind, `__unknown__`; ties use the first class. Keep exact signed-half-away quantization, integer coefficients, guards and inclusive gate rules. Unknown winners and rejected known winners produce **no family hint**. No nearest-neighbor/support filter is added.

Candidate input uses the qualified canonical audio-only graph `onnx/audio_model_quantized.onnx`, SHA256 `3fcff2c8824e7bcb83a983f2a49edab3b60cbcf4872ac70efee517355173bd1f`, the same model revision, and the frozen browser-WASM preprocessing. Runtime fingerprint is `f28a76756690691b355ee60359aaed7460b2c9674be6e8e10df2dd0159acdac9`; preprocessing fingerprint is `8a3c23901e5ef9b122ae5170c7da1d92c0d92aeea0c1aa8552997dc64b5a8fc8`. The candidate's audio-only graph and learned six-class head are intentionally different from the legacy combined graph/eight-text system. Compare those actual complete systems rather than claiming this isolates only classifier training.

Keep the original [strict v3 audit and criteria](V3_PROTOCOL.md) and [first-fit evidence](runs/2026-10-18-v3-first-fit/fit/development_v3.json). Existing head parity covers 1,360 development/software cases with zero quantization, six-score, margin, label or acceptance-bit differences. Existing worker evidence covers 26 original fixtures plus two startup checks. These are numerical checks, not proof of recognition or a fresh-test pass. Save their artifact identities with the new run.

## Primary paired metric and revised decision rule

Use the **common quality-eligible true-known subset of the original 222 known rows**, fixed by the pre-AI analysis above, and the same five known labels for both systems. Publish all eligible/blocked/error counts and per-class denominators before classifier outputs. Primary outcome is **top-1 macro F1 over those five labels**, with absent/never-predicted labels assigned zero F1; a class is never removed from the mean. If any class has no eligible examples, report an incomplete/inconclusive five-class comparison. The candidate's ungated six-class argmax is used; an unknown argmax counts as an abstention/false negative for its true known class. The baseline uses its mapped original-eight top-1; the quiet-control result likewise counts as an abstention/false negative. No gate, prompt-family aggregation or unknown-row class balance is chosen to improve this primary score. Also report full original-cohort operational coverage over all 222 known rows, with every quality-blocked row treated as a joint abstention.

Under the user's revised relative bar, the candidate is better for this tested cohort only if **all** of the following hold:

1. Candidate known top-1 macro F1 is **strictly greater** than baseline mapped known top-1 macro F1. Report both and their paired difference; no epsilon, class dropping or alternate primary metric after results.
2. Candidate precision among its **accepted true-known rows** is at least baseline precision among true-known rows whose mapped top-1 is a known family. Both numerators count correct family predictions and both denominators count all emitted known-family predictions on the true-known subset. An undefined denominator yields an inconclusive comparison, not an automatic pass.
3. Candidate accepted-family rate on the common quality-eligible unknown subset of the 194 original true-unknown rows is no greater than the baseline's mapped-top-1-known-family rate on those same rows. Retain exact counts and both eligible and full-194 denominators; blocked rows contribute no hints for either system in the full-cohort view. An empty eligible unknown subset is inconclusive. Prompt 7 remains a control, not a universal unknown ground-truth class.
4. Each of the five true-known classes has **positive correctly accepted coverage** from the candidate: at least one correctly accepted clip per class. Report exact successes/eligible total and successes/full original class total for every class; none may be silently removed.
5. Both systems complete the frozen paired cohort with valid compatible recorded software/inputs, and the candidate passes the independent browser, quality, cancellation and integrity checks below.

These are the user's **relative** replacement criteria, not the old stricter preregistered readiness bar. The old requirements of at least 20% and five correct acceptances per class, 90% per-class precision, 90% overall accepted-known precision with an 80% Wilson lower bound, and at most a 5% unknown-FAR Wilson upper bound remain **reported unchanged**, including any failures. They are not silently imposed as additional release criteria over the user's revised instruction, and they are not reported as passed unless the recorded results actually meet them. No claim of statistical significance or field reliability follows from relative improvement.

## Secondary outcomes and actual visible hints

For each system, report the ungated mapped confusion matrix on common quality-eligible inputs, per-class F1/recall, correctly emitted-family coverage for every true class, known output coverage, correct/incorrect known-family counts, unknown family-hint rate and unknown predicted-family distribution. Preserve all 416 row outcomes and provide eligible and full-cohort denominators; the full operational view assigns both systems no hints on blocking quality. Also report precision on the tested known/unknown mixture, where emitted family hints on true unknowns are errors. Distinguish that mixed precision from the true-known precision used in criterion 2.

The candidate's visible outcome is a family hint **only when its original gate accepts**; otherwise it abstains. Report its original strict audit metrics and intervals without changing rules. The baseline's visible outcome is its always-shown two closest descriptions. Preserve both raw descriptions, scores and mapped families; additionally report true-family inclusion in the top two and any-known-family exposure on unknown rows. Top-two exposure is descriptive and does not replace the predeclared mapped-top-one comparison criterion. A quiet top-one can still be accompanied by a known-family second hint; show that behavior explicitly. Preserve the uncertainty copy rather than presenting either output as equipment/facility identification.

Report source/collection/group counts and subgroup outcomes for both paired systems. Public creator labels, bee-hive/collection dependencies and dataset/device confounding limit interpretation; do not turn this into a source-location, legal, calibrated-confidence or population-accuracy claim. If an uncertainty interval for the primary paired difference is included, use a fixed 2,000-replicate paired, true-class-stratified clip bootstrap with seed 18043 and identical sampled indices for both systems. Label it descriptive: it ignores group/collection dependence and is not a new pass/fail significance criterion.

## Frozen execution, once-only use and integration

Commit this protocol **before any fresh cohort encoding/query**. Freeze the comparison implementation, both model/software/runtime contracts, raw input manifest and hashes, original candidate rules, mapping, tie behavior, metrics and complete paired row order before execution. Persist input evidence before inference and checkpoint each fixed system's results without changing contracts. Technical retries may complete missing identical work after an interruption; they may not alter learned parameters, prompts, preprocessing, quality criteria, backend or metric definitions, nor select a preferred stochastic result. Do not silently exclude or replace failed rows. Record operational failures separately; a missing pair prevents a successful complete-cohort recognition verdict.

Once this cohort is queried, it is inspected evidence. Preserve all outputs and failures. No final-driven refit, prompt mapping, gate/threshold relaxation, class deletion or alternate candidate on this same cohort may be presented as a new untouched test. Learned changes require another independent cohort. Relative comparison does not authorize v4 prototypes or any other unregistered model query.

Before product integration, require the exact exported candidate's head outputs and gate bits to match the unchanged Python references on identical canonical embeddings; repeat supported browser/software fixtures and verify the actual worker path. Keep the original acquisition/DSP quality gates, first-five-second boundaries, explicit local model loading, cancel/reset/stale-result isolation, disposal, no pre-consent download and no audio upload or remote inference. Optional AI failure must leave ordinary analysis and reports available. Hints remain broad, clearly limited and excluded from measured indicators and printed reports. Preserve provenance/creator attribution and resolve distribution terms for the exact model artifact; no implicit relicensing of data or conversion-repository weights.

Only a recorded relative pass plus these software/data/product boundaries supports the user's requested integration. Report the measured improvement and material weaknesses plainly, keep original strict failures visible, work on main, push the completed feature and verify the deployed public HTTPS workflow. A relative pass does not convert screening into certified measurement or establish physical-source identity.
