# Verified-module worker qualification

Recorded October 18, 2026. The research worker's production-style verified-module loader reproduced all **26** original prepared-PCM qualification embeddings exactly against the pinned Chrome reference. Two additional synthetic startup cases matched their saved full stage hashes. This checks numerical/loading behavior in the captured Windows Chrome 155 loopback run. **No fitted classifier was included or scored; `promotionAllowed=false`.** The archive does not authorize app activation or deployment.

| Recorded check | Cases | Retained comparison | Result |
| --- | ---: | --- | --- |
| Original qualification set through the worker | 26 | All 512 actual worker coordinates plus input/resampled-PCM/feature/embedding hashes | Exact coordinate equality; maximum difference 0 |
| Synthetic startup cases | 2 | Actual stage hashes and full expected reference vectors | Every recorded stage hash matched |
| Loopback server requests | 46 | Method, path and status | All GET, all HTTP 200 |
| Browser console | One captured run | Raw console export | 0 errors, 0 warnings |
| Worker lifecycle | One captured run | Status, ready, 28 embedding messages and disposed acknowledgement | Final captured phase `disposed`; no recorded errors |

The 26-case set is the same 12 earlier FSD50K validation clips, eight earlier MIMII validation clips and six generated tone/noise fixtures used in the [canonical qualification](../2026-10-18-v3-canonical/README.md). The six generated fixtures cover 44.1 and 48 kHz; the 20 recorded-sound fixtures are prepared at 48 kHz. These are diagnostic software inputs, without new sound-family adjudication or fresh final-test evidence. MIMII remains excluded from v3 development fitting and the final/release source policy. The two additional startup fixtures are a five-second 44.1 kHz square wave and five-second 48 kHz seeded integer noise.

## Raw identity and code snapshots

The four requested captures are byte-preserving copies from `output/production-worker-v3-qa/`:

- `browser-qualified.json`: SHA256 `ae0743d80565d78784c4a839adce5cba102efe2a862d36c7f923ed00a08d3f93`, 553,063 bytes.
- `requests-qualified.json`: complete saved server method/path/status metadata and immutable route identities.
- `browser-requests-qualified.txt`: original browser request export, including its static-request omission annotation.
- `console-qualified.txt`: original console export. Its original line endings are preserved.

The qualified worker is `productionWorkerV3.mjs`, SHA256 **`f622383fb66b1090f98f59739eea13971915eabe419af090ad833b1b436a5713`**. Its byte-identical source is retained under `source/`, alongside the current QA harness/server, packager, synthetic generator, canonical encoder/checkpoint validator and resampler/model/scorer TypeScript sources. The server's recorded worker and harness route hashes match these copies. The source packager hash `984745bb7bce808c51d1c3769032a3b01124bedb8383e21dd9aa8d0523d87e34` matches the archived runtime manifest's own packager binding. These are preserved source snapshots and recorded route identities, not remote code-execution attestation.

`runtime/asset-manifest.json` has SHA256 `12d9497e5a9bfa12c29df76eb1b816c7bfc499ceb2ed98c16835ceaedcb4213d`. Its 17 static asset hash/size/MIME declarations match the server's route metadata. The runtime is the same audio-only q8 CLAP revision and single-threaded ONNX Runtime Web WASM pipeline recorded in the canonical archive. The 34,301,667-byte encoder graph's recorded route SHA256 is `3fcff2c8824e7bcb83a983f2a49edab3b60cbcf4872ac70efee517355173bd1f`; graph bytes and upstream runtime binaries are not copied here.

The trusted bootstrap verifies module bytes before constructing Blob modules. ORT, model config, canonical encoder and synthetic generator retain their executed source hashes. The packaged Transformers module redirects two import specifiers to the verified ORT Blob URL; the resampler redirects one import specifier to the verified model-config Blob URL. Recorded `moduleBindings` distinguish verified file hashes from executed adapter hashes and record those rewrite counts. Blob URLs vary, so adapter hashes are run-specific. This archive preserves those recorded hashes and the bootstrap source; it does not contain every executed Blob module's text or assert that adapted bytes are identical to the packaged source.

## References and verification

`reference/chrome-reference.json` is the exact Chrome reference, raw SHA256 `f713e30fb35ed458a3ec80337476bf2e0feccf627e8a2e5d27248563610404f4`. `reference/qualification-staged-manifest.json` preserves the exact source metadata/order and per-clip attribution, SHA256 `25448ca576662cf21511b2f691100e6e8d93d4f76c985bc35e6da55430f63e68`. `reference/self-test-v3-reference.json` retains both full **expected** startup vectors and stage hashes, SHA256 `6d5414df3b9413283c88f599887d149314c9c8fb189c5324205b452e33a2212d`.

The worker capture contains all 26 actual qualification vectors. Its two top-level startup records retain actual stage hashes and provenance but omit the actual vectors. They match the full expected vectors' Float32 hashes. The archive therefore distinguishes 26 retained actual vectors from two retained expected vectors with matching actual hashes; it does not invent missing actual startup arrays.

Run the read-only stdlib verifier:

```sh
python ml/runs/2026-10-18-v3-worker-qualification/verify-qualification.py
```

It checks the complete raw-file index, independently pinned worker/browser/reference identities, served source and asset declarations, recorded module adapters, all 26 Float32 vector hashes and exact coordinate comparisons, startup hashes, request methods/statuses and lifecycle/console metadata. `verified-summary.json` records its bounded results. `artifact-index.json` hashes and sizes every other archive file and identifies raw source-copy paths; the index excludes itself.

No raw PCM, log-mel matrices, audio files, encoder weights, fitted candidate parameters or fresh-final embeddings/predictions are included. PCM/feature stage hashes can be compared here but cannot be regenerated without the separate working audio bundle. The original cache paths and clip licenses/attributions remain unchanged in the staged metadata; this archive does not relicense them as MIT code.

## Limits of this evidence

The server capture records 46 allowed loopback requests to `http://127.0.0.1:4192`, all GET/200, without request bodies. The browser export shows loopback GET requests and explicitly suppresses 11 static entries. The two logs have different capture scopes and are not asserted to have identical inventories. They demonstrate the recorded local loading path, rather than prove absence of every browser process's unrelated traffic. Dependency/bootstrap delivery, CSP configuration and the final public HTTPS workflow require their own checks.

Prepared PCM bypasses microphone acquisition, interruptions, device processing and original compressed-file decoding. Matching old fixture vectors does not establish sound-family accuracy, useful accepted coverage, unfamiliar-sound rejection, calibrated probabilities, equipment/source identity, field reliability or general parity across browser/device versions. Fitted-head Python/JavaScript parity, untouched final evaluation, app quality/cancellation/lifecycle boundaries, independent field validation and license review remain separate release gates. No scoring rules, model thresholds or numerical tolerances were changed by this archival verification.
