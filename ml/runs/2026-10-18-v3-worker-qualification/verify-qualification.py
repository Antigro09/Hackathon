"""Read-only archived worker arithmetic/metadata checks; no model/head calls."""
import hashlib
import json
import math
from pathlib import Path
import re
import struct
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
PINS = {
    "browser-qualified.json": "ae0743d80565d78784c4a839adce5cba102efe2a862d36c7f923ed00a08d3f93",
    "reference/chrome-reference.json": "f713e30fb35ed458a3ec80337476bf2e0feccf627e8a2e5d27248563610404f4",
    "reference/qualification-staged-manifest.json": "25448ca576662cf21511b2f691100e6e8d93d4f76c985bc35e6da55430f63e68",
    "reference/self-test-v3-reference.json": "6d5414df3b9413283c88f599887d149314c9c8fb189c5324205b452e33a2212d",
    "source/productionWorkerV3.mjs": "f622383fb66b1090f98f59739eea13971915eabe419af090ad833b1b436a5713",
}


def require(value, message):
    if not value:
        raise ValueError(message)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def load(name):
    return json.loads((ROOT / name).read_bytes())


def vector_hash(values):
    require(isinstance(values, list) and len(values) == 512 and all(type(x) in (int, float) and math.isfinite(x) for x in values), "Invalid saved vector")
    raw = struct.pack("<512f", *values)
    require(list(struct.unpack("<512f", raw)) == values and abs(math.sqrt(sum(x*x for x in values))-1) < 1e-6, "Saved vector is not exact normalized Float32")
    return sha(raw)


