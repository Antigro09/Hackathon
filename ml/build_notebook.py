"""Generate the Colab artifact with nbformat; run from the repository root."""

from pathlib import Path
import nbformat as nbf


def markdown(text):
    return nbf.v4.new_markdown_cell(text.strip())


def code(text):
    return nbf.v4.new_code_cell(text.strip())


cells = [
    markdown("""
# TonalWatch: train and test sound hints

**Experiment status: run the notebook to obtain measured results.** The deployed app is unchanged.

We test whether a small classifier on frozen CLAP audio embeddings improves recognition of **buzzing, mechanical fan, traffic, wind, and speech** compared with a zero-shot baseline using the same broad labels. Unknown sounds should be rejected. These categories do not establish a particular transformer, light fixture, facility, or location.

CPU runtime is sufficient. This notebook uses only public audio and model downloads, without an API key, private recordings, Drive mount, or paid GPU. Resource availability is set by [Colab](https://research.google.com/colaboratory/faq.html).
"""),
    markdown("""
## 1. Set up a reproducible checkout

The first run clones `main` and records the exact commit used. To reproduce a particular run, set `SOURCE_REF` to the commit in its `run_environment.json`. Code and package installation happen in this remote Colab runtime.
"""),
    code("""
import sys, subprocess, json, hashlib, platform, os
from pathlib import Path

SOURCE_REF = "main"  # Replace with a recorded immutable commit when reproducing.
REPO = Path("/content/tonalwatch-source")
ARTIFACTS = Path("/content/tonalwatch-artifacts")
ARTIFACTS.mkdir(parents=True, exist_ok=True)
if not REPO.exists():
    subprocess.run(["git", "clone", "https://github.com/Antigro09/Hackathon.git", str(REPO)], check=True)
subprocess.run(["git", "-C", str(REPO), "fetch", "origin", SOURCE_REF], check=True, capture_output=True)
subprocess.run(["git", "-C", str(REPO), "checkout", "--detach", "FETCH_HEAD"], check=True, capture_output=True)
SOURCE_COMMIT = subprocess.check_output(["git", "-C", str(REPO), "rev-parse", "HEAD"], text=True).strip()
subprocess.run([sys.executable, "-m", "pip", "install", "--quiet", "-r", str(REPO / "ml/requirements.txt")], check=True)
sys.path.insert(0, str(REPO))
os.chdir(REPO)
subprocess.run([sys.executable, "-m", "unittest", "ml.test_data", "ml.test_features", "ml.test_experiment", "-q"], check=True)
print("Source commit:", SOURCE_COMMIT)
print("Artifacts:", ARTIFACTS)
"""),
    markdown("""
## 2. Methods and limits

The audio encoder and tokenizer/model revisions are pinned. Use the same quantized audio branch as the browser, with five seconds followed by five seconds of zeros. Python feature extraction is configured explicitly; its default repeat-padding would differ from the app. A browser/native parity check remains required before deployment.

Training uses frozen, normalized audio embeddings and a regularized linear classifier. Hyperparameters are selected using training groups. The rejection rule uses development data only. **Held-out test results do not select thresholds or models.** An empirical false-accept target on a finite dataset is not a population guarantee.

### Key assumptions

- Public clip-level tags can be imperfect and may describe an event outside the first five seconds. Listen to examples below before interpreting the benchmark.
- Uploaders, clip identifiers, and exact audio hashes must not cross splits. Official evaluation clips are reserved for testing.
- Broad labels are not exact equipment identities. Quiet, transformer, and light-fixture identification are not trained by this experiment.
- The encoder's original pretraining may overlap public audio corpora. These splits isolate this classifier experiment; they do not prove a previously unseen field benchmark.
- No change to TonalWatch's DSP indicators, report, privacy behavior, or live model is made here.
"""),
    markdown("""
## 3. Download a bounded, attributed dataset

The loader selects only CC0/CC-BY clips from FSD50K metadata, then downloads individual WAV files from a pinned mirror. It does not fetch the full archive. Records retain official split, uploader, original source URL, title, license, checksums, and cropping information. Invalid/short/clipped or ambiguous clips are excluded and counted. See [data provenance](https://github.com/Antigro09/Hackathon/blob/main/ml/DATA_SOURCES.md).
"""),
    code("""
from ml.data import prepare_dataset
import pandas as pd
import numpy as np

manifest_path = prepare_dataset(
    output_dir=str(ARTIFACTS / "data"), seed=804,
    max_train_per_class=80, max_val_per_class=20,
    max_test_per_class=40, max_ood_per_split=80,
)
manifest = json.loads(Path(manifest_path).read_text())
records = manifest["records"]
frame = pd.DataFrame(records)
display(frame.groupby(["split", "label"]).size().unstack(fill_value=0))
print("Clips:", len(frame), "Uploaders:", frame["uploader"].nunique())
print(json.dumps(manifest.get("summary", {}), indent=2)[:5000])
"""),
    markdown("""
### Listen to a few labeled examples

These are source tags, not verified equipment identities. Confirm that the retained segment contains the annotated sound. Do not cherry-pick clips after seeing test scores; corrections require a new, versioned dataset and a new held-out evaluation.
"""),
    code("""
from IPython.display import Audio, display
for label in sorted(frame.loc[frame["split"] == "train", "label"].unique()):
    sample = frame[(frame["split"] == "train") & (frame["label"] == label)].iloc[0]
    print(label, "—", sample["title"], "—", sample["license"])
    print(sample["source_url"])
    display(Audio(filename=sample["local_path"]))
"""),
    markdown("""
## 4. Extract frozen audio embeddings

Only the classifier is trained. The cache stores embeddings and their manifest/model key so it cannot silently reuse features from another dataset or configuration.
"""),
    code("""
import soundfile as sf
from tqdm.auto import tqdm
from ml.features import load_extractor, preprocess5s, load_audio_session, embed_audio, MODEL_REVISION, ARTIFACT_SHA256

MODEL_CACHE = ARTIFACTS / "models"
extractor = load_extractor(MODEL_CACHE)
audio_session = load_audio_session(MODEL_CACHE)
manifest_digest = hashlib.sha256(Path(manifest_path).read_bytes()).hexdigest()
feature_configuration = {"manifest": manifest_digest, "model_revision": MODEL_REVISION,
                         "weights": ARTIFACT_SHA256["onnx/audio_model_quantized.onnx"],
                         "preprocessor": ARTIFACT_SHA256["preprocessor_config.json"],
                         "extractor_source": hashlib.sha256((REPO / "ml/features.py").read_bytes()).hexdigest()}
feature_digest = hashlib.sha256(json.dumps(feature_configuration, sort_keys=True).encode()).hexdigest()
feature_cache = ARTIFACTS / ("embeddings-" + feature_digest[:16] + ".npz")
if feature_cache.exists():
    cached = np.load(feature_cache)
    X = cached["X"]
    assert cached["feature_digest"].item() == feature_digest
else:
    rows = []
    for record in tqdm(records, desc="Frozen audio encoder"):
        pcm, rate = sf.read(record["local_path"], dtype="float64")
        assert rate == 48000 and pcm.shape == (240000,)
        inputs = preprocess5s(pcm, extractor=extractor)
        rows.append(np.asarray(embed_audio(audio_session, inputs)).reshape(-1))
    X = np.stack(rows).astype(np.float32)
    np.savez_compressed(feature_cache, X=X, feature_digest=feature_digest)
assert X.shape[0] == len(records) and np.isfinite(X).all()
assert np.allclose(np.linalg.norm(X, axis=1), 1, atol=1e-4)
print("Embedding matrix:", X.shape)
"""),
    markdown("""
## 5. Compare with a matched zero-shot baseline

The baseline uses the same five broad sound descriptions and the same test clips. This is not a direct score comparison with the app's current eight, more specific descriptions. Relative scores and classifier outputs are not verified source-confidence probabilities.
"""),
    code("""
from ml.features import load_text_session, embed_texts

LABEL_DESCRIPTIONS = {
    "buzz": "a buzzing sound",
    "mechanical_fan": "a mechanical fan running",
    "traffic": "road traffic passing outside",
    "wind": "wind blowing",
    "speech": "people talking",
}
classes = sorted(LABEL_DESCRIPTIONS)
text_session = load_text_session(MODEL_CACHE)
text_embeddings = embed_texts(text_session, [LABEL_DESCRIPTIONS[name] for name in classes], cache_dir=MODEL_CACHE)
text_embeddings = np.asarray(text_embeddings, dtype=np.float32)
text_embeddings /= np.linalg.norm(text_embeddings, axis=1, keepdims=True)
baseline_scores = X @ text_embeddings.T
print("Baseline classes:", classes)
print("Baseline shape:", baseline_scores.shape)
"""),
    markdown("""
## 6. Train, calibrate, then evaluate once

The experiment checks split leakage before fitting. It saves coefficients, rejection settings, per-class results, confusion matrices, acceptance coverage, and unknown-sound false accepts with finite-sample uncertainty. If the development criteria cannot be met, the candidate must reject all sounds rather than invent a usable threshold.
"""),
    code("""
from ml.experiment import run_experiment

result = run_experiment(
    X,
    labels=frame["label"].to_numpy(),
    split=frame["split"].to_numpy(),
    groups=frame["uploader_group"].to_numpy(),
    output_dir=ARTIFACTS / "results",
    baseline_scores=baseline_scores,
    random_seed=804,
    clip_ids=frame["clip_id"].to_numpy(),
    sha256=frame["sha256"].to_numpy(),
)
comparison_rows = []
for name, system in [("Linear classifier", result["probe"]), ("Matched zero-shot", result["zeroShotMatchedLabels"])]:
    known = system["splits"]["test"]
    unknown = system["splits"]["ood_test"]
    comparison_rows.append({
        "System": name, "Known test clips": known["ungated"]["sampleCount"],
        "Macro F1 before rejection": known["ungated"]["macroF1"],
        "Balanced accuracy before rejection": known["ungated"]["balancedAccuracy"],
        "Known coverage": known["coverage"]["rate"],
        "Accuracy among accepted known clips": known["selectiveAccuracy"]["rate"],
        "Unknown test clips": unknown["falseAcceptance"]["total"],
        "Unknown false accepts": unknown["falseAcceptance"]["successes"],
        "Unknown false-accept rate": unknown["falseAcceptance"]["rate"],
        "Unknown false-accept Wilson 95% interval": unknown["falseAcceptance"]["wilson95"],
    })
display(pd.DataFrame(comparison_rows).set_index("System").T)
display(pd.DataFrame(result["probe"]["splits"]["test"]["ungated"]["perClass"]))
print("Frozen classifier rejection rule:", result["probe"]["rejectionRule"])
print("Promotion allowed:", result["promotionAllowed"])
print("Complete evaluation saved to", ARTIFACTS / "results/evaluation.json")
"""),
    markdown("""
### Inspect held-out confusions and per-class results

Both plots use the same held-out clip labels. Scores before rejection show classification errors; acceptance coverage and unknown-sound false accepts in the saved results describe the separate rejection rule. Neither plot establishes field accuracy.
"""),
    code("""
from ml.plot_results import plot_results
display(plot_results(result, ARTIFACTS / "results"))
"""),
    markdown("""
## 7. Save a traceable run

These files are experimental artifacts. `promotionAllowed` remains false. A deployment decision needs browser/native parity, careful error review, and independent recordings that resemble actual use.
"""),
    code("""
import importlib.metadata as metadata
environment = {
    "source_commit": SOURCE_COMMIT,
    "python": platform.python_version(),
    "platform": platform.platform(),
    "manifest_sha256": manifest_digest,
    "feature_configuration": feature_configuration,
    "packages": {name: metadata.version(name) for name in ["numpy", "scipy", "scikit-learn", "transformers", "onnxruntime", "soundfile"]},
    "note": "Frozen encoder benchmark; not independently validated physical source identification.",
}
(ARTIFACTS / "run_environment.json").write_text(json.dumps(environment, indent=2))
(ARTIFACTS / "pip-freeze.txt").write_text(subprocess.check_output([sys.executable, "-m", "pip", "freeze"], text=True))
model_path = ARTIFACTS / "results/linear_probe.json"
model_artifact = json.loads(model_path.read_text())
model_artifact.update({"featureContract": feature_configuration, "sourceCommit": SOURCE_COMMIT,
                       "attributionManifest": "manifest.json", "sourceMetadata": manifest["source"]})
model_path.write_text(json.dumps(model_artifact, indent=2))
print("Saved environment, manifest, features, and result files under", ARTIFACTS)
print("Use the Files pane to download results. No model is uploaded or deployed automatically.")
"""),
    markdown("""
## What to decide after this run

Review actual per-class precision/recall, confusions, rejection coverage, and false accepts. A promising result supports a follow-up experiment, not a source-accuracy claim. More reliable exact equipment hints require recordings from many distinct machines, rooms, devices, and conditions with verified labels. Full encoder fine-tuning is justified only if the frozen baseline and its error analysis show a data-supported benefit worth testing on a new held-out set.
"""),
]

notebook = nbf.v4.new_notebook(cells=cells)
notebook.metadata = {
    "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
    "language_info": {"name": "python"},
    "colab": {"provenance": [], "name": "TonalWatch_Audio_Training.ipynb"},
}
nbf.validate(notebook)
path = Path("notebooks/TonalWatch_Audio_Training.ipynb")
path.parent.mkdir(exist_ok=True)
nbf.write(notebook, path)
print(path)
