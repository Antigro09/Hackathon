# Exact website baseline comparison harness

Research only. This runs the unchanged public eight-description website worker;
it does not change the app or make a reliability claim. Follow the committed
[comparison protocol](../BASELINE_COMPARISON_PROTOCOL.md). Do not start a fresh
cohort classification until the harness and evaluator are committed and the
coordinator authorizes the frozen run.

`legacyBaselineV3.mjs` pins the public worker, transformer, analysis worker,
asyncify WASM/loader, combined CLAP graph, tokenizer and configurations. The
server verifies every asset before serving it. Final staging must match the
actual SHA-pinned 416-record source file, including full source records, order,
direct metadata and PCM hashes. Smoke mode accepts only the exact two fixed
startup synthetic inputs. All 416 outcomes, including blocked/error rows, remain
in immutable per-row checkpoints. No PCM is accepted by the checkpoint endpoint.

The page runs the original DSP on original-rate five-second PCM during the
separate quality phase. Classification consumes its previously frozen mask.
Eligible inputs use the unchanged, hash-checked compiled resampler and actual
public built legacy worker. Preserve its returned **top two**, raw scores,
always-uncertain status, reason and provisional gate. No five-prompt replacement,
family score summing, native ONNX substitute or confidence interpretation occurs.

The Playwright transport adapter fulfills only allowlisted original model/runtime
GETs with a 307 redirect to the verified loopback snapshot. Chromium streams the
161 MB graph directly; routing that body through Playwright caused two synthetic
startup interruptions before any result. The successful streaming qualification
preserves the original worker, graph and operator bytes. No audio leaves the
loopback server. Recorded browser requests and server GET/checkpoint logs support
that boundary; this harness is not microphone-acquisition validation.

## Running the frozen phases

Start the loopback server from the repository root, using a new output directory
for a new contract. Required final options are:

```powershell
node ml/browser/legacyBaselineServerV3.mjs --mode final --phase quality --manifest output/ml-v3-final-staged/manifest.json --output OUTPUT/quality --port 4193 --protocol ml/BASELINE_COMPARISON_PROTOCOL.md --protocol-sha b8a453622e02f340b6196c1dca62abecf2646176eb324a5401e2cf05fad38aca --protocol-commit dbb71588a7d4897f30fe6f64a395ace300cad6f1
```

Quality has no classifier, remote-model or transformer routes. Its completed
artifact includes every row and fixed eligible/blocked/error counts. Save the
measured browser identity and complete quality contract before either classifier
is queried. Existing completed quality-v2 uses approved raw source snapshots;
later transport/provenance guards do not rewrite that mask or its evidence.

For classification, change `--phase classify`, choose its output directory, and
add `--quality FILE --quality-sha SHA --quality-browser-evidence FILE
--quality-browser-evidence-sha SHA`. Both quality files are SHA-pinned. The server
writes its contract before allowing inference. Using the same isolated browser
environment, write `OUTPUT/browser-environment.json` **before** running:

```json
{
  "schemaVersion": 1,
  "qualityContractSha256": "COMPLETE_QUALITY_CONTRACT_SHA",
  "baselineContractSha256": "NEW_BASELINE_CONTRACT_SHA",
  "browser": {
    "userAgent": "ACTUALLY_MEASURED",
    "platform": "ACTUALLY_MEASURED",
    "hardwareConcurrency": 16,
    "language": "ACTUALLY_MEASURED"
  },
  "capturePhase": "before-baseline-classification",
  "promotionAllowed": false
}
```

Read all four browser values from `navigator`; the illustrative concurrency is
not an instruction to invent it. The page sends these measured values with the
run/checkpoint requests. The server checks them against the sidecar, prior quality
context, HTTP User-Agent and both contract hashes, and rejects changed resume
identity. Model/PCM assets are unavailable before authorization. Source snapshots
and checkpoints are immutable; changed contracts require a new directory.

Open an isolated Playwright CLI session at the server. For classification,
`run-code --filename ml/browser/legacyBaselineRoutesV3.js` is the explicit action
that **both installs routing and runs inference**, awaiting completion in the
same CLI invocation so callbacks remain alive. Do not use that command merely to
inspect the page. For quality, invoke the page's Run action without routing.
Use the harness Cancel action to terminate workers and retain completed rows.

## Recorded qualification and limits

The two fixed square/noise software inputs completed through the actual legacy
worker: two results, zero errors, original 44.1/48 kHz metadata retained, 240,000
resampled model samples, unchanged PCM, uncertain output, one-thread q8 WASM.
The second request reused the loaded model. This verifies software plumbing;
neither synthetic result is field-recognition evidence. Actual runtime options
are established by the unchanged verified worker and bundle; browser identity
is measured separately, rather than claimed as internal session introspection.

Run `node --test ml/browser/legacyBaselineV3.test.mjs` for byte pins, quality,
top-two policy, exact source/smoke identities and browser-sidecar rejection cases.
The comparison evaluator independently validates inputs, original approved
quality snapshots, current classification sources, browser evidence and every
paired row before computing the predeclared metrics.
