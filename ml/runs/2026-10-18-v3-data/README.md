# V3 source-only final-audit preflight

October 18, 2026. This archive freezes **416 quality-passing, final-only audio examples** and their source reservations before any final-audit encoder, classifier, or score query. It contains metadata, source preparation code and provenance checks. It contains no audio, embeddings, model weights, predictions or accuracy results. Data availability does not qualify a model for release.

| Sound family | Examples | Uploader/hive groups |
| --- | ---: | ---: |
| Insect buzz | 36 | 13 |
| Mechanical fan | 35 | 20 |
| Speech | 52 | 51 |
| Road traffic | 52 | 32 |
| Wind | 47 | 32 |
| Unknown/background | 194 | 194 |

All five known families meet the protocol's data minimum of 20 examples and three groups. The unknown cohort meets 100 examples and ten groups. These are descriptive counts. Repeated recordings and aliases can correlate examples; the group counts do not establish independently verified people, devices or studies.

## Immutable files

The exact raw files retain these SHA256 values:

| File | SHA256 |
| --- | --- |
| `final-data.json` | `197e24e42c36de1368f9cd25424c98a4f8935af7c60429c4521d8d80feaa9520` |
| `final-reservations.json` | `08f9e9bcd5eecdcf7fe3273ffd8d8e75397ce3291938fd0d32fe6b8e10ea5b7b` |
| `manifests/bsd-final-audit.json` | `95bd60db117c4a10189cd753bd3cf8a5fd2bec01dc33b324b47539ce640536db` |
| `manifests/tobee.json` | `70c00546c62c8bec7be5d37a1b26fbde177ac7c11cb0ecdef51a10c05ea32f71` |
| `manifests/fsd-speech.json` | `36d1b3cc944d5e50073f236a5b18b986cb1d08710ef6c52ef155f175c8b578f3` |

`checksums.json` lists every other archived payload's size and SHA256. `archive-path-map.json` maps original cache paths to byte-identical archived copies. The repository already applies `ml/runs/** -text` in `.gitattributes` to preserve source bytes on Windows. Do not edit historical paths or reserialize these manifests to make them portable; create separately bound runtime/staging manifests when relocating audio.

## Sources and label limits