def verify():
    if (ROOT/"artifact-index.json").exists():
        index = load("artifact-index.json")
        inventory = {p.relative_to(ROOT).as_posix() for p in ROOT.rglob("*") if p.is_file() and p.name != "artifact-index.json"}
        require(inventory == set(index["files"]), "Indexed inventory differs")
        for name, info in index["files"].items():
            path = ROOT/name
            require(path.resolve().is_relative_to(ROOT.resolve()), "Index path escaped archive")
            raw = path.read_bytes()
            require(sha(raw) == info["sha256"] and len(raw) == info["bytes"], "Indexed bytes differ: "+name)
    for name, digest in PINS.items():
        require(sha((ROOT/name).read_bytes()) == digest, "Pinned raw evidence differs: "+name)
    browser, requests = load("browser-qualified.json"), load("requests-qualified.json")
    reference, staged = load("reference/chrome-reference.json"), load("reference/qualification-staged-manifest.json")
    synthetic, assets = load("reference/self-test-v3-reference.json"), load("runtime/asset-manifest.json")
    require(browser["phase"] == "disposed" and browser["errors"] == [] and browser["classifierIncluded"] is False and browser["promotionAllowed"] is False, "Unexpected worker result/phase")
    require(requests["immutableSnapshot"] is True and requests["promotionAllowed"] is False and requests["workerSha256"] == PINS["source/productionWorkerV3.mjs"], "Wrong worker snapshot")
    origin = urlparse(requests["origin"])
    require(origin.scheme == "http" and origin.hostname == "127.0.0.1" and origin.port == 4192, "Wrong loopback origin")
    log = requests["requests"]
    require(len(log) == 46 and all(r["method"] == "GET" and r["status"] == 200 and r["path"].startswith("/") and not r["path"].startswith("//") and r["path"] in requests["routes"] for r in log), "Unexpected recorded request method/status/path")
    for source, route in (("productionWorkerV3.mjs", "/assets/productionWorkerV3.mjs"), ("productionHarnessV3.mjs", "/harness.mjs")):
        require(sha((ROOT/"source"/source).read_bytes()) == requests["routes"][route]["sha256"], "Served source binding differs")
    asset_sha = sha((ROOT/"runtime/asset-manifest.json").read_bytes())
    require(asset_sha == requests["assetManifestSha256"] == requests["routes"]["/assets/asset-manifest.json"]["sha256"], "Asset manifest hash differs")
    require(assets["sourcePackagerSha256"] == sha((ROOT/"source/prepareProductionV3.mjs").read_bytes()), "Packager source binding differs")
    require(assets["promotionAllowed"] is False and assets["activationReady"] is False and len(assets["files"]) == 17, "Wrong static asset package")
    for name, entry in assets["files"].items():
        route = requests["routes"]["/assets/"+name]
        require(route["sha256"] == entry["sha256"] and route["bytes"] == entry["bytes"] and route["type"] == entry["contentType"], "Asset route metadata differs")
    startup = browser["startupProvenance"]
    require(startup["selfTestPassed"] is True and startup["selfTestCases"] == 2 and startup["classifierIncluded"] is False and startup["fieldEvidence"] is False and startup["promotionAllowed"] is False, "Wrong startup provenance")
    require(startup["assetManifestSha256"] == asset_sha and startup["syntheticReferenceSha256"] == PINS["reference/self-test-v3-reference.json"], "Startup raw references differ")
    require(startup["runtimeFingerprintSha256"] == synthetic["embeddingContract"]["runtimeFingerprintSha256"] and startup["preprocessingContractSha256"] == synthetic["embeddingContract"]["preprocessingContractSha256"], "Startup numerical fingerprints differ")
    bindings = startup["moduleBindings"]
    for filename, rewrites in (("ort.wasm.bundle.min.mjs",0),("transformers.web.js",2),("app/model.js",0),("app/resample.js",1),("canonicalEncoder.mjs",0),("selfTestV3.mjs",0)):
        item = bindings[filename]
        require(item["verifiedSourceSha256"] == assets["files"][filename]["sha256"] and item["importSpecifierRewrites"] == rewrites, "Unexpected module adapter/source")
        require(re.fullmatch("[0-9a-f]{64}",item["executedModuleSha256"]) is not None, "Missing executed adapter hash")
        if not rewrites:
            require(item["verifiedSourceSha256"] == item["executedModuleSha256"], "Unexpected no-rewrite module change")
    for source, filename in (("canonicalEncoder.mjs","canonicalEncoder.mjs"),("selfTestV3.mjs","selfTestV3.mjs")):
        require(sha((ROOT/"source"/source).read_bytes()) == assets["files"][filename]["sha256"], "Copied numerical source differs")
    require(len(browser["cases"]) == len(synthetic["cases"]) == 2 and browser["allSyntheticStagesExact"] is True, "Incomplete synthetic checks")
    for actual, expected in zip(browser["cases"], synthetic["cases"]):
        require(actual["id"] == expected["id"] and actual["inputUnchanged"] is True and actual["allStageHashesExact"] is True and actual["embeddingDimension"] == 512, "Synthetic case differs")
        require(vector_hash(expected["normalizedEmbedding512"]) == actual["embeddingSha256"] == expected["embeddingSha256"], "Synthetic expected vector/actual hash differs")
        provenance = actual["provenance"]
        for key in ("inputSha256", "resampledPcmSha256", "featureSha256", "embeddingSha256"):
            require(provenance[key] == expected[key], "Synthetic recorded stage hash differs")
    qualification = browser["qualification"]
    require(qualification["referenceSha256"] == PINS["reference/chrome-reference.json"] and qualification["stagedManifestSha256"] == PINS["reference/qualification-staged-manifest.json"]
            and qualification["softwareParityOnly"] is True and qualification["productionData"] is False and qualification["all26Exact"] is True, "Wrong qualification references")
    require(len(qualification["cases"]) == len(reference["records"]) == len(staged["records"]) == 26, "Incomplete original qualification")
    maximum = 0
    for index, (actual, expected, original) in enumerate(zip(qualification["cases"], reference["records"], staged["records"])):
        require(actual["row"] == index and actual["id"] == expected["clip_id"] == original["clip_id"] and actual["inputUnchanged"] is True and actual["allStageHashesExact"] is True, "Qualification identity/flags differ")
        values, target = actual["normalizedEmbedding512"], expected["checkpoint"]["embedding"]
        provenance, repeat = actual["provenance"], expected["checkpoint"]["repeats"][0]
        require(vector_hash(values) == provenance["embeddingSha256"] == repeat["embeddingSha256"], "Actual worker vector hash differs from Chrome")
        difference = max(abs(x-y) for x,y in zip(values,target));maximum=max(maximum,difference)
        require(difference == actual["embeddingMaxAbs"] == 0, "Worker coordinates differ from Chrome")
        require(provenance["inputSha256"] == expected["pcm_sha256"] == original["pcm_sha256"] and provenance["resampledPcmSha256"] == repeat["pcm48Sha256"] and provenance["featureSha256"] == repeat["featureSha256"], "Recorded input/feature/resample hashes differ")
        require(provenance["assetManifestSha256"] == asset_sha and provenance["moduleBindings"] == bindings and provenance["sampleRateHz"] == expected["sample_rate"] and provenance["sampleCount"] == expected["sample_count"], "Worker case execution contract differs")
    require(len([m for m in browser["messages"] if m["type"] == "embedding"]) == 28 and browser["messages"][-1]["type"] == "disposed", "Incomplete worker lifecycle messages")
    console = (ROOT/"console-qualified.txt").read_text()
    require("Total messages: 0 (Errors: 0, Warnings: 0)" in console, "Console evidence contains messages")
    summary = {"verified":True,"promotionAllowed":False,"classifierIncluded":False,"headOrAccuracyEvaluated":False,
        "workerSha256":PINS["source/productionWorkerV3.mjs"],"assetManifestSha256":asset_sha,
        "chromeReferenceSha256":PINS["reference/chrome-reference.json"],"qualificationCases":26,
        "qualificationActualVectorsRetained":26,"maximumEmbeddingCoordinateError":maximum,
        "syntheticCases":2,"syntheticActualStageHashesMatchReference":True,"syntheticExpectedVectorsRetained":2,
        "syntheticActualVectorsRetained":0,"requests":46,"requestMethods":["GET"],"requestStatuses":[200],
        "recordedOrigin":requests["origin"],"consoleErrors":0,"consoleWarnings":0,"capturedPhase":"disposed"}
    if (ROOT/"verified-summary.json").exists():
        require(load("verified-summary.json") == summary, "Verified summary differs")
    return summary


if __name__=="__main__":
    print(json.dumps(verify(),indent=2,allow_nan=False))
