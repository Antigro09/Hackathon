"""Frozen, CPU-only CLAP features for the TonalWatch research experiment.

This is an experimental extractor, not a replacement for the app model. The
ONNX audio/text branches and their metadata are pinned to the app's exact HF
revision. A native CPU ONNX run still needs browser WASM parity verification.

The browser's Transformers.js 4.3.1 `repeatpad` implementation pads an exact
five-second clip with five seconds of zeros. Python's default `repeatpad`
repeats it instead. We explicitly implement the browser's observed padding and
use Transformers 4.57.1's NumPy Slaney log-mel functions, without PyTorch.
References: HF transformers v4.57.1 models/clap/feature_extraction_clap.py and
Transformers.js 4.3.1 models/clap/feature_extraction_clap.js (Apache-2.0).
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import tempfile
from typing import Sequence
from urllib.request import urlopen

import numpy as np

MODEL_ID = "Xenova/clap-htsat-unfused"
MODEL_REVISION = "c28f2883575e590e04d3146ff0713c2448d691ba"
SAMPLE_RATE = 48_000
OBSERVATION_SAMPLES = SAMPLE_RATE * 5
PROCESSOR_SAMPLES = SAMPLE_RATE * 10
EMBEDDING_SIZE = 512

# SHA256s verified against HF LFS metadata for weights, and downloaded bytes for
# small files at MODEL_REVISION. Never download mutable /main/ model artifacts.
ARTIFACT_SHA256 = {
    "onnx/audio_model_quantized.onnx": "3fcff2c8824e7bcb83a983f2a49edab3b60cbcf4872ac70efee517355173bd1f",
    "onnx/text_model_quantized.onnx": "1a3df8b197e249816e08415fd040434c44762b2eea7eb7bf8a48a0f0bf3c14e5",
    "onnx/model_quantized.onnx": "3f559313ec268518193101007fc0569ee4b2cfac03e369091c50adb4795f5c5d",
    "config.json": "39c6d90fe29cf2cce650dd5c92c38a1e35b130d9ce0bb98585222ad687ad979b",
    "preprocessor_config.json": "9739f58296aa6f9ac18008fd0150fb2649bc554985fbde86d0a4041c882ac753",
    "tokenizer.json": "dc239041d98de27ffc3975473a1a23e3db4c937b23c138c38bbc66588bd247e5",
    "tokenizer_config.json": "2c964a338683aec3695ea37687271e75b40905233f5d2a5bbb9be8cb40c4d0a0",
    "special_tokens_map.json": "06e405a36dfe4b9604f484f6a1e619af1a7f7d09e34a8555eb0b77b66318067f",
}

PREPROCESSOR_CONFIG = {
    "sampling_rate": SAMPLE_RATE, "nb_max_samples": PROCESSOR_SAMPLES,
    "feature_size": 64, "fft_window_size": 1024, "nb_frequency_bins": 513,
    "hop_length": 480, "frequency_min": 50, "frequency_max": 14_000,
    "truncation": "rand_trunc", "padding": "repeatpad", "top_db": None,
}


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download_artifact(filename: str, cache_dir: str | Path) -> Path:
    """Download a known immutable artifact and verify SHA256 before use."""
    if filename not in ARTIFACT_SHA256:
        raise ValueError(f"Unpinned model artifact: {filename}")
    destination = Path(cache_dir) / MODEL_REVISION / filename
    expected = ARTIFACT_SHA256[filename]
    if destination.exists():
        if _file_sha256(destination) != expected:
            raise ValueError(f"Cached artifact SHA256 mismatch: {filename}")
        return destination
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(dir=destination.parent, delete=False) as handle:
            temporary = Path(handle.name)
            digest = hashlib.sha256()
            url = f"https://huggingface.co/{MODEL_ID}/resolve/{MODEL_REVISION}/{filename}"
            with urlopen(url, timeout=120) as response:
                for chunk in iter(lambda: response.read(1024 * 1024), b""):
                    handle.write(chunk)
                    digest.update(chunk)
        if digest.hexdigest() != expected:
            raise ValueError(f"Downloaded artifact SHA256 mismatch: {filename}")
        os.replace(temporary, destination)
        return destination
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def pad_browser5s(pcm48k: np.ndarray) -> np.ndarray:
    """Validate Float32 mono PCM, then pad exactly 240000 zeros on the right.

    No resampling, averaging, amplitude normalization, random cropping, or
    augmentation happens here. The caller must supply the first five seconds
    of one channel already resampled to 48 kHz, as the app does.
    """
    audio = np.asarray(pcm48k, dtype=np.float32)
    if audio.ndim != 1 or audio.shape != (OBSERVATION_SAMPLES,):
        raise ValueError("Expected exactly 240000 mono samples at 48000 Hz")
    if not np.isfinite(audio).all():
        raise ValueError("Audio samples must be finite")
    padded = np.zeros(PROCESSOR_SAMPLES, dtype=np.float64)
    padded[:OBSERVATION_SAMPLES] = audio
    return padded


class FrozenClapExtractor:
    """The unfused CLAP NumPy log-mel path with explicit browser padding."""

    def __init__(self, config: dict | None = None):
        from transformers.audio_utils import mel_filter_bank, window_function

        self.config = dict(PREPROCESSOR_CONFIG if config is None else config)
        for name, expected in PREPROCESSOR_CONFIG.items():
            if self.config.get(name) != expected:
                raise ValueError(f"Unexpected CLAP preprocessor setting: {name}")
        self.mel_filters = mel_filter_bank(
            num_frequency_bins=513, num_mel_filters=64,
            min_frequency=50, max_frequency=14_000,
            sampling_rate=SAMPLE_RATE, norm="slaney", mel_scale="slaney",
        )
        self.window = window_function(1024, "hann")

    def __call__(self, pcm48k: np.ndarray) -> np.ndarray:
        from transformers.audio_utils import spectrogram

        padded = pad_browser5s(pcm48k)
        log_mel = spectrogram(
            padded, self.window, frame_length=1024, hop_length=480,
            power=2.0, mel_filters=self.mel_filters, log_mel="dB",
        ).T
        features = np.ascontiguousarray(log_mel[None, None, :, :], dtype=np.float32)
        if features.shape != (1, 1, 1001, 64) or not np.isfinite(features).all():
            raise ValueError("Invalid frozen CLAP log-mel features")
        return features


def load_extractor(cache_dir: str | Path) -> FrozenClapExtractor:
    config_path = download_artifact("preprocessor_config.json", cache_dir)
    return FrozenClapExtractor(json.loads(config_path.read_text(encoding="utf-8")))


def preprocess5s(pcm48k: np.ndarray, extractor: FrozenClapExtractor | None = None) -> np.ndarray:
    """Return Float32 [1, 1, 1001, 64] features for exactly five seconds."""
    return (extractor if extractor is not None else FrozenClapExtractor())(pcm48k)


def _load_session(filename: str, cache_dir: str | Path):
    import onnxruntime as ort

    options = ort.SessionOptions()
    options.intra_op_num_threads = 1
    options.inter_op_num_threads = 1
    return ort.InferenceSession(
        str(download_artifact(filename, cache_dir)),
        sess_options=options, providers=["CPUExecutionProvider"],
    )


def load_audio_session(cache_dir: str | Path):
    """Load only the frozen q8 audio branch (~34.3 MB), CPU provider only."""
    return _load_session("onnx/audio_model_quantized.onnx", cache_dir)


def load_text_session(cache_dir: str | Path):
    """Optional q8 text branch (~126.6 MB); never needed for probe deployment."""
    return _load_session("onnx/text_model_quantized.onnx", cache_dir)


def load_reference_session(cache_dir: str | Path):
    """Optional deployed combined q8 graph (~161 MB), CPU parity baseline."""
    return _load_session("onnx/model_quantized.onnx", cache_dir)


def normalize_embeddings(values: np.ndarray) -> np.ndarray:
    values = np.asarray(values, dtype=np.float64)
    if values.ndim != 2 or values.shape[1] != EMBEDDING_SIZE or not np.isfinite(values).all():
        raise ValueError("Expected finite [N, 512] embeddings")
    norms = np.linalg.norm(values, axis=1, keepdims=True)
    if np.any(norms <= 1e-12):
        raise ValueError("Cannot normalize an empty/zero CLAP embedding")
    return np.ascontiguousarray(values / norms, dtype=np.float32)


def embed_audio(session, features: np.ndarray) -> np.ndarray:
    """Return explicitly L2-normalized Float32 [N, 512] audio embeddings."""
    features = np.ascontiguousarray(features, dtype=np.float32)
    if features.ndim != 4 or features.shape[1:] != (1, 1001, 64) or not np.isfinite(features).all():
        raise ValueError("Expected finite [N, 1, 1001, 64] log-mel features")
    input_names = {item.name for item in session.get_inputs()}
    if input_names != {"input_features"}:
        raise ValueError(f"Unexpected q8 audio model inputs: {sorted(input_names)}")
    if "audio_embeds" not in {item.name for item in session.get_outputs()}:
        raise ValueError("Frozen q8 audio model has no audio_embeds output")
    output = session.run(["audio_embeds"], {"input_features": features})[0]
    return normalize_embeddings(output)


def tokenize_texts(texts: Sequence[str], cache_dir: str | Path) -> dict[str, np.ndarray]:
    """Roberta tokenization matching JS padding/truncation, with no template."""
    from tokenizers import Tokenizer

    if not texts or any(not isinstance(text, str) or not text.strip() for text in texts):
        raise ValueError("Provide nonempty, explicit label prompts")
    tokenizer = Tokenizer.from_file(str(download_artifact("tokenizer.json", cache_dir)))
    config = json.loads(download_artifact("tokenizer_config.json", cache_dir).read_text(encoding="utf-8"))
    tokenizer.enable_truncation(max_length=config["model_max_length"])
    tokenizer.enable_padding(direction="right", pad_id=1, pad_type_id=0, pad_token="<pad>")
    encodings = tokenizer.encode_batch(list(texts), add_special_tokens=True)
    return {
        "input_ids": np.asarray([item.ids for item in encodings], dtype=np.int64),
        "attention_mask": np.asarray([item.attention_mask for item in encodings], dtype=np.int64),
    }


def embed_texts(session, texts: Sequence[str], cache_dir: str | Path) -> np.ndarray:
    inputs = tokenize_texts(texts, cache_dir)
    names = {item.name for item in session.get_inputs()}
    if "input_ids" not in names or not names.issubset(inputs):
        raise ValueError(f"Unexpected q8 text model inputs: {sorted(names)}")
    # This pinned exported text graph consumes input_ids only. Like JS's model
    # wrapper, supply only graph inputs; keep the tokenizer's attention_mask
    # available for a reference graph if its schema explicitly consumes it.
    output = session.run(["text_embeds"], {name: inputs[name] for name in names})[0]
    return normalize_embeddings(output)


def zero_shot_scores(audio_embeddings: np.ndarray, text_embeddings: np.ndarray, *, logit_scale: float = 100.0) -> np.ndarray:
    """Relative softmax of scaled cosine similarities, NOT source confidence.

    The scale is explicit and reported; 100 is a research baseline convention,
    not a recovered learned CLAP scale. Separate branch quantization can differ
    from the deployed combined graph. Compare top-label rankings and validate
    all abstention settings independently. This is not advertised as an exact
    reproduction of the app's existing relative score values.
    """
    if not np.isfinite(logit_scale) or logit_scale <= 0:
        raise ValueError("logit_scale must be finite and positive")
    logits = float(logit_scale) * (normalize_embeddings(audio_embeddings) @ normalize_embeddings(text_embeddings).T)
    logits = logits.astype(np.float64)
    logits -= logits.max(axis=1, keepdims=True)
    exp = np.exp(logits)
    return exp / exp.sum(axis=1, keepdims=True)


def reference_zero_shot_scores(session, features: np.ndarray, texts: Sequence[str], cache_dir: str | Path) -> np.ndarray:
    """Use deployed combined q8 graph logits, including its learned scale.

    This is the preferred unchanged zero-shot baseline when runtime permits.
    Prompts must be exactly the app's labels when auditing existing behavior,
    or the experiment's predeclared broad-label prompts for same-label trials.
    Native CPU vs browser WASM/tokenization parity remains a required check.
    """
    features = np.ascontiguousarray(features, dtype=np.float32)
    if features.shape != (1, 1, 1001, 64) or not np.isfinite(features).all():
        raise ValueError("Reference baseline requires one finite five-second feature tensor")
    inputs = {**tokenize_texts(texts, cache_dir), "input_features": features}
    names = {item.name for item in session.get_inputs()}
    if not {"input_ids", "input_features"}.issubset(names) or not names.issubset(inputs):
        raise ValueError(f"Unexpected combined q8 model inputs: {sorted(names)}")
    logits = np.asarray(session.run(["logits_per_audio"], {name: inputs[name] for name in names})[0], dtype=np.float64)
    if logits.shape != (1, len(texts)) or not np.isfinite(logits).all():
        raise ValueError("Invalid combined q8 relative logits")
    logits -= logits.max(axis=1, keepdims=True)
    exp = np.exp(logits)
    return exp / exp.sum(axis=1, keepdims=True)


def compare_browser_golden(pcm48k: np.ndarray, browser_features: np.ndarray, *, extractor: FrozenClapExtractor | None = None) -> dict:
    """Compare a browser-exported tensor without silently relaxing tolerance."""
    expected = np.asarray(browser_features, dtype=np.float32)
    actual = preprocess5s(pcm48k, extractor)
    if expected.shape != actual.shape or not np.isfinite(expected).all():
        raise ValueError("Invalid browser golden tensor")
    delta = np.abs(actual.astype(np.float64) - expected.astype(np.float64))
    return {"shape": list(actual.shape), "max_abs_error": float(delta.max()), "mean_abs_error": float(delta.mean())}
