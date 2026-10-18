# Experimental browser classifier scorer

This folder stays outside the deployed app. It evaluates exported, frozen research classifiers; it does not train, publish or activate a model. `experimentalHead.ts` implements the pinned sklearn 1.7.2 linear and dense RBF-SVC decision rules, top-three training-reference affinity and class gates. It returns scores and an acceptance bit, not source-confidence probabilities.

Export only this project's own verified classifier and its original completion files:

```sh
python -m ml.export_v2 --model RUN/results/classifier_v2.joblib --environment RUN/run_environment.json --output experimental-head.json
npx vitest run --config ml/browser/vitest.config.ts
npx tsc --project ml/browser/tsconfig.json
python -m unittest ml.test_export_v2 -q
```

`fit_input_contract.json` must sit beside the completion environment. The exporter verifies the model, fit-contract, runtime, manifest/encoder bindings and frozen scoring source before loading the model bytes. The JSON and its SHA256 sidecar preserve model/source identity. The scorer validates and copies its input; it does not alter the saved gate thresholds.

Synthetic fixtures cover linear/binary/RBF scoring, multiclass voting ties, exact threshold boundaries, immutability and malformed inputs. Regenerate the fixture with `python -m ml.test_export_v2 --write-fixture` after a deliberate exporter change. Synthetic agreement alone does not establish audio preprocessing, ONNX backend, actual-candidate gate or field accuracy. Full candidate checks must record those stages separately. Numerical boundary flags expose possible instability without silently changing comparisons.

The current candidate remains experimental. Dataset/device shift, unknown rejection, useful coverage for every class, browser audio/encoder equivalence and downstream licensing require separate evidence. See [the v2 results](../../docs/AI_V2_RESULTS.md).
