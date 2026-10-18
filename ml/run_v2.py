"""Fresh-process, resumable CPU runner for the preregistered v2 experiment.

Run ``python -m ml.run_v2 --help``. No upload, deployment, GPU, or raw-audio
redistribution is performed. Fit evaluates the frozen choice once; rerunning
an identical completed fit reuses its saved result rather than testing again.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import zipfile


ROOT = Path(__file__).resolve().parents[1]
PACKAGES = ("numpy", "scipy", "scikit-learn", "joblib", "transformers", "onnxruntime", "soundfile")
ENCODER_PACKAGES = ("numpy", "scipy", "transformers", "onnxruntime", "soundfile")
FIT_PACKAGES = ("numpy", "scipy", "scikit-learn", "joblib")
SOURCE_FILES = ("ml/features.py", "ml/data.py", "ml/data_v2.py", "ml/mimii.py", "ml/buzz.py", "ml/experiment.py", "ml/experiment_v2.py", "ml/run_v2.py", "ml/V2_PROTOCOL.md", "ml/requirements.txt")


def sha_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def digest_json(value) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def source_commit(ref: str = "HEAD") -> str:
    return subprocess.check_output(["git", "-C", str(ROOT), "rev-parse", "--verify", f"{ref}^{{commit}}"], text=True).strip()


def encoder_contract() -> dict:
    from ml.features import MODEL_ID, MODEL_REVISION, ARTIFACT_SHA256

    return {"model_id": MODEL_ID, "model_revision": MODEL_REVISION,
            "weights": ARTIFACT_SHA256["onnx/audio_model_quantized.onnx"],
            "preprocessor": ARTIFACT_SHA256["preprocessor_config.json"],
            "extractor_source": sha_file(ROOT / "ml/features.py"),
            "pcm": "first channel, first 240000 samples at48000Hz, no normalization",
            "processor_padding": "append240000zeros to five-second clip; float32[1,1,1001,64]",
            "embedding": "audio_model_quantized.onnx audio_embeds, L2-normalized float32[512]",
            "packages": {name: importlib.metadata.version(name) for name in ENCODER_PACKAGES}}


def fit_runtime_contract() -> dict:
    """Freeze the actual training/serialization backend before any test scoring."""
    return {"python": platform.python_version(),
            "python_implementation": platform.python_implementation(),
            "packages": {name: importlib.metadata.version(name) for name in FIT_PACKAGES}}


def data_phase(args) -> Path:
    from ml.data_v2 import prepare_dataset_v2, assert_mixed_disjoint
    from ml.mimii import prepare_mimii_fans
    from ml.buzz import prepare_buzz

    manifest_path = args.output / "manifest-v2.json"
    configuration = {"seed": args.seed, "previous_manifest_sha256": sha_file(args.previous_run / "manifest.json"),
                     "source_sha256": {name: sha_file(ROOT / name) for name in ("ml/data.py", "ml/data_v2.py", "ml/mimii.py", "ml/buzz.py")},
                     "fsd_caps": {"train": 500, "val": 80, "test": 40, "unknown_per_split": 160},
                     "mimii_caps": {"train_per_unit": 40, "val": 30, "test": 40, "unknown_per_machine_per_split": 10},
                     "ivbee_policy": "IVBEE1.0: all original files passing unchanged five-second quality rules; entire collection test only"}
    configuration_path = args.output / "data_configuration.json"
    if configuration_path.exists() and read_json(configuration_path) != configuration:
        raise ValueError("Data configuration changed; use a new preregistered output directory")
    write_json(configuration_path, configuration)
    if manifest_path.exists():
        manifest = read_json(manifest_path)
        if not manifest.get("validation_passed") or manifest.get("previous_manifest_sha256") != configuration["previous_manifest_sha256"]:
            raise ValueError("Existing v2 manifest failed validation or references a different first run")
        assert_mixed_disjoint(manifest["records"])
        provenance_path = args.output / "data_provenance.json"
        if not provenance_path.exists():
            declared = getattr(args, "data_source_commit", None)
            write_json(provenance_path, {"source_commit": source_commit(declared) if declared else None,
                       "adopted_existing_manifest": True, "configuration_sha256": sha_file(configuration_path)})
        print(f"Reusing validated manifest: {len(manifest['records'])} records", flush=True)
        return manifest_path
    write_json(args.output / "data_provenance.json", {"source_commit": source_commit(), "configuration_sha256": sha_file(configuration_path)})
    supplemental = prepare_mimii_fans(args.output / "mimii", seed=args.seed,
                                     max_train_per_unit=40, max_val=30, max_test=40,
                                     max_unknown_per_machine=10)
    supplemental.extend(prepare_buzz(args.output / "buzz", args.previous_run / "manifest.json", seed=args.seed))
    return prepare_dataset_v2(args.previous_run / "manifest.json", args.output,
                              cache_root=args.cache_root, extra_records=supplemental,
                              seed=args.seed, max_train_per_class=500, max_val_per_class=80,
                              max_test_per_class=40, max_unknown_per_split=160)


def _validate_embeddings(X, completed=None):
    import numpy as np

    if X.ndim != 2 or X.shape[1] != 512 or not np.isfinite(X).all():
        raise ValueError("Invalid finite N by512 embedding matrix")
    rows = X if completed is None else X[completed]
    if len(rows) and not np.allclose(np.linalg.norm(rows, axis=1), 1, atol=1e-4, rtol=0):
        raise ValueError("Cached embeddings are not normalized")


def _previous_embeddings(args, contract: dict) -> dict:
    """Old cache order is accepted only through the exact old manifest digest."""
    import numpy as np

    previous = read_json(args.previous_run / "manifest.json")
    environment = read_json(args.previous_run / "run_environment.json")
    feature = environment.get("feature_configuration", {})
    required = {"manifest": sha_file(args.previous_run / "manifest.json"),
                **{key: contract[key] for key in ("model_revision", "weights", "preprocessor", "extractor_source")}}
    if feature != required or environment.get("manifest_sha256") != required["manifest"]:
        print("V1 cache reuse skipped: model/preprocessing/source/manifest contract differs", flush=True)
        return {}
    if any(environment.get("packages", {}).get(name) != contract["packages"][name] for name in ENCODER_PACKAGES):
        print("V1 cache reuse skipped: encoder package versions differ", flush=True)
        return {}
    # This reproduces the original notebook's JSON serialization, including spaces.
    expected_digest = hashlib.sha256(json.dumps(feature, sort_keys=True).encode()).hexdigest()
    result = {}
    for path in sorted(args.cache_root.parent.glob("embeddings-*.npz")):
        with np.load(path, allow_pickle=False) as cache:
            if "feature_digest" not in cache or str(cache["feature_digest"].item()) != expected_digest:
                continue
            X = cache["X"]
            if X.shape != (len(previous["records"]), 512):
                raise ValueError("Matching v1 cache digest has an unexpected row count/order contract")
            _validate_embeddings(X)
            for record, row in zip(previous["records"], X):
                key = record["pcm_sha256"]
                if key in result and not np.array_equal(result[key], row):
                    raise ValueError("Conflicting embeddings for the same old PCM fingerprint")
                result[key] = row.astype(np.float32)
        print(f"Validated v1 embedding cache: {path.name}, {len(X)} rows", flush=True)
    return result


def _cache_path(args, manifest_path: Path, contract: dict) -> tuple[Path, dict]:
    key = {"manifest_sha256": sha_file(manifest_path), "encoder_contract": contract}
    return args.output / f"embeddings-v2-{digest_json(key)[:20]}.npz", key


def _write_embedding_cache(path, X, completed, records, key):
    import numpy as np

    temporary = path.with_suffix(".tmp.npz")
    np.savez_compressed(temporary, X=X, completed=completed,
                        pcm_sha256=np.asarray([r["pcm_sha256"] for r in records]),
                        clip_ids=np.asarray([r["clip_id"] for r in records]),
                        cache_contract=json.dumps(key, sort_keys=True))
    os.replace(temporary, path)


def _load_embedding_cache(path, records, key):
    import numpy as np

    with np.load(path, allow_pickle=False) as cache:
        if json.loads(str(cache["cache_contract"].item())) != key:
            raise ValueError("V2 embedding cache contract mismatch")
        if cache["pcm_sha256"].tolist() != [r["pcm_sha256"] for r in records] or cache["clip_ids"].tolist() != [r["clip_id"] for r in records]:
            raise ValueError("V2 embedding cache audio fingerprints or row order mismatch")
        X, completed = cache["X"].copy(), cache["completed"].copy()
    if X.shape != (len(records), 512) or completed.shape != (len(records),) or completed.dtype != np.bool_:
        raise ValueError("V2 embedding checkpoint dimensions/completion mask mismatch")
    _validate_embeddings(X, completed)
    return X, completed


def embed_phase(args, manifest_path: Path) -> Path:
    import numpy as np
    import soundfile as sf
    from ml.features import load_extractor, load_audio_session, preprocess5s, embed_audio

    manifest = read_json(manifest_path)
    if not manifest.get("validation_passed"):
        raise ValueError("Cannot embed an invalid manifest")
    records = manifest["records"]
    contract = encoder_contract()
    path, key = _cache_path(args, manifest_path, contract)
    if path.exists():
        X, completed = _load_embedding_cache(path, records, key)
        if completed.all():
            environment_path = args.output / "embedding_environment.json"
            if environment_path.exists():
                environment = read_json(environment_path)
                if any(environment.get(field) != value for field, value in key.items()) or environment.get("cache_sha256") != sha_file(path):
                    raise ValueError("Completed embedding environment/cache checksum mismatch")
            else:
                write_json(environment_path, {**key, "cache_file": path.name, "shape": list(X.shape),
                           "complete": True, "v1_rows_reused_this_invocation": 0,
                           "fresh_rows_this_invocation": 0, "cache_sha256": sha_file(path)})
            print(f"Reusing complete, verified embedding cache: {X.shape}; {path.name}", flush=True)
            return path
    else:
        X, completed = np.zeros((len(records), 512), dtype=np.float32), np.zeros(len(records), dtype=bool)
    old = _previous_embeddings(args, contract) if not completed.all() else {}
    reused = 0
    for index, record in enumerate(records):
        if not completed[index] and record["pcm_sha256"] in old:
            X[index], completed[index] = old[record["pcm_sha256"]], True
            reused += 1
    _write_embedding_cache(path, X, completed, records, key)
    print(f"Frozen embeddings: {int(completed.sum())}/{len(records)} ready; v1 reused this invocation={reused}", flush=True)
    extractor = session = None
    fresh = 0
    for index, record in enumerate(records):
        if completed[index]:
            continue
        audio_path = Path(record["local_path"])
        if sha_file(audio_path) != record["sha256"]:
            raise ValueError(f"Prepared audio SHA256 mismatch: {record['clip_id']}")
        pcm, rate = sf.read(audio_path, dtype="float32")
        if rate != 48000 or pcm.shape != (240000,) or not np.isfinite(pcm).all():
            raise ValueError(f"Prepared PCM format mismatch: {record['clip_id']}")
        if hashlib.sha256(pcm.astype("<f4").tobytes()).hexdigest() != record["pcm_sha256"]:
            raise ValueError(f"Prepared PCM SHA256 mismatch: {record['clip_id']}")
        if session is None:
            extractor, session = load_extractor(args.model_cache), load_audio_session(args.model_cache)
        X[index] = embed_audio(session, preprocess5s(pcm, extractor)).reshape(512)
        completed[index] = True
        fresh += 1
        if fresh % 20 == 0:
            print(f"Frozen embeddings: {int(completed.sum())}/{len(records)} ready", flush=True)
        if fresh % 25 == 0:
            _write_embedding_cache(path, X, completed, records, key)
    _validate_embeddings(X)
    if not completed.all():
        raise ValueError("Incomplete embedding extraction")
    _write_embedding_cache(path, X, completed, records, key)
    write_json(args.output / "embedding_environment.json", {**key, "cache_file": path.name,
               "shape": list(X.shape), "complete": True, "v1_rows_reused_this_invocation": reused,
               "fresh_rows_this_invocation": fresh, "cache_sha256": sha_file(path)})
    print(f"Embedding extraction complete: {X.shape}; {path.name}", flush=True)
    return path


def _print_summary(evaluation: dict):
    print("Experimental v2 result; no live-model promotion and no matched old-system baseline.", flush=True)
    print("Selected model:", json.dumps(evaluation["training"]["selectedModel"], sort_keys=True), flush=True)
    print("All class validation gates passed:", evaluation["allClassGatesPassed"], flush=True)
    test = evaluation["splits"]["test"]
    unknown = evaluation["splits"]["ood_test"]["falseAcceptance"]
    print("Split counts:", json.dumps(evaluation["counts"], sort_keys=True), flush=True)
    print(f"Held-out macroF1={test['ungated']['macroF1']:.4f}; accuracy={test['ungated']['accuracy']:.4f}", flush=True)
    print(f"Known accepted={test['coverage']['successes']}/{test['coverage']['total']}; correct accepted={test['selectiveAccuracy']['successes']}/{test['selectiveAccuracy']['total']}", flush=True)
    print(f"Unknown accepted={unknown['successes']}/{unknown['total']}; Wilson95={unknown['wilson95']}", flush=True)
    print("class | support | ungated recall | F1 | accepted/true class | correct accepted/true class | validation gate", flush=True)
    for ungated, gated in zip(test["ungated"]["perClass"], test["perClass"]):
        label = ungated["label"]
        cover, correct = gated["coverage"], gated["correctTrueClassCoverage"]
        rule = evaluation["ruleSelection"]["classes"][label] if "classes" in evaluation["ruleSelection"] else None
        eligible = rule["eligible"] if rule else not evaluation["rejectionRules"][label]["abstainAll"]
        print(f"{label} | {ungated['support']} | {ungated['recall']:.3f} | {ungated['f1']:.3f} | {cover['successes']}/{cover['total']} | {correct['successes']}/{correct['total']} | {eligible}", flush=True)


def fit_phase(args, manifest_path: Path) -> dict:
    from ml.experiment_v2 import run_experiment_v2

    manifest, previous = read_json(manifest_path), read_json(args.previous_run / "manifest.json")
    contract = encoder_contract()
    cache_path, key = _cache_path(args, manifest_path, contract)
    X, completed = _load_embedding_cache(cache_path, manifest["records"], key)
    if not completed.all():
        raise ValueError("Run embed first: checkpoint is incomplete")
    records = manifest["records"]
    data_commit = source_commit(args.data_source_commit) if getattr(args, "data_source_commit", None) else (
        read_json(args.output / "data_provenance.json").get("source_commit") if (args.output / "data_provenance.json").exists() else None)
    frozen_input = {**key, "seed": args.seed, "previous_manifest_sha256": sha_file(args.previous_run / "manifest.json"),
                    "data_preparation_source_commit": data_commit,
                    "sources_sha256": {name: sha_file(ROOT / name) for name in SOURCE_FILES},
                    "fit_runtime": fit_runtime_contract(),
                    "embedding_cache_sha256": sha_file(cache_path)}
    freeze_path = args.output / "fit_input_contract.json"
    results = args.output / "results"
    evaluation_path = results / "evaluation_v2.json"
    if evaluation_path.exists() and not freeze_path.exists():
        raise ValueError("Saved evaluation has no frozen fit input contract; do not adopt an unverified completed fit")
    if freeze_path.exists() and read_json(freeze_path) != frozen_input:
        raise ValueError("Fit inputs/protocol changed; do not retune against an inspected test set")
    if not freeze_path.exists():
        write_json(freeze_path, frozen_input)
    environment_path = args.output / "run_environment.json"
    pip_freeze_path = args.output / "pip-freeze.txt"
    fit_artifact_paths = (evaluation_path, results / "classifier_v2.joblib")
    if evaluation_path.exists():
        if not all(path.exists() for path in (*fit_artifact_paths, environment_path, pip_freeze_path)):
            raise ValueError("Incomplete saved fit: original classifier/completion environment/pip freeze missing; no test reevaluation")
        environment = read_json(environment_path)
        expected_artifacts = {str(path.relative_to(args.output)).replace("\\", "/"): sha_file(path)
                              for path in fit_artifact_paths}
        if (environment.get("fit_input_contract_sha256") != sha_file(freeze_path)
                or environment.get("fit_runtime") != frozen_input["fit_runtime"]
                or environment.get("fit_artifacts_sha256") != expected_artifacts
                or environment.get("pip_freeze_sha256") != sha_file(pip_freeze_path)):
            raise ValueError("Saved fit completion metadata/artifact checksum mismatch; no test reevaluation")
        evaluation = read_json(evaluation_path)
        print("Reusing the identical completed fit and its original completion environment; no new test evaluation.", flush=True)
    else:
        evaluation = run_experiment_v2(X, [r["label"] for r in records], [r["split"] for r in records],
                    [r["uploader_group"] for r in records], results, random_seed=args.seed,
                    clip_ids=[r["clip_id"] for r in records], sha256=[r["sha256"] for r in records],
                    previously_evaluated_groups=sorted({r["uploader_group"] for r in previous["records"]}))
        pip_freeze_path.write_text(subprocess.check_output([sys.executable, "-m", "pip", "freeze"], text=True), encoding="utf-8")
        environment = {"source_commit": source_commit(), "data_preparation_source_commit": data_commit,
                       "python": platform.python_version(), "fit_runtime": frozen_input["fit_runtime"],
                       "platform": platform.platform(), "completed_at_utc": datetime.now(timezone.utc).isoformat(),
                       "manifest_sha256": key["manifest_sha256"], "encoder_contract": contract,
                       "fit_input_contract_sha256": sha_file(freeze_path),
                       "fit_artifacts_sha256": {str(path.relative_to(args.output)).replace("\\", "/"): sha_file(path)
                                               for path in fit_artifact_paths},
                       "pip_freeze_sha256": sha_file(pip_freeze_path),
                       "packages": {name: importlib.metadata.version(name) for name in PACKAGES},
                       "previous_run": str(args.previous_run), "baseline": "not evaluated; v1 and v2 cohorts differ",
                       "grouping": "FSD50K uploader; MIMII physical machine/model ID; IVBEE specimen (entire bee collection test only; shared collection conditions remain)",
                       "promotionAllowed": False, "browserPortable": False,
                       "note": "Classifiers/group gates are experimental; MIMII BY-SA licensing and browser/field validation remain unresolved."}
        write_json(environment_path, environment)
    sources = [manifest_path, args.output / "mimii/manifest.json", args.output / "buzz/manifest.json", args.output / "data_configuration.json",
               args.output / "data_provenance.json",
               args.output / "embedding_environment.json", freeze_path, args.output / "run_environment.json",
               args.output / "pip-freeze.txt", evaluation_path, results / "classifier_v2.joblib"]
    sources += [ROOT / name for name in SOURCE_FILES]
    index = {(str(path.relative_to(args.output)) if path.is_relative_to(args.output) else "source/" + str(path.relative_to(ROOT))).replace("\\", "/"):
             {"sha256": sha_file(path), "bytes": path.stat().st_size} for path in sources if path.exists()}
    write_json(args.output / "artifact_index.json", index)
    archive_path = args.output / "tonalwatch-v2-results.zip"
    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sources:
            if path.exists():
                name = str(path.relative_to(args.output)) if path.is_relative_to(args.output) else "source/" + str(path.relative_to(ROOT))
                archive.write(path, name.replace("\\", "/"))
        archive.write(args.output / "artifact_index.json", "artifact_index.json")
    _print_summary(evaluation)
    print(f"Downloadable results: {archive_path}", flush=True)
    print("No raw audio or standalone embedding cache. The classifier retains training reference vectors required by its rejection rule.", flush=True)
    return evaluation


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--phase", choices=("data", "embed", "fit", "all"), default="all")
    parser.add_argument("--output", type=Path, default=Path("/content/tonalwatch-artifacts-v2b"))
    parser.add_argument("--cache-root", type=Path, default=Path("/content/tonalwatch-artifacts/data"))
    parser.add_argument("--model-cache", type=Path, default=Path("/content/tonalwatch-artifacts/models"))
    parser.add_argument("--previous-run", type=Path, default=ROOT / "ml/runs/2026-10-18")
    parser.add_argument("--seed", type=int, default=18042)
    parser.add_argument("--data-source-commit", help="Record the source commit when adopting a manifest prepared before this runner")
    args = parser.parse_args()
    for name in ("output", "cache_root", "model_cache", "previous_run"):
        setattr(args, name, getattr(args, name).resolve())
    args.output.mkdir(parents=True, exist_ok=True)
    manifest = args.output / "manifest-v2.json"
    if args.phase in {"data", "all"}:
        manifest = data_phase(args)
    if args.phase in {"embed", "all"}:
        embed_phase(args, manifest)
    if args.phase in {"fit", "all"}:
        fit_phase(args, manifest)


if __name__ == "__main__":
    main()
