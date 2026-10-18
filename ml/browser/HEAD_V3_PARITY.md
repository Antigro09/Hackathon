# Frozen fitted-head Python/JavaScript parity

`checkHeadV3.py` and `checkHeadV3.mjs` compare the unchanged v3 Python scorer with the exact compiled `integerHeadV3.ts`. They perform no fitting, encoder inference, threshold selection, final-data scoring, activation or deployment. The result is a numerical software check, with no accuracy, probability, source-identity or field-reliability claim.

Run only after a head has been frozen. Supply the exact head file and the **complete ordered development extraction** used to fit it; a subset cannot replace the fitted manifest. The optional compact startup reference adds its synthetic normalized vectors to this offline head check. It does not change the future app startup gate, which separately compares encoder stage hashes.

```sh
python -m ml.browser.checkHeadV3 \
  --head FIT/research_head_v3.json --head-sha256 HEAD_RAW_SHA256 \
  --canonical DEVELOPMENT/embeddings.json --canonical-sha256 EMBEDDINGS_RAW_SHA256 \
  --staged-manifest DEVELOPMENT_STAGED/manifest.json --staged-sha256 STAGED_RAW_SHA256 \
  --self-test-reference ml/browser/fixtures/self-test-v3-reference.json \
  --self-test-sha256 6d5414df3b9413283c88f599887d149314c9c8fb189c5324205b452e33a2212d \
  --output NEW_PARITY_DIRECTORY --dependencies . --node node
```

The line continuations above are POSIX shell syntax; use one line or PowerShell backticks on Windows. Existing pinned Python ML dependencies and local `node_modules/typescript` are required. The utility does not install dependencies, download files or call a service. Canonical-only and compact-synthetic-only checks are also accepted; the CLI requires each supplied source's explicit lowercase raw SHA256. The Python API is:

```python
from ml.browser.checkHeadV3 import ParityInput, check_head_v3
check_head_v3(head_path, head_raw_sha256, [
    ParityInput(canonical_path, canonical_raw_sha256, staged_path, staged_raw_sha256),
    ParityInput(synthetic_reference_path, synthetic_reference_raw_sha256),
], output_dir, dependency_root=repository_path, node="node")
```

## Input and scorer binding

The head's raw bytes, frozen parameter/rule hash, complete development-manifest hash, readiness criteria, embedding contract and Python source identity are checked before scoring. Python source SHA256 is pinned to `640e11d60776d8f87f01e9c19f356c49bd5cc02c433e2abd8edb740aecc026d1`; TypeScript scorer source is `c89ed32798a923eaf19b62fabfda9a8b3ae87b5757fd57458e9ec54aa715b0f7`. The utility records its own Python/JavaScript sources and canonical/checkpoint validator sources. JavaScript refuses a source change between expectation generation and comparison.

Canonical `records[].checkpoint.embedding` are loaded through the strict canonical adapter, with explicit `source_record.role` and `source_record.v3_group` maps. Every row must be marked historical development, preserve its frozen split and pass complete staging, repeated-checkpoint and normalized Float32 checks. The resulting ordered clip/role/label/group/dataset/PCM manifest and encoder must match the head. Final/test roles, missing lineage groups, reordered/subselected cohorts and changed embedding contracts fail before predictions.

The compact reference format is `tw-v3-synthetic-startup-reference-v1`: each `cases[]` contains `id`, `normalizedEmbedding512` and `embeddingSha256`, with `fieldEvidence=false`, `classifierIncluded=false`, `promotionAllowed=false` and the same embedding contract. This checker validates supplied vectors and their hashes; it does not regenerate synthetic audio or reestablish encoder qualification. The shipped reference has two cases. Synthetic head outputs in this offline check are software fixtures and are not sound-family claims.

## Exact comparison

Python calls the unchanged `quantize_embeddings` and `predict_fixed_v3` for every supplied 512-value Float32 vector. It saves all 512 expected signed quantized coordinates, all six integer decision scores, class index, label, guarded margin and acceptance bit. No normalization, epsilon tolerance, gate override or coefficient adjustment is added.

The independent Node comparator reloads the **raw copied input files** instead of accepting vector values from an expected-result object. It checks raw source/head/model bindings and complete source order, then compiles the existing scorer with TypeScript 7.0.2. The compiler package, JavaScript launcher and executable-resolution source hashes are independently pinned; the platform-native compiler executable hash is recorded. Compiled scorer SHA256 must be exactly `5b969fa736aad8b336c198d24f20bf59bbe4e788ef7878ea86dd8126c20ed25f`. An explicit `type=module` output scope preserves these compiled bytes while making Node20 module loading unambiguous.

Every quantized coordinate and every prediction field is compared exactly. The JavaScript Float32-input and prequantized-input paths must also agree, and inputs must remain unchanged. The report records each case's actual six scores, label, margin, acceptance, embedding/quantized-array hashes and any mismatched fields. Passing requires **zero** coordinate, score, margin, label or gate differences. A failure remains a failure; it does not authorize threshold or tolerance changes.

## Durable output and limits

`input-evidence.json`, `head.json` and `inputs/` preserve original raw bytes before Python prediction. `python-reference.json` contains the full expected quantization/results. `javascript/` contains its own evidence, exact compiled scorer and `parity.json`. `completion.json` indexes every other successful output by SHA256 and byte length. Existing directories are refused, including failed attempts; `failed.json` and captured Node output preserve errors without resuming or replacing results. Outputs can contain development embeddings and predictions, so keep them in the ignored research output area until a separately reviewed archive/export is requested.

Synthetic regressions use fictitious axis heads and synthetic software vectors only:

```sh
python -m unittest ml.browser.test_checkHeadV3 -v
```

They cover exact threshold equality, closed/unknown/tied winners, positive and negative half ties, complete cohort and lineage guards, raw/frozen head tampering, Float64 rejection, independent detection of one-coordinate/one-score/one-margin/one-gate errors, swapped copied input bytes and compiler pin failures. No actual fitted candidate is scored by these tests.

This utility compares head arithmetic on identical saved embeddings. It does not run a browser, verify an app worker's loading/cancellation/network boundaries, prove encoder parity on live microphone audio, evaluate the untouched final cohort or resolve data/model licensing. The [canonical qualification archive](../runs/2026-10-18-v3-canonical/README.md) and [v3 release protocol](../V3_PROTOCOL.md) describe those separate gates. All generated evidence remains research-only and `promotionAllowed=false`.
