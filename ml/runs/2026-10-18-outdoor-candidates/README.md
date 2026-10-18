# Prospective outdoor audio candidates — 2026-10-18

These two later sources are **candidates, not verified test truth**. They are
separate from the INVC development ledger and its already executed four-window
diagnostic. No TonalWatch/CLAP source-classifier predictions, fitting or threshold
selection were performed on either candidate during this collection and archive.
The ASR/VAD annotation described below is a speech screen, not source inference.

For both sources, the prospective interval is the **first 0–5 seconds**, selected
before any source-classifier query. Do not replace it with a crop chosen from
model scores. Neither source is admitted to training, calibration or evaluation
by this archive. Current production model behavior and datacenter-attribution
readiness are unchanged.

## Sources and remaining uncertainty

| Candidate | Public source and original | Published/decoded media | Context and qualification limit |
| --- | --- | --- | --- |
| Hillsboro Herald / Dirk Knudsen; Flexential Hillsboro 3, Oregon | [Publisher article](https://hillsboroherald.com/flexentials-new-hillsboro-6-data-center-marks-a-shift-from-jobs-to-joules/); [original MP4](https://hillsboroherald.com/wp-content/uploads/2025/09/20250829_180607.mp4) | 51.966259 s container; 51.96625 s decoded; AAC stereo, 44.1 kHz; 32,128,183 bytes | Publisher says its own video was recorded beside the facility on NE Constable Drive. Sampled frames show an exterior perimeter. The [operator page](https://www.flexential.com/data-centers/or/portland/hillsboro3-data-center) corroborates the named facility, not the recording position or acoustic contribution. Traffic, wind and camera/recorder motion may contribute. Exact hardware type, capture date, device, gain/processing, weather and operating state remain uncertain. No source-on/off comparison or calibrated fidelity evidence. |
| Noisecare; hotel ventilation in Esbjerg, Denmark | [Installer case](https://noisecare.eu/prj/ventilation-system-hotel/); [original MP4](https://noisecare.eu/wp-content/uploads/2025/08/noisecare_esbjerg_noisecare.mp4) | 14.247567 s container; 14.2506875 s decoded; AAC stereo, 48 kHz; 135,350,158 bytes | Provider describes outdoor hotel ventilation, making this a possible cooling confound rather than a datacenter positive. Sparse frames show fans, an enclosure, masonry walls and a service yard. Elevated camera views do not establish a rooftop. The hotel is unnamed; no address, recorder settings, capture date or operating-state evidence is supplied. Promotional video context does not establish an original environmental soundtrack. |

Pinned `Systran/faster-whisper-tiny.en` at revision
`0d3d19a32d3338f10357c0889762bd8d64bbdeba` and Silero VAD detected **no speech**
over either full file. This is not manual listening, proof of no music or dubbed
audio, proof of uninterrupted recording, or verification of the physical source.
Sparse frame review also cannot establish soundtrack authenticity. See each
annotation summary for exact packages, parameters, model-file hashes, script hash
and reproduction instructions.

Original SHA-256 values:

- Hillsboro: `6e347076a4acaec6f66f7dc3baddd25131d8af826d2b6d0eec549df9f50ae36f`
- Noisecare: `9c881e33c88e1ea51e53714e90c10ab61978b0822d37fe6063c015f945a52c80`

Both originals were retrieved through ordinary public unauthenticated requests.
No login, paywall, CAPTCHA or access-control bypass was used. Public playback
does not itself grant media redistribution or model-release rights. The
[Hillsboro terms](https://hillsboroherald.com/hillsboro-herald-terms-of-service/)
retain company/licensor ownership. The inspected
[Noisecare terms](https://noisecare.eu/terms-and-conditions/) primarily cover sales
and delivery. No affirmative raw-media redistribution or model-release license
was found for either. Originals, derivatives, frame images, full web pages,
annotation model files and raw annotation outputs remain in ignored `output/`;
none is included here. No outreach was sent.

## Archive and actual integrity validation

The four evidence JSON files below are exact byte copies of the earlier ignored
metadata. Their original local paths are retained as provenance; those paths are
not required to exist in a fresh checkout. No older summary was rewritten.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `hillsboro-context.json` | 3,800 | `f506989bc33dd518611feb1fee10441c3f647135d34ead6b360d682ebdb61f1c` |
| `annotation-summary-hillsboro.json` | 4,449 | `57d04d931b63301a4a3b203a7703840e7b323c5a2cf04f36b7680450918c853e` |
| `noisecare-hotel-context.json` | 6,650 | `e6ec6e537576a864cf174450061c5b890866b456558be70cb1cc39fe707023aa` |
| `annotation-summary-noisecare.json` | 4,503 | `ff9bf7702d0a6d8c1de67c950ce66868616efb667d23861e3aa4578e1c79dfa7` |

`validation.json` records checks actually run on local files: all four archived
JSON documents parsed; every archive/source byte comparison and SHA-256 check
passed. For both summaries, the archived context, ignored original media,
ignored raw annotation and current annotation script also matched the hashes
recorded in the summary. This checks evidence integrity, not acoustic validity.

## Qualification needed before a diagnostic or evaluation

1. Review the original soundtrack and the fixed 0–5 s interval independently of
   model predictions for narration, music, dubbing, cuts, loops, clipping,
   dropouts, handling/wind noise and competing sources. If the interval fails,
   record that result rather than selecting a favorable replacement by score.
2. Establish the claimed site/session and recording context as far as the public
   original evidence allows. Retain unresolved date, device, processing,
   microphone position and equipment-state fields as unknown. The unnamed hotel
   and the Hillsboro timestamp inconsistency need explicit treatment.
3. Adjudicate source contribution without using a model label as truth. The
   Hillsboro publisher's attribution is not an isolated datacenter contribution;
   the hotel case is not a verified pure fan recording. Music or unresolvable
   source ambiguity can require exclusion or an explicitly unknown label.
4. Before any classifier inspection, freeze any admitted diagnostic role,
   preprocessing, immutable model and abstention policy. Keep whole sites,
   providers and collection sessions together; additional crops do not create
   independent observations. Do not reuse inspected diagnostic examples as a
   fresh accuracy test. Prospective source attribution still needs multiple
   independent facilities, matched outdoor controls and stronger source evidence.
5. Resolve permission for the intended use before redistribution or a model
   release. Recording usability, broad sound resemblance, calibrated fidelity
   and facility attribution remain separate claims.
