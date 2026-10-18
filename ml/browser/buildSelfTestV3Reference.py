"""Verify/freeze two predeclared synthetic cases from independent Node/Chrome runs.

No encoder inference, classifier scoring, training, real audio, or app activation.
Run from the repository root with ``python -m ml.browser.buildSelfTestV3Reference``.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re

import numpy as np

from ml.canonical_v3 import derive_embedding_contract

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "output/v3-selftest"
GENERATOR_SHA256 = "cf4c6a95f4b5108c4c906829385f062a66ccf363a2ece78c49da31b634af4105"
EXPECTED_CASES = (
    ("tw-v3-square-44100", 44100, 220500, "c5fda595540149391f6507afcecd0efc574e067e7396e3315b4a38f4a5e21297"),
    ("tw-v3-noise-48000", 48000, 240000, "9612fc9bc47aa9d4a2da72b7a22fcce2b66debf98b2433e86e3ddb0f2ef50a81"),
)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def read(path):
    raw = Path(path).read_bytes()
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError("Duplicate JSON key")
            result[key] = value
        return result
    def invalid(value):
        raise ValueError(f"Non-finite JSON constant: {value}")
    return raw, json.loads(raw, object_pairs_hook=pairs, parse_constant=invalid)


def write_once(path, value):
    raw = (json.dumps(value, indent=2, allow_nan=False) + "\n").encode()
    if path.exists():
        if path.read_bytes() != raw:
            raise ValueError(f"Refusing changed reference: {path}")
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("xb") as handle:
            handle.write(raw)
    return {"sha256": sha(raw), "bytes": len(raw)}


def build_reference(*, staged_manifest, source_manifest, node_embeddings, chrome_embeddings, output,
                    generator=ROOT / "ml/browser/selfTestV3.mjs"):
    """Read supplied complete software jobs, verify all repeats, write exclusively.

    Existing reference bytes are accepted only if byte-identical; never overwritten.
    The two expected input hashes are independent of caller-provided metadata.
    """
    generator = Path(generator)
    source_raw, source = read(source_manifest)
    staged_raw, staged = read(staged_manifest)
    node_raw, node = read(node_embeddings)
    chrome_raw, chrome = read(chrome_embeddings)
    if sha(generator.read_bytes()) != GENERATOR_SHA256 or source["generatorSha256"] != GENERATOR_SHA256 or staged["sourceManifestSha256"] != sha(source_raw):
        raise ValueError("Synthetic generator/source identity changed")
    if len(staged["records"]) != 2 or len(node["records"]) != 2 or len(chrome["records"]) != 2:
        raise ValueError("Reference requires exactly the two predeclared software cases")
    contract = derive_embedding_contract(node["contract"])
    if contract != derive_embedding_contract(chrome["contract"]):
        raise ValueError("Canonical runtime/preprocessing identities differ")
    for document in (node, chrome):
        encoded = json.dumps(document["contract"], separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode()
        if document["contractSha256"] != sha(encoded) or document["contract"]["manifestSha256"] != sha(staged_raw) or document["contract"]["repeatCount"] != 3 or document.get("promotionAllowed") is not False:
            raise ValueError("Canonical run identity/repeat count changed")
    cases = []
    browsers = []
    for definition, expected, local, browser in zip(EXPECTED_CASES, staged["records"], node["records"], chrome["records"]):
        if (expected.get("clip_id"), expected.get("sample_rate"), expected.get("sample_count"), expected.get("pcm_sha256")) != definition:
            raise ValueError("Input is not one of the two frozen synthetic cases in the declared order")
        for row in (local, browser):
            if {key: value for key, value in row.items() if key != "checkpoint"} != expected:
                raise ValueError("Synthetic input metadata/order changed")
        if expected.get("pcm_path") != expected["clip_id"] + ".f32":
            raise ValueError("Unexpected synthetic PCM path")
        input_bytes = (Path(staged_manifest).parent / expected["pcm_path"]).read_bytes()
        if sha(input_bytes) != expected["pcm_sha256"] or len(input_bytes) != expected["sample_count"] * 4:
            raise ValueError("Synthetic input bytes changed")
        a, b = local["checkpoint"], browser["checkpoint"]
        if a["embedding"] != b["embedding"]:
            raise ValueError("Node/Chrome embedding vectors differ")
        vector = np.asarray(a["embedding"], dtype="<f4")
        if vector.shape != (512,) or not np.isfinite(vector).all() or not np.array_equal(vector.astype(np.float64), a["embedding"]) or abs(np.linalg.norm(vector.astype(np.float64)) - 1) > 1e-6:
            raise ValueError("Reference is not normalized finite canonical Float32")
        first = a["repeats"][0]
        for checkpoint, document in ((a, node), (b, chrome)):
            if checkpoint["contractSha256"] != document["contractSha256"] or checkpoint["clipId"] != expected["clip_id"] or checkpoint["pcmSha256"] != expected["pcm_sha256"] or checkpoint["sourceSha256"] != expected["source_sha256"] or checkpoint["row"] != expected["row"] or len(checkpoint["repeats"]) != 3:
                raise ValueError("Checkpoint identity changed")
            for repeat in checkpoint["repeats"]:
                for key in ("pcm48Sha256", "featureSha256", "embeddingSha256"):
                    if not re.fullmatch("[a-f0-9]{64}", repeat[key]) or repeat[key] != first[key]:
                        raise ValueError("Repeat/Node/Chrome numeric hash mismatch")
        if first["embeddingSha256"] != sha(vector.tobytes()):
            raise ValueError("Vector does not match its embedding hash")
        identity = b["browser"]
        if "Chrome/" not in identity["userAgent"] or identity["transformersVersion"] != "4.3.1" or identity["ortVersion"] != node["contract"]["ortVersion"]:
            raise ValueError("Unexpected browser identity")
        browsers.append(identity)
        cases.append({"id": expected["clip_id"], "sampleRate": expected["sample_rate"],
                      "sampleCount": expected["sample_count"], "inputSha256": expected["pcm_sha256"],
                      "resampledPcmSha256": first["pcm48Sha256"], "featureSha256": first["featureSha256"],
                      "embeddingSha256": first["embeddingSha256"], "normalizedEmbedding512": a["embedding"]})
    if browsers[0] != browsers[1]:
        raise ValueError("Browser identity changed between cases")
    reference = {"formatVersion": 1, "implementation": "tw-v3-synthetic-startup-reference-v1",
                 "purpose": "Numerical software startup parity only; these two synthetic cases do not measure field accuracy, coverage, or microphone behavior.",
                 "fieldEvidence": False, "promotionAllowed": False, "classifierIncluded": False,
                 "comparison": "Exact little-endian Float32 SHA256 equality; no tolerance, renormalization, head scoring, fitting, or selected parameters.",
                 "generator": {"path": "ml/browser/selfTestV3.mjs", "sha256": sha(generator.read_bytes()), "specification": source["specification"]},
                 "embeddingContract": contract,
                 "provenance": {"stagedManifestSha256": sha(staged_raw), "sourceManifestSha256": sha(source_raw),
                                "nodeEmbeddingsSha256": sha(node_raw), "chromeEmbeddingsSha256": sha(chrome_raw),
                                "nodeContractSha256": node["contractSha256"], "chromeContractSha256": chrome["contractSha256"],
                                "repeatsPerCasePerEnvironment": 3, "allStagesBitExact": True,
                                "nodeEnvironment": node["contract"]["environment"], "browser": browsers[0]},
                 "cases": cases}
    return write_once(Path(output), reference)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--staged-manifest", type=Path, default=BASE / "staged/manifest.json")
    parser.add_argument("--source-manifest", type=Path, help="Default: synthetic-source.json beside staged manifest")
    parser.add_argument("--node-embeddings", type=Path, default=BASE / "node/embeddings.json")
    parser.add_argument("--chrome-embeddings", type=Path, default=BASE / "chrome/embeddings.json")
    parser.add_argument("--output", type=Path, default=BASE / "reference.json")
    args = parser.parse_args(argv)
    result = build_reference(staged_manifest=args.staged_manifest,
                             source_manifest=args.source_manifest or args.staged_manifest.parent / "synthetic-source.json",
                             node_embeddings=args.node_embeddings, chrome_embeddings=args.chrome_embeddings,
                             output=args.output)
    print(json.dumps({"reference": result}, indent=2))


if __name__ == "__main__":
    main()
