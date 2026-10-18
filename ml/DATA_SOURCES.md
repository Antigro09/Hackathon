# TonalWatch sound-hint experiment data

The experiment uses a small, attributed selection of **FSD50K v1.0**. Its audio
comes from public field recordings, rather than synthetic hum or recordings the
user must make. No account, token, or paid download is needed. No audio is added
to the web app or uploaded from its users.

## Original source and immutable mirror

- Original release: [Fonseca et al., FSD50K v1.0](https://zenodo.org/records/4060432).
- Dataset paper: [FSD50K: An Open Dataset of Human-Labeled Sound Events](https://arxiv.org/abs/2010.00475).
- Audio mirror: [Fhrozen/FSD50k](https://huggingface.co/datasets/Fhrozen/FSD50k),
  pinned to `ccf1acaff12f3f4a4c10052dddafbb6d22152c9b`.
- Individual original WAVs are downloaded at
  `https://huggingface.co/datasets/Fhrozen/FSD50k/resolve/<revision>/clips/<dev|eval>/<Freesound-ID>.wav`.
  This avoids downloading the complete 24.7 GB release, and avoids a lossy Opus mirror.
- Primary labels, split assignments, uploader names, titles, and per-clip licenses
  come directly from the original Zenodo metadata, not the mirror's dataset-card license.

Metadata archive hashes are checked before use:

| Archive | Bytes | SHA-256 | Original published MD5 |
| --- | ---: | --- | --- |
| `FSD50K.ground_truth.zip` | 334701 | `db2396260a7b1fb06feb6ccac71685794fc89917d71c3a8d64a1de85c2cc0ebf` | `ca27382c195e37d2269c4c866dd73485` |
| `FSD50K.metadata.zip` | 6700838 | `9a738e032546f9a2c6e3d04566928d04a65fb79b422cc9d78bb781723537bd19` | `b9ea0c829a411c1d42adb9da539ed237` |

An individual download was verified during implementation: `eval/100.wav` is
mono 44.1 kHz PCM16, 18.553 seconds, 1,636,454 bytes; its SHA-256
`8aa3a704fa47de0301c72d6a9a7149dfaf2a43f8632469f8be6ab7ac33169f3d`
matches that file's LFS object hash at the pinned mirror revision. The original
release does not publish a separate per-clip checksum list; generated manifests
record the downloaded original and prepared audio hashes for repeatability.

## License and attribution

FSD50K's curated dataset is CC BY 4.0, but **each sound has its own license**.
The downloader accepts only Creative Commons CC0 1.0 and unmodified CC BY
licenses. It excludes CC BY-NC, CC Sampling+, CC BY-SA, and unrecognized licenses.
Each manifest entry preserves the uploader, title, exact license URL, original
Freesound URL, mirror revision URL, and both audio hashes. Keep that manifest with
any derived model and provide attribution when distributing an artifact. Do not
interpret the mirror's top-level `cc-by-4.0` tag as overriding sound licenses.

Dataset citation: Eduardo Fonseca, Xavier Favory, Jordi Pons, Frederic Font,
and Xavier Serra, “FSD50K: an open dataset of human-labeled sound events,”
IEEE/ACM Transactions on Audio, Speech, and Language Processing, vol. 30,
pp. 829–852, 2022, DOI 10.1109/TASLP.2021.3133208.

## Supported labels and known gaps

| Experiment label | Exact FSD50K label | Eligible dev/eval clips before duration and quality checks* |
| --- | --- | ---: |
| `buzz` | `Buzz` | 66 / 60 |
| `mechanical_fan` | `Mechanical_fan` | 48 / 46 |
| `traffic` | `Traffic_noise_and_roadway_noise` | 118 / 96 |
| `wind` | `Wind` | 265 / 112 |
| `speech` | `Speech` | 1226 / 631 |

*Counts require a permitted license and exactly one of the five target labels.
These are availability counts, not training-set sizes or independent devices.
The experiment further rejects clips shorter than five seconds, quiet/clipped
audio, duplicates, and candidates beyond deterministic download caps.

There is no verified transformer, light-fixture, electrical-hum, silence,
household/industrial-context, or wind-on-microphone ground truth in this
selection. **Buzz must not be renamed transformer hum.** FSD50K's mechanical-fan
annotation instructions explicitly distinguish fans from air-conditioning sounds.
The labels are weak, applying to a whole 0.3–30 second clip; they do not guarantee
the event dominates the first five seconds. Manual listening and a later
independent, phone-recorded evaluation are still needed before an accuracy claim.

## Sampling, quality, and leakage controls

`prepare_dataset()` in `ml/data.py` creates exactly five seconds from offset zero,
first channel, then uses `scipy.signal.resample_poly` to convert 44.1 kHz to 48 kHz.
It saves float WAV so there is no gain normalization or extra integer
quantization. Both the original crop and prepared input must contain finite
values, have RMS at least `1e-5`, and have peak absolute magnitude below `0.999`.
Quiet or clipping failures are rejected, never attenuated to conceal clipping.
The manifest stores source/prepared peak, RMS, clipping counts, and exclusions.

- Official evaluation clips are reserved for `test` and `ood_test`.
- The original development/evaluation uploader separation is asserted.
- Development train/validation are reassigned by whole uploader because the
  official development train/validation division need not isolate uploaders.
- **Every pair** among `train`, `val`, `test`, `ood_val`, and `ood_test` must have
  disjoint uploaders, Freesound IDs, original hashes, and prepared hashes.
- Uploader round-robin selection limits domination by a prolific recorder;
  per-class caps and all random choices are deterministic from the stored seed.
- Unknown examples are never training labels. Validation unknowns use rain,
  water, footsteps, and dogs; test unknowns use music, birds, bells, and doors.
  Clips bearing a target label or the other unknown split's categories are excluded.
- These splits protect downstream training/calibration. They cannot guarantee the
  pretrained CLAP encoder never saw a recording during its original pretraining.

Default minima are 12 training, 4 validation, and 8 test clips **per class**,
plus 20 unknown clips per unknown split. These are small-experiment safeguards,
not sufficient evidence for production accuracy. If eligible material cannot
meet a minimum, preparation fails with an auditable manifest rather than silently
substituting labels, padded short audio, or synthetic data.

## API

```python
from ml.data import prepare_dataset

manifest_path = prepare_dataset('/content/tonalwatch-data', seed=804)
```

`manifest.json` contains `records`, `summary`, pinned `source` metadata,
`preprocessing`, and `validation_passed`. Records expose `clip_id`, `label`,
`split`, `uploader`, `uploader_group`, `sha256`, `original_sha256`, `local_path`,
original source metadata, attribution, and quality measurements. Only a successful
return authorizes proceeding to the model experiment. Cache/output directories
belong outside version control; commit scripts and small reports, not audio.
