# Datacenter audio readiness

Source review: 2026-10-18. The initial audit below performed no raw-audio download or prediction. The extended public-source search has now retrieved outdoor candidates, documented further below. No new data-center classifier has been trained or promoted.

The current V3 sound hints recognize five broad families with abstention. They were **not trained or validated to confirm outdoor datacenter noise**. A fan-like hint, persistent spectral peak, C−A difference or nearby mapped facility does not establish that a datacenter produced the recording. Technical recording usability, calibrated measurement accuracy and physical source attribution are separate questions.

## Licensed indoor material found

The following original creator pages display CC0. They offer possible indoor development or diagnostic examples, with the limitations shown. Original downloads currently require a Freesound login; this review did not create an account, bypass that requirement or substitute a compressed preview for the original file. Retain creator/page/license metadata even for CC0 material.

| Source | Published format and duration | Context supplied by creator | Limits |
| --- | --- | --- | --- |
| mzinsser, [Datacenter 01 — 848559](https://freesound.org/people/mzinsser/sounds/848559/) and [Datacenter 02 — 848560](https://freesound.org/people/mzinsser/sounds/848560/), 2026-03-20 | Each 61.354 s; FLAC, 48 kHz, 16-bit stereo; 7.3 / 8.0 MB | Small datacenter machine room, Munich, Germany; lossless iPhone 14 recording. Second description mentions aggressive high frequencies. | Unnamed facility, creator assertion rather than independent site verification. Same creator/pack, identical durations: reserve as one dependent group; possible variants/overlap must be checked before counting independent audio. Indoors. |
| dkaufman, [server room binaural.wav — 422540](https://freesound.org/people/dkaufman/sounds/422540/), 2018-03-20 | 57.037 s; WAV, 48 kHz, 16-bit stereo; 10.4 MB | Binaural recording of a post-production facility's server room, described as unfiltered. | No named facility, recording device or external corroboration. “Unfiltered” is the creator's claim. Not a hyperscale campus or outdoor receptor recording. |
| Jdogb19, [Server Room — 674115](https://freesound.org/people/Jdogb19/sounds/674115/), 2023-02-11 | 9.500 s; WAV, 48 kHz, 24-bit stereo; 2.6 MB | Server room with fans and equipment. | No facility identity/location, device or controlled source intervention supplied. Short indoor example. |
| KVV_Audio, [AMBTech_Server Room Noise 01_KVV_FREE — 715475](https://freesound.org/people/KVV_Audio/sounds/715475/), 2023-12-14 | 102.500 s; WAV, 96 kHz, 24-bit stereo; 56.3 MB | Two server stacks in a small server room, Sumy, Ukraine; Zoom 5 with XY microphone. | Page includes a `loop` tag. Editing/loop status must be clarified before treating it as a continuous original field recording. Not outdoor facility ground truth. |

The source pages link the [CC0 dedication](https://creativecommons.org/publicdomain/zero/1.0/). Availability and labeling are qualified at the metadata level only; waveform quality, clipping, silence, editing and duplicate hashes remain untested. More five-second crops from one room do not create more independent facilities, sessions or devices. These examples must not be silently relabeled as verified outdoor datacenter sound.

## A named, first-party facility recording lead

The Wikimedia Foundation published [B-roll of its servers at CyrusOne, Carrollton, Texas, filmed in 2015](https://commons.wikimedia.org/wiki/File:B-roll_of_Wikimedia_Foundation_servers_at_CyrusOne_in_Carrollton,_Texas_-_photographed_in_2015.webm). Commons reports an audio/video WebM with VP8/Vorbis, duration **1,439.491 s**, size **483,920,784 bytes**, and SHA-1 `d1f55442279e782884c1dc5736833cbcab481297`. The credited author is the Wikimedia Foundation; the imported Vimeo source license was reviewed on Commons in 2017. The [original media URL](https://upload.wikimedia.org/wikipedia/commons/4/4e/B-roll_of_Wikimedia_Foundation_servers_at_CyrusOne_in_Carrollton%2C_Texas_-_photographed_in_2015.webm) is public and requires no login.

This is licensed **CC BY-SA 3.0**, not CC0. Any use must preserve attribution/license and satisfy applicable share-alike obligations; app/model deployment rights need review before using it in a released classifier. This review inspected its published metadata, not the media. Natural uninterrupted audio, speech, edits, processing and useful ambient intervals have not been verified. First-party named-facility provenance is stronger than an anonymous room label, but indoor B-roll is still not an outdoor source-isolation dataset. Treat the whole site/production session as one dependent group.

## Local outdoor evidence: measurements available, licensed raw audio missing

Prince William County's [Data Center Ordinance Advisory Group page](https://www.pwcva.gov/department/planning-office/data-center-ordinance-advisory-group/) publishes Nelson Acoustics' [Great Oaks monitoring report, 2025-05-07](https://www.pwcva.gov/assets/2025-05/1618%202025%20MAY%2007%20Great%20Oaks%20Monitoring%20-%20Update%20v1.1%201.pdf). It describes April 24–30 measurements at four neighborhood locations, ten-minute statistics and review of thirty-second audio excerpts, with weather/direct interference/yard work/long trains excluded from analysis. The report concludes that overlapping traffic prevents reliable isolation of the datacenter contribution from listening or a single measurement. These findings are specific to that study, not a universal claim that attribution is impossible.

The linked [Sound Monitoring Data workbook, 2025-05-06](https://www.pwcva.gov/assets/2025-05/DCOAG%20Sound%20Monitoring%20Data%20-%201618%20Great%20Oaks%2020250506_0.xlsx) supplies measurements, not waveforms. Metadata-only ZIP inspection found one embedded JPEG, no embedded audio and no external relationships. Downloaded workbook: 102,647 bytes; SHA-256 `aa3e78180afaf44bef198642234eabcf1ace6501c56e65f5d7b704fdecd5621d`. It cannot provide audio training examples or validate an audio classifier. The reviewed report/page/workbook do not grant a clear public raw-audio reuse license; public visibility of a report is not permission to train on unavailable recordings.

The later [Isolating Source Contributions presentation, 2025-06-24](https://www.pwcva.gov/assets/2025-06/DCOAG%20Nelson%20Acoustics%20Isolating%20Source%20Contributions%20PowerPoint%2020250624.pdf) discusses paired total/residual measurements and barrier/reference-location methods. It documents traffic and railway confounding and situations requiring remeasurement. It is useful for designing validation, not a labeled waveform dataset. The [Loudoun County overview](https://www.loudoun.gov/6405/Noise-Air-Quality-Concerns) also describes multiple equipment and environmental factors; a map location is contextual evidence, not acoustic ground truth.

## Other leads that do not fill the gap

- [AC/DCIM, TUM, 2022](https://www.net.in.tum.de/fileadmin/bibtex/publications/papers/wuestrich_noms2022_paper.pdf) reports real indoor measurements around 45 servers and seven cooled switches, using a Blue Yeti X about 1.5 m away. It demonstrates device-state events, including a twelve-second example. No publicly downloadable, licensed raw-audio dataset was identified in the reviewed paper. Its measurements do not test community source attribution.
- Matt Parker's [Blue Panelled HVAC Inside LD5](https://earthkeptwarm.bandcamp.com/track/blue-panelled-hvac-inside-ld5) identifies an Equinix Slough HVAC unit, but links **CC BY-NC-SA 4.0** and is part of an artistic soundtrack. His [project description](https://www.earthkeptwarm.com/the-cloud-is-more-than-air-and-water/) describes produced audiovisual work. This is not a qualified unprocessed outdoor dataset or default deployment source.
- The freely licensed [Electrical server room — OSFX](https://freesound.org/people/OSFX/sounds/429188/) explicitly describes DAW editing/mastering and a synthetic/artificial soundscape. Its title is not sufficient for a real-source truth label.
- Public resident/news videos can identify possible follow-up sites, but a post title, proximity or plausible sound does not verify the physical source or grant audio/model reuse rights. None was treated as training data here.

## What is still needed before datacenter attribution can be claimed

The missing candidate is a **rights-cleared collection of original outdoor recordings from multiple verified operating datacenters and comparable non-datacenter environments**, with facility identity, recording position/distance, session/date, device/settings, weather and operating/context notes. It needs independent source evidence, ideally matched near/far or total/residual recordings and documented operational changes when safely available. A nearby facility, a listener's guess or an existing broad model prediction cannot be the truth label.

A credible prospective validation protocol should:

1. Define the task and claim before fitting: technical usability, broad acoustic family and facility contribution are separate outputs. Permit “insufficient evidence.” Do not imply calibrated SPL accuracy from uncalibrated microphone PCM.
2. Freeze a source/license/attribution ledger before audio selection or model calls. Preserve original files, source IDs, uploader/site/session/device lineage and original/prepared/PCM hashes. Review clipping, dropouts, wind-on-microphone, processing and completeness without applying gain to hide failures. Unknown device response or AGC cannot be certified from a short waveform alone.
3. Separate development/calibration from a new untouched evaluation set at the **facility and collection/session level**, with device independence assessed and reported. Keep adjacent crops, channels, variants and same-session files together. Hold out entire new facilities; evaluate cross-device behavior rather than learning device signatures. Do not recycle the already inspected V1/V2/V3 cohorts, including the 416-record comparison, into a supposedly fresh final test.
4. Include real outdoor negatives and mixtures: residential/commercial HVAC, non-datacenter cooling equipment, road and rail traffic, wind, transformers/substations, insects and speech. Similar equipment at a non-datacenter site is especially important. Separate operating modes and indoor/outdoor domains; do not relabel MIMII machinery, insect buzz or generic fan clips as datacenter positives.
5. Have independent reviewers adjudicate source/context using the original evidence while blind to model predictions, with disagreements retained as ambiguous/unknown. Where source contribution cannot be established, exclude the claim or retain an explicit uncertain label.
6. Freeze model, preprocessing, abstention policy and acceptance criteria before opening the new evaluation. Report facility-level dependence, per-domain/per-device results, accepted-label precision, coverage, false acceptance on unknowns, confusions and uncertainty. Include failed and inconclusive recordings, not only easy examples. Do not tune new numeric thresholds from the old observed final outcomes.

Until that evidence exists, useful product wording is **recording usability checks** plus an **experimental sound-family hint**, followed by **datacenter comparison not validated**. No datacenter classifier is qualified or promoted by this source audit.

## Extended public-source search and retrieved candidates

The follow-up search retrieved original public audio files from INVC, rather
than replacing the missing data with indoor servers. These are anonymous
provider-documented cases with incomplete recording metadata, not an independent
field-validation corpus. Raw third-party audio remains in ignored local storage.

| Original context | Retrieved audio and fixed interval | Evidence and limit |
| --- | --- | --- |
| [Outside/inside cooling comparison](https://invc.com/noise-control/data-center-noise-attenuation/) | 11.55 s decoded, mono 44.1 kHz; first 0–5 s exterior, before the edit. | Consultant identifies exterior then interior hum. Site/device/session identity and source isolation are incomplete. |
| [Chiller/AHU mitigation case](https://invc.com/resources/noise-control-case-studies/environmental-noise-control/data-centre-server-farm-chiller-fan-noise-reduction/) | 17.89 s, mono 22.05 kHz; first 0–5 s before mitigation. | Consultant describes its own physical changes and before/after result. The later, quieter section is still data-center audio and cannot become a negative. |
| [Resident recording analyzed by Peter Wilson](https://invc.com/resources/newsposts/the-tonal-elephant-in-the-environmental-noise-report-room/) | 8.82 s, mono 22.05 kHz; first 0–5 s. | Article describes a smartphone recording at 150 m. This supports provider context, not independently isolated contribution. |
| [University rooftop chiller compressors](https://invc.com/resources/noise-control-case-studies/fans/chiller-compressor-whine-noise-control-at-source/) | 12.51 s, mono 22.05 kHz; first 0–5 s, before the edit. | Candidate lookalike cooling control from a university building. Its exact site and surrounding-source absence remain unverified. |

Automated speech screening found no speech in those four files. That is a
screening result, not proof of natural audio, absence of music, source identity
or faithful capture. Fixed first-five-second digital checks found no clipping,
near-full-scale samples, silence or nonfinite values. The full chiller/AHU source
has a later near-full-scale peak, outside its preselected first-five-second
interval; that fact is retained. Three inputs require explicitly documented
22.05→44.1 kHz preparation, which restores no original bandwidth.

One apparently useful [sports-facility cooling control](https://invc.com/resources/noise-control-case-studies/fans/dry-cooler-fan-hum-noise-silencing-low-cost-high-fan-efficiency/)
was **rejected before classifier queries**: spoken introductions leave no
uninterrupted five-second speech-free interval. A downloaded original WWMT
Dowagiac news package was similarly rejected for narration/interviews. The
Atlas file is only 4.212154 s and was not padded or repeated. All failures remain
recorded, rather than silently substituting favorable crops.

[GULFF's community-noise exhibition](https://gulffonline.com/exhibitionarchive/datacenternoise/)
provided original-source leads across several facilities. Its five-minute edits
explicitly loop community audio and pair it with collaged imagery. They cannot
be counted as five minutes of independent outdoor recording. Source overlays
also include uncertain distances, facilities and planned capacities. Ordinary
public-source retrieval was used; WUSA9 audio returned 403 and a Reddit route
required authentication, so those routes stopped without bypassing access checks.

The [new metadata audit and prospective protocol](../ml/OUTDOOR_DATACENTER_PROTOCOL.md)
checks connected facility/session/provider/parent/hash dependence, historical
cohort contamination and missing controls. Its current eight-record ledger binds
1,984 historical IDs and their original/prepared/PCM hashes. All anonymous INVC
cases share one conservative provider group. The current corpus **does not pass
readiness for an independent training/calibration/test pilot**; more crops cannot
repair that dependence. A separately frozen [development diagnostic](../ml/OUTDOOR_BASELINE_DIAGNOSTIC.md)
may inspect the unchanged broad-family head without fitting a new detector or
claiming field accuracy. [Source ledger and annotation evidence](../ml/runs/2026-10-18-outdoor-development/).

The user selected public sources only. No recording request was sent to INVC or
any other person.

The diagnostic was subsequently executed exactly once on the four fixed
windows. The existing production head abstained on all four. This is evidence
of limited coverage on these newly inspected development candidates, not a
field accuracy estimate. No new data-center head was fitted or promoted.
[Complete diagnostic results and reproducibility record](../ml/runs/2026-10-18-outdoor-development/README.md).

### Later prospective candidates: Hillsboro and hotel cooling

Two later sources remain outside the eight-record ledger and the executed
four-window diagnostic: a [Hillsboro Herald exterior recording](https://hillsboroherald.com/flexentials-new-hillsboro-6-data-center-marks-a-shift-from-jobs-to-joules/)
at the publisher-identified Flexential Hillsboro 3 site, and a
[Noisecare hotel ventilation case](https://noisecare.eu/prj/ventilation-system-hotel/)
in Esbjerg. The first offers named-site context from a new publisher; the second
offers a possible non-datacenter cooling confound from another provider. Neither
establishes isolated equipment contribution or faithful capture.

Both have a first 0–5 s interval fixed before any TonalWatch/CLAP source-classifier
query. Full-file ASR/VAD detected no speech, but manual soundtrack review, music
or replacement-audio checks, recording/processing metadata and operating-state
evidence remain incomplete. The hotel is unnamed; the Hillsboro exact capture
date is uncertain. These are **candidates, not verified training or test labels**.
The [separate prospective archive](../ml/runs/2026-10-18-outdoor-candidates/README.md)
preserves compact provenance and annotation summaries as exact byte copies, with
validated hashes and the qualification steps still needed. Raw media stays in
ignored local storage. No source-classifier prediction or new model promotion
is supported by this addition.
