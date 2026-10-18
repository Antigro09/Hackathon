# TonalWatch sound-hint experiment

The production app currently uses zero-shot CLAP similarity to eight descriptions. No field accuracy has been established. This experiment asks whether a small classifier trained on frozen audio embeddings can improve a **broader, data-supported task**: buzzing, mechanical fan, traffic, wind, or speech, with rejection of unfamiliar sounds.

The classifier does not establish a transformer, light ballast, facility, or indoor/outdoor location. Those claims need verified recordings from distinct equipment and sites. The experiment does not change the live app or its deterministic screening/report engine.

Open [the Colab notebook](https://colab.research.google.com/github/Antigro09/Hackathon/blob/main/notebooks/TonalWatch_Audio_Training.ipynb). A CPU runtime is sufficient for the first run; no paid accelerator, API key, personal recordings, Drive mount, or Hugging Face login is required. The notebook downloads a capped public-audio subset and pinned model artifacts, trains a regularized linear classifier, calibrates an unknown-sound rejection rule on development data, and evaluates held-out recordings once. Runtime availability is controlled by Colab.

The data loader retains individual attribution/license/source records. It preserves test recordings from the official evaluation split and separates uploaders across development, calibration, and test splits. First-channel, first-five-second cropping matches the app. Dataset clip-level tags may not describe every event in the cropped segment; the notebook includes listening checks and reports that limitation.

The encoder is frozen. Full encoder fine-tuning is a later experiment if this baseline exposes errors that a larger, representative dataset can address. A higher score on a small public benchmark alone is insufficient to claim reliable source identification or replace the production model.

## Local reproduction

Use an isolated Python environment and the pinned dependencies in `requirements.txt`. Run the notebook top-to-bottom, or use its calls to `ml.data`, `ml.features`, and `ml.experiment`. Downloaded clips, model weights, and scratch results belong outside tracked source, normally under ignored `output/ml/` locally or `/content/tonalwatch-artifacts/` in Colab.

The notebook records source commit, manifest hashes, environment versions, held-out metrics, and a small portable classifier artifact. Keep `promotionAllowed: false` until browser feature/embedding parity, realistic independent recordings, and the acceptance criteria have been checked. Native ONNX Runtime and browser WASM can differ even when they load identical quantized model weights.

## Implementation checks

The experiment's 22 unit checks pass, covering crop/gain policy, license filtering, split leakage, fixed test thresholds, normalization, and portable coefficients. A real five-second synthetic 63 Hz signal produced valid 512-dimensional q8 audio embeddings; actual text inference also succeeded. The NumPy log-mel features matched the pinned Python CLAP extractor with explicit zero-padding exactly for that signal. These checks establish software wiring, not classification accuracy.

The notebook's matched baseline ranks cosine similarities from the separately converted q8 audio/text branches. It is a fair comparator for the frozen-embedding task, but it does not reproduce the live app's combined-graph score values. On one synthetic fixture, the audio-only and combined-graph embeddings differed slightly (cosine 0.999748); a conventional cosine softmax and the combined graph's learned scale also gave different relative scores. `features.py` provides `load_reference_session` and `reference_zero_shot_scores` for a separate audit of the exact combined graph. Preserve this distinction when interpreting results.
