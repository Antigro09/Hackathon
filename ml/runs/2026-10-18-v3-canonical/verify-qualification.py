"""Verify archived qualification evidence; stdlib only, no model/head inference."""
import hashlib
import json
import math
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parent
REFERENCE_SHA = "f713e30fb35ed458a3ec80337476bf2e0feccf627e8a2e5d27248563610404f4"


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def load(relative):
    return json.loads((ROOT / relative).read_bytes())


def require(condition, message):
    if not condition:
        raise ValueError(message)


def compact(value):
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode()


def encoder_fingerprint(document):
    c = document["contract"]
    common = {key: c[key] for key in ("implementation", "modelId", "revision", "modelFile", "modelSha256", "transformersVersion", "ortVersion", "runtimeSha256", "sampleRateHz", "inputDurationSeconds", "featureShape", "embeddingSize", "normalization", "preprocessing", "execution", "resamplerSourceSha256", "checkpointValidatorSha256")}
    if "runtimeHashes" in c:
        common.update({key: c[key] for key in ("transformersBrowserBundleSha256", "preprocessorSha256", "encoderSourceSha256", "compiledResamplerSha256", "compiledModelSha256")})
        common["runtimeHashes"] = c["runtimeHashes"]
    else:
        common["transformersBrowserBundleSha256"] = c["upstreamTransformersSha256"]
        for key, route in (("preprocessorSha256", "/models/"+c["revision"]+"/preprocessor_config.json"), ("encoderSourceSha256", "/canonicalEncoder.mjs"), ("compiledResamplerSha256", "/app/resample.js"), ("compiledModelSha256", "/app/model.js")):
            common[key] = c["files"][route]["sha256"]
        common["runtimeHashes"] = {name: c["files"]["/runtime/"+name if name.startswith("ort-wasm") else "/"+name] for name in c["runtimeSha256"]}
    return common


def validate(document, staged):
    require(document["schemaVersion"] == 1 and document["promotionAllowed"] is False, "Invalid document schema")
    contract = document["contract"]
    require(sha(compact(contract)) == document["contractSha256"], "Contract SHA mismatch")
    require(contract["manifestSha256"] == sha((ROOT / "qualification-staged-manifest.json").read_bytes()), "Staged SHA mismatch")
    require(len(document["records"]) == len(staged["records"]) == 26, "Incomplete qualification")
    require(type(contract["repeatCount"]) is int and contract["repeatCount"] >= 2, "Qualification needs repeated runs")
    ids = set()
    for index, (row, source) in enumerate(zip(document["records"], staged["records"])):
        require({k: v for k, v in row.items() if k != "checkpoint"} == source, "Staged metadata/order differs")
        require(row["row"] == index and row["clip_id"] not in ids, "Duplicate/misordered row")
        ids.add(row["clip_id"])
        check = row["checkpoint"]
        require(check["schemaVersion"] == 1 and check["row"] == index and check["clipId"] == row["clip_id"], "Checkpoint row mismatch")
        require(check["contractSha256"] == document["contractSha256"] and check["sourceSha256"] == row["source_sha256"] and check["pcmSha256"] == row["pcm_sha256"], "Checkpoint provenance mismatch")
        require(row["sample_rate"] in (44100, 48000) and row["sample_count"] == row["sample_rate"] * 5, "PCM input shape mismatch")
        vector = check["embedding"]
        require(len(vector) == 512 and all(type(x) in (int, float) and math.isfinite(x) for x in vector), "Invalid embedding")
        raw = struct.pack("<512f", *vector)
        require(list(struct.unpack("<512f", raw)) == vector and abs(math.sqrt(sum(x*x for x in vector)) - 1) < 1e-6, "Embedding is not canonical Float32 unit vector")
        require(len(check["repeats"]) == contract["repeatCount"], "Incomplete repeats")
        for repeat in check["repeats"]:
            require(repeat["embeddingSha256"] == sha(raw), "Embedding-array hash mismatch")
            for key in ("pcm48Sha256", "featureSha256", "embeddingSha256"):
                value = repeat[key]
                require(isinstance(value, str) and len(value) == 64 and all(c in "0123456789abcdef" for c in value) and value == check["repeats"][0][key], "Non-repeatable hash")
            require(all(type(repeat[k]) in (int, float) and math.isfinite(repeat[k]) and repeat[k] >= 0 for k in ("preprocessingMs", "inferenceMs")), "Invalid timing")


