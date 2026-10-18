"""Generate the fresh-process v2 Colab notebook; run from the repository root."""

from pathlib import Path
import nbformat as nbf


def build():
    markdown = lambda text: nbf.v4.new_markdown_cell(text.strip())
    code = lambda text: nbf.v4.new_code_cell(text.strip())
    cells = [
        markdown("""
# TonalWatch: second sound-hint experiment

**Status: unexecuted experiment, no measured improvement claimed.** This follows the inspected first run. The deployed app and its current sound hints stay unchanged.

We compare fixed linear and RBF-SVM candidates on frozen, quantized CLAP embeddings, then calibrate class-specific rejection rules. The five broad labels are buzz, mechanical fan, speech, traffic, and wind. The protocol is fixed before fresh held-out predictions: [V2_PROTOCOL.md](https://github.com/Antigro09/Hackathon/blob/main/ml/V2_PROTOCOL.md).

CPU only; public recordings; no API keys, Drive mount, private microphone recordings, or paid GPU. Data preparation may take several minutes and several gigabytes of temporary storage. Resume interrupted phases with the same checkout and artifact directory.
"""),
        markdown("""
## 1. Resolve and record the source commit

`main` is resolved once and checked out as an immutable commit. For a rerun, replace `SOURCE_REF` with the recorded commit. All scientific imports occur in **fresh subprocesses after pip installation**, so a stale NumPy already loaded in Colab's parent kernel cannot affect the experiment. The parent cells use standard-library modules only.
"""),
        code('''
import os, sys, subprocess, json
from pathlib import Path

SOURCE_REF = "main"  # Use a recorded immutable commit to reproduce a completed run.
REMOTE = "https://github.com/Antigro09/Hackathon.git"
REPO = Path("/content/tonalwatch-source-v2")
ARTIFACTS = Path("/content/tonalwatch-artifacts-v2b")
CACHE_ROOT = Path("/content/tonalwatch-artifacts/data")
MODEL_CACHE = Path("/content/tonalwatch-artifacts/models")
ARTIFACTS.mkdir(parents=True, exist_ok=True)
if not REPO.exists():
    subprocess.run(["git", "clone", REMOTE, str(REPO)], check=True)
actual_remote = subprocess.check_output(["git", "-C", str(REPO), "remote", "get-url", "origin"], text=True).strip()
if actual_remote != REMOTE:
    raise RuntimeError("Unexpected repository at the experiment checkout path")
subprocess.run(["git", "-C", str(REPO), "fetch", "origin", SOURCE_REF], check=True)
subprocess.run(["git", "-C", str(REPO), "checkout", "--detach", "FETCH_HEAD"], check=True)
SOURCE_COMMIT = subprocess.check_output(["git", "-C", str(REPO), "rev-parse", "HEAD"], text=True).strip()
ENV = {**os.environ, "PYTHONUNBUFFERED": "1", "OMP_NUM_THREADS": "1", "OPENBLAS_NUM_THREADS": "1", "MKL_NUM_THREADS": "1"}
def stream_command(command, cwd=None):
    process = subprocess.Popen(command, cwd=cwd, env=ENV, stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT, text=True, bufsize=1)
    try:
        for line in process.stdout:
            print(line, end="", flush=True)
        status = process.wait()
        if status:
            raise subprocess.CalledProcessError(status, command)
    except BaseException:
        if process.poll() is None:
            process.terminate()
            process.wait()
        raise
stream_command([sys.executable, "-m", "pip", "install", "--quiet", "-r", str(REPO / "ml/requirements.txt")])
print("Immutable source commit:", SOURCE_COMMIT)
print("Artifacts:", ARTIFACTS)
'''),
        markdown("""
## 2. Verify the implementation in a fresh interpreter

These synthetic checks cover source licensing, deterministic cropping, exact processor padding, grouping/content leakage, training-only model selection, and validation-only rejection calibration. They do not measure field accuracy. Failed checks stop the notebook before downloading the expanded cohort.
"""),
        code('''
TEST_MODULES = ["ml.test_data", "ml.test_features", "ml.test_experiment", "ml.test_mimii", "ml.test_buzz", "ml.test_data_v2", "ml.test_experiment_v2", "ml.test_run_v2", "ml.test_compare_frozen_v1"]
stream_command([sys.executable, "-m", "unittest", *TEST_MODULES, "-q"], cwd=REPO)
COMMAND = [sys.executable, "-u", "-m", "ml.run_v2", "--output", str(ARTIFACTS),
           "--cache-root", str(CACHE_ROOT), "--model-cache", str(MODEL_CACHE),
           "--previous-run", str(REPO / "ml/runs/2026-10-18"), "--seed", "18042"]
def run_phase(phase):
    stream_command([*COMMAND, "--phase", phase], cwd=REPO)
'''),
        markdown("""
## 3. Build the separately attributed cohort

FSD50K contributes CC0/CC BY clips with uploader-disjoint development/fresh test groups. Every first-run uploader, clip ID, and exact audio fingerprint is excluded from the new held-out cohort. FSD caps: 500 train, 80 validation, 40 test per class; 160 unknowns per split. Quality failures and sparse categories are reported rather than replaced with old test data.

The first run exhausted eligible FSD fan test recordings. Separately licensed [MIMII public 1.0](https://zenodo.org/records/3384388) supplies **CC BY-SA 4.0** fan audio: physical units 00/02 train (40 clips each), 04 validation (30), 06 test (40). Other machine types supply 10 unknown controls each per split (30 validation, 30 test) using distinct 04/06 units. Source archives are selectively read using strict HTTP ranges; pinned ZIP inventories, local headers, per-member CRC and source/prepared/PCM SHA256 are checked. Published whole-archive MD5 values are recorded but cannot be verified without downloading the entire archives.

Fresh FSD buzz also failed the unchanged quality rules. The data-only protocol amendment adds [IVBEE-1.0](https://zenodo.org/records/20077113), **CC BY 4.0**, entirely as held-out insect-buzz stress data: all 23 eligible original recordings, first five seconds, no padding/stitching/gain changes. The remaining 203 files are too short. Six specimen groups share one laboratory collection and hardware; they are not six independent studies. The native WAVs are 48 kHz mono PCM16, despite the publisher's 24-bit description. Whole archive MD5/SHA256 and individual hashes/CRC are checked. This does not test electrical hum.

### Key assumptions and limits

- MIMII splits are our derived physical-unit partitions, not an official FSD or MIMII evaluation split. Shared collection/background conditions, few machine groups, and corpus confounding remain.
- MIMII unknown controls share machine types across validation/test while holding out physical units; FSD unknown categories remain separated.
- Both normal and anomalous fan recordings have only the broad fan target; no fault or equipment identity is inferred.
- First channel, first five seconds, 48 kHz resampling, no gain normalization. Clip-level tags may miss the event in that crop. Quality exclusions change the population.
- Raw MIMII audio is never published here. BY-SA terms are distinct from FSD CC0/BY; downstream model distribution still needs review.
"""),
        code('''
run_phase("data")
manifest = json.loads((ARTIFACTS / "manifest-v2.json").read_text())
print(json.dumps(manifest["summary"], indent=2))
print("Validation passed:", manifest["validation_passed"])
print("No test predictions have been evaluated in this phase.")
'''),
        markdown("""
## 4. Extract or resume frozen embeddings

The exact q8 CLAP audio branch is pinned. Five seconds of zeros follow each five-second clip, matching the app's observed processor behavior. Native CPU results still require browser WASM parity before promotion.

Checkpoints are saved every 25 new embeddings, with plaintext progress every 20. Each cache binds the exact manifest, ordered PCM hashes/IDs, model revision/weight SHA, preprocessor SHA, feature-source SHA and package versions. A first-run cache is reused only if its original manifest/environment, feature digest, row order and encoder contract all match. A mismatched cache is never treated as valid input.
"""),
        code('''
run_phase("embed")
embedding_info = json.loads((ARTIFACTS / "embedding_environment.json").read_text())
print("Embedding shape:", embedding_info["shape"])
print("Complete:", embedding_info["complete"])
print("V1 rows reused this invocation:", embedding_info["v1_rows_reused_this_invocation"])
'''),
        markdown("""
## 5. Freeze selection, calibrate, and evaluate once

Candidate selection uses training-group cross-validation only; class-specific margin/top-three cosine rules use known/unknown validation only. Each class must meet 20% correct true-class validation coverage and 80% accepted-known precision; finite empirical unknown budgets are 2% per class and 10% combined. A failed class abstains and is reported as a failure.

The source/protocol/input hashes and exact training runtime are saved before fit. Only after selection and calibration are fixed are fresh test metrics reported. Rerunning an identical completed fit reads its saved result and preserves its original completion metadata. Changes motivated by this new test require another untouched test set. The optional frozen-v1 comparison below uses these same new recordings; the first run's old-cohort score cannot be compared directly.
"""),
        code('''
run_phase("fit")
'''),
        markdown("""
## 6. Inspect the recorded result

Read per-class recall, coverage, correct acceptance, accepted errors and unknown false accepts together. Wilson intervals describe finite samples and omit threshold-selection, uploader dependence, label bias and recording-domain uncertainty. No scores are calibrated source probabilities. The encoder may have encountered public clips during pretraining.

This remains a Python research artifact (`promotionAllowed=false`, `browserPortable=false`). An RBF-SVM and its exact scoring/top-three gate require a compatible implementation; no browser deployment is performed. Broad sound tags do not establish a facility, appliance, location, legal compliance or harm.
"""),
        code('''
evaluation = json.loads((ARTIFACTS / "results/evaluation_v2.json").read_text())
environment = json.loads((ARTIFACTS / "run_environment.json").read_text())
print("Source:", environment["source_commit"])
print("Model:", evaluation["training"]["selectedModel"])
print("Class gates passed:", evaluation["allClassGatesPassed"])
test = evaluation["splits"]["test"]
print("Held-out known:", {key: test[key] for key in ["coverage", "selectiveAccuracy", "correctAcceptedPerKnownClip", "rejectedCount"]})
print("Held-out unknown:", evaluation["splits"]["ood_test"]["falseAcceptance"])
print("class | support | recall | F1 | accepted/true class | correct accepted/true class")
for raw, gated in zip(test["ungated"]["perClass"], test["perClass"]):
    cover, correct = gated["coverage"], gated["correctTrueClassCoverage"]
    print(f"{raw['label']} | {raw['support']} | {raw['recall']:.3f} | {raw['f1']:.3f} | {cover['successes']}/{cover['total']} | {correct['successes']}/{correct['total']}")
print("Do not infer field improvement by comparing a score on this cohort with the different v1 cohort.")
'''),
        markdown("""
## 6b. Compare the unchanged first classifier on identical recordings

V2 has already frozen its model, gate and result. Apply the immutable first-run linear coefficients, centroids and original gate without fitting or calibration. Both systems now use the exact same new test cohort and native embeddings. The comparator checks model, manifest, source and completion hashes; it never replaces the v2 evidence. Its separate JSON is not part of the original fit ZIP.
"""),
        code('''
stream_command([sys.executable, "-u", "-m", "ml.compare_frozen_v1", "--output", str(ARTIFACTS),
                "--previous-run", str(REPO / "ml/runs/2026-10-18")], cwd=REPO)
print("Separate comparison:", ARTIFACTS / "results/frozen_v1_comparison.json")
'''),
        markdown("""
## 7. Download the audit bundle

The ZIP contains results, the Python classifier, attributed manifests, exact source/protocol, environment, pip freeze and SHA256 index. It excludes raw audio and the standalone embedding cache. The classifier retains training reference vectors required for its rejection rule. Nothing is uploaded, published, or deployed automatically.
"""),
        code('''
archive = ARTIFACTS / "tonalwatch-v2-results.zip"
import hashlib, zipfile
complete = ARTIFACTS.parent / "tonalwatch-v2-complete-results.zip"
with zipfile.ZipFile(complete, "w", zipfile.ZIP_DEFLATED) as bundle:
    bundle.write(archive, "fit-audit-bundle.zip")
    comparison = ARTIFACTS / "results/frozen_v1_comparison.json"
    if comparison.exists():
        bundle.write(comparison, "frozen_v1_comparison.json")
        bundle.write(REPO / "ml/compare_frozen_v1.py", "comparison_source.py")
print("Result bundle:", complete, "bytes:", complete.stat().st_size)
print("SHA256:", hashlib.sha256(complete.read_bytes()).hexdigest())
print("In Colab: Files > Refresh, then right-click this ZIP and choose Download.")
print("This uses the file pane and does not require output JavaScript widgets.")
'''),
    ]
    notebook = nbf.v4.new_notebook(cells=cells)
    notebook.metadata = {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
                         "language_info": {"name": "python"},
                         "colab": {"provenance": [], "name": "TonalWatch_Audio_Improvement_v2.ipynb"}}
    nbf.validate(notebook)
    path = Path(__file__).resolve().parents[1] / "notebooks/TonalWatch_Audio_Improvement_v2.ipynb"
    path.parent.mkdir(exist_ok=True)
    nbf.write(notebook, path)
    print(path)


if __name__ == "__main__":
    build()