The authoritative BSD subset is **`bsd-creator-metadata-v4`**, with 341 passing clips: 9 buzz, 35 fan, 4 speech, 52 traffic, 47 wind and 194 unknown. [BSD35k-CS](https://zenodo.org/records/19187100) combines creator-selected broad categories with creator titles, tags and descriptions. Our metadata screening removes explicit generated/restricted/processed sources, wrong primary events and known-family title mixtures. It does not independently adjudicate the sound in each five-second crop. Mixed scenes, inaccurate tags and source-level labels that do not describe the opening crop remain possible.

[To bee or not to bee](https://zenodo.org/records/1321278) adds 27 insect-buzz recordings from six hive IDs. The entire first 0–5 seconds must lie in a human `bee` interval. The release provides 56 audio files despite 78 annotation names. Two malformed later interval bounds cause the entire affected recordings to be excluded without repairing their times. A fixed cap of eight files per hive selects 27; all 27 pass quality. Sessions/codecs stay grouped by hive, and both NU-Hive and OSBH collections remain final-only. The hives share collection/hardware conditions. The publisher's `nobee` means external noise superimposed on bees, so it is never used as a clean unknown negative. This evidence concerns insect buzz and cannot validate electrical hum, equipment, queen state or physical source identity.

[FSD50K](https://zenodo.org/records/4060432) contributes 48 fresh official-evaluation speech clips from a frozen, uploader-diverse first 100 candidates. Only one of the five target families may be present in its provided labels. The initial 20 speech candidates are a subset, not another ten examples counted twice. Historical labels and prior encoder training overlap remain limitations; this preflight establishes novelty against the two recorded TonalWatch experiments, not against every pretraining source.

The unknown examples have primary creator descriptors water 77, bird 37, instrumental music 29, door 16, percussion 13, footsteps 9, cat 8, dog 3 and fire 2. This constructed mixture is not a field prevalence estimate. All audio is dataset-declared CC0 or CC BY: 278 CC0, 121 CC BY 4.0 and 17 CC BY 3.0. Per-clip URLs, licenses and credits are preserved in `final-data.json`; see `ATTRIBUTION.md`.

## Selection history and exclusions

`quality-source-ledger.json` and the exact files in `selections/` preserve every policy amendment. The initial BSD policy was superseded after a synthetic test exposed a target-title ambiguity bug. A creator-text audit then found explicit AI wind, wind chimes/mimicked bells, traffic announcements, restricted/generated/distorted speech and a movie monologue. The final amendment excludes explicit wind-plus-road-vehicle title mixtures and conservative AI/IA wording. These corrections used source text and synthetic checks before any final model query. Classes, caps and PCM quality limits were not relaxed in response to classifier results.

All earlier reservations survive. The reservation file includes 442 group tokens, 648 source IDs, 648 complete-source hashes and 552 hashes each for prepared WAV and PCM representations, including discarded metadata candidates and quality failures. Exact/case-folded ToBee collection tokens are aliases, not extra independent groups. Superseded artifacts are explicitly historical and must not be scored as the authoritative final cohort.

The final BSD selection has ten source-clipping exclusions. Speech has 36 short, 14 source-clipped and two resampling-clipped exclusions. ToBee's selected 27 have no PCM quality exclusions; its two annotation defects are separate metadata exclusions. The initial residual-FSD pass yielded no valid non-speech targets under the unchanged rules, which is why additional collections were needed.

## Byte and split checks

Every final clip is exactly five seconds of mono 48 kHz Float32 PCM, first channel and offset zero. Finite samples, RMS at least `1e-5` and absolute peak strictly below `0.999` are required before and after resampling. No gain, padding, stitching, later crop substitution or attenuation repairs are applied. Publisher/uploader edits can already exist upstream; BSD itself distributes converted/cropped WAVs.

All 416 complete original files were rehashed, and all prepared WAV/PCM identities and quality gates were checked against their bytes. IDs and cross-representation hashes are unique within the final cohort. IDs, case-folded uploader/hive groups and the union of original/prepared/PCM hashes have zero overlap with **all 1,951 v1+v2 manifest rows**, covering 1,568 unique source IDs and 1,001 groups. This does not rule out aliases, transformed copies or unknown lineage. Every selected or rejected final source group must remain outside training, calibration and development audit.

BSD metadata ZIP MD5/SHA256 and CSV SHA256 are verified. Selective audio extraction verifies a pinned ZIP inventory, each selected member's CRC and new SHA256; the published **35 GB whole-archive MD5 is recorded, not verified**. BSD's `original_sha256` identifies its distributed converted WAV, not the upstream Freesound original. ToBee full-file publisher MD5 and new SHA256 are verified. Large full BSD catalogs are omitted; their source URLs and hashes are in `source-pins.json` and the source code.

## Reproduction

The original local caches remain under `output/v3-preflight/{bsd-final-audit,tobee,fsd-speech}/`; all earlier plans/caches remain under the sibling phase names. The exact inputs remain `ml/runs/2026-10-18/manifest.json` and `ml/runs/2026-10-18-v2/manifest-v2.json`. The final source modules and the speech/assembly scripts are copied under `source/`; `preparation-environment.json` and `requirements-source.txt` record the decoding/resampling runtime.

Recreate earlier metadata plans from the archived exact selections before calling `prepare_bsd(..., superseded_plan=<bsd-reviewed plan>)` and `prepare_tobee(...)`. Reproduce speech with `source/preflight-fsd-speech.py` and combine/check with `source/assemble-preflight.py`, running from the repository root with the intended source snapshot on `PYTHONPATH`. Relocated runtime paths need separate manifests linked to these immutable raw hashes. Require all original, prepared and PCM fingerprints to match; a changed library/backend or decoded source must not silently become the same audit input.

The final current BSD/ToBee code was also rerun from existing caches with network calls disabled: it reproduced both exact frozen manifests unchanged. The six source suites passed 51 tests, and an independent loader review found no concrete extraction/reservation bug. These are data/software checks, not model performance evidence. The next step is frozen development assembly and canonical-runtime fitting/calibration; final scoring must wait until that candidate is fixed.