def verify():
    index_path = ROOT / "artifact-index.json"
    if index_path.exists():
        index = load("artifact-index.json")
        listed = index["files"]
        actual = {p.relative_to(ROOT).as_posix() for p in ROOT.rglob("*") if p.is_file() and p != index_path}
        require(set(listed) == actual, "Artifact index file inventory differs")
        for name, info in listed.items():
            path = ROOT / name
            require(path.resolve().is_relative_to(ROOT.resolve()), "Artifact path escaped archive")
            raw = path.read_bytes()
            require(len(raw) == info["bytes"] and sha(raw) == info["sha256"], "Artifact bytes changed: " + name)
    staged = load("qualification-staged-manifest.json")
    require((ROOT/"qualification-staged-manifest.json").read_bytes() == (ROOT/"linux/staged-manifest.json").read_bytes(), "Linux staged input differs")
    require(sha((ROOT/"chrome-reference.json").read_bytes()) == REFERENCE_SHA, "Obsolete/unpinned Chrome reference")
    chrome = load("chrome-reference.json")
    require(load("chrome/contract.json") == {"contractSha256": chrome["contractSha256"], "contract": chrome["contract"]}, "Chrome separate contract mismatch")
    validate(chrome, staged)
    summary = {"cases": 26, "chromeReferenceSha256": REFERENCE_SHA, "chromeRepeatsPerCase": chrome["contract"]["repeatCount"],
               "preparedPcmOnly": True, "headOrAccuracyEvaluated": False, "promotionAllowed": False, "runs": {}}
    for name in ("linux", "windows"):
        actual = load(name + "/embeddings.json")
        validate(actual, staged)
        require(encoder_fingerprint(actual) == encoder_fingerprint(chrome), "Canonical encoder/runtime/preprocessor fingerprints differ")
        require(load(name+"/contract.json") == {"contractSha256": actual["contractSha256"], "contract": actual["contract"]}, "Separate Node contract mismatch")
        comparison = load(name+"/golden-comparison.json")
        require(comparison["complete"] is True and comparison["allBitExact"] is True and comparison["promotionAllowed"] is False and comparison["contractSha256"] == actual["contractSha256"], "Comparison contract failed")
        require(len(comparison["cases"]) == 26, "Comparison cases missing")
        maximum = 0
        timings = []
        preprocess = []
        for row, reference, case in zip(actual["records"], chrome["records"], comparison["cases"]):
            require(row["clip_id"] == reference["clip_id"] == case["clipId"], "Case order differs")
            require(all(case[k] is True for k in ("pcmBitExact", "featuresBitExact", "embeddingBitExact")) and case["embeddingMaxAbs"] == 0, "Comparison case failed")
            require(row["pcm_sha256"] == reference["pcm_sha256"], "Prepared input PCM hashes differ")
            a, b = row["checkpoint"]["repeats"][0], reference["checkpoint"]["repeats"][0]
            require(all(a[k] == b[k] for k in ("pcm48Sha256", "featureSha256", "embeddingSha256")), "Recorded PCM/features/embedding hashes differ from Chrome")
            error = max(abs(x-y) for x, y in zip(row["checkpoint"]["embedding"], reference["checkpoint"]["embedding"]))
            maximum = max(maximum, error)
            for repeat in row["checkpoint"]["repeats"]:
                timings.append(repeat["inferenceMs"])
                preprocess.append(repeat["preprocessingMs"])
        require(maximum == 0, "Embedding coordinates differ")
        summary["runs"][name] = {"environment": actual["contract"]["environment"], "contractSha256": actual["contractSha256"],
            "embeddingsSha256": sha((ROOT/(name+"/embeddings.json")).read_bytes()), "cases": 26,
            "repeatsPerCase": actual["contract"]["repeatCount"], "allRecordedPcmFeatureEmbeddingHashesEqualChrome": True,
            "allEmbeddingCoordinatesBitExactToChrome": True, "maxEmbeddingCoordinateError": maximum,
            "modelLoadMs": actual["modelLoadMs"], "totalWallMs": actual["totalWallMs"],
            "meanInferenceMs": sum(timings)/len(timings), "meanPreprocessingMs": sum(preprocess)/len(preprocess)}
    if (ROOT/"recomputed-summary.json").exists():
        require(load("recomputed-summary.json") == summary, "Recomputed measurement summary differs")
    return summary


if __name__ == "__main__":
    print(json.dumps(verify(), indent=2, allow_nan=False))
