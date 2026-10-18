# Prospective outdoor datacenter recognition pilot

Date: October 18, 2026, America/New_York. This separate task concerns sound recognition. It does not certify microphone fidelity, calibrated SPL, legal compliance or physical source attribution. The existing V3 broad-family head, its original failed strict audit and its later relative comparison remain unchanged. The inspected 416-record comparison cohort is off limits for a fresh training/calibration/test claim.

## Source ledger before model calls

Run the metadata audit before embedding or prediction:

```sh
python -m ml.outdoor_corpus --ledger PATH/ledger.json --output PATH/audit.json
python -m unittest ml.test_outdoor_corpus -q
```

The CLI returns 0 for metadata readiness and 2 for blocked readiness. The report hashes the exact input bytes and records blockers, warnings, effective labels, dependent components and independent-group counts by split. It reads neither audio nor models and makes no network requests. Human assertions in a ledger do not become verified facts merely because their JSON passes. `readyForPilot` permits the next prospective review; `promotionAllowed` is always false. A blocked pool may support a separately frozen development-only diagnostic of the unchanged existing model; it cannot support a fresh training/calibration/test or promotion claim. See [the fixed outdoor diagnostic](OUTDOOR_BASELINE_DIAGNOSTIC.md).

A version-1 ledger contains `schemaVersion: 1`, a `records` array and `historicalExclusions`. Each recording/selected interval has:

| Field | Required information |
| --- | --- |
| `sourceId`, `sourceUrl` | Stable unique recording/interval ID and exact original HTTP(S) page/media URL. |
| `facilityId` | Stable site ID, or null for a control with no datacenter context. An opaque expert case ID is allowed; it is not a new independent facility merely because its filename differs. |
| `collectionGroup`, `sessionGroup` | Stable dependent-production/collection and physical-session identities. Do not use a broad hosting platform as a collection if independent lineage is established. When independence is unknown, share a conservative group. |
| `split` | `unassigned`, `train`, `calibration`, `test` or `excluded`. Freeze active roles before predictions. |
| `domain` | `outdoor`, `indoor`, `mixed` or `unknown`, for the selected audio interval. |
| `claimedLabel` | `verified-source-positive`, `facility-adjacent-uncertain`, `hard-negative` or `excluded`. |
| `controlType` | Null, or `non-datacenter-cooling`, `road-traffic`, `rail-traffic`, `wind`, `transformer`, `insects`, `speech`, `generator`, `industrial-machinery`, `quiet-background`. |
| `history` | `new`, `historical-development`, `inspected-evaluation` or `unknown`. Only new evidence can enter this fresh pilot. |
| `lineage` | `originalSourceId`; `originalSha256`, `derivedSha256`, `pcmSha256` (lowercase SHA256 or null while unresolved); `parentSourceIds` array. Preserve the original and record exact derivation/crop metadata as additional fields. |
| `observation` | `durationSeconds`, `unpaddedDurationSeconds`, `sampleRateHz`, `channels`; use null when not yet measured. The selected interval needs at least five genuine, unpadded seconds. |
| `processing` | `status`: `unprocessed`, `processed` or `unknown`; `details` string; `loopStatus`: `none`, `looped`, `unknown`; `voiceoverStatus` and `musicStatus`: `none`, `present`, `unknown`. These describe the selected interval. |
| `evidence` | Explicit booleans `facilityVerified`, `outdoorVerified`, `naturalAudioVerified`; `sourceContribution`: `verified`, `uncertain`, `not-applicable`, `unknown`; `method`; exact-URL `references` array; nonempty `rationale`. Optional `facilityIdentityPublic: false` records an opaque expert case. |

Positive contribution methods are `paired-source-isolation`, `documented-operational-change`, `independent-acoustic-study` or `operator-confirmation-with-audio`. Other allowed methods are `context-only`, `none`, `unknown`. Review what the referenced evidence actually establishes; an expert's before/after equipment recording may be useful even without a public address. If separate facilities/sessions cannot be established, their records share a collection and cannot inflate independence. Titles, proximity, a nearby map point or model predictions alone are insufficient positive source evidence.

`historicalExclusions` holds arrays `sourceIds`, `facilityIds`, `sessionGroups`, `collectionGroups`, `originalSha256`, `derivedSha256`, `pcmSha256`. Bind the complete old inspected records and exclusions, including the 416-record cohort, rather than asserting an empty history. Hashes are compared across original/derived/PCM roles. Ledger authors must also review transformations and semantic duplicates that hashes cannot discover. Preserve the historical-ledger source and byte hash as extra provenance.

## Roles, controls and preparation

Natural outdoor facility-context audio with uncertain contribution stays uncertain. It cannot be relabeled a verified negative, or promoted to positive from a broad fan hint. Indoor server rooms are separate development/diagnostic material. Loops, artificial repetitions, synthetic ambience, voiceover/music-covered intervals and short padded observations cannot provide eligible original outdoor examples. A longer loop does not provide more natural recording time.

Documented codec transcoding or global gain may be used for a recognition experiment with warnings, preserved originals and an explicit derivation contract; it is not an unprocessed measurement. Unknown production processing blocks eligibility until reviewed for destructive changes. Natural audio, five genuine seconds and source evidence must still be established. Unknown microphone response prevents a fidelity claim, not ordinary sound recognition by itself. Record native and prepared rates, channels, crop times, tool versions and original/derived/PCM hashes. Do not normalize, pad, repeat or select crops according to predictions. Native rates outside the app's supported 44.1/48 kHz require a separate documented preparation contract before encoder use.

Facility, session, dependent collection, original/parent recording, identical source URL and identical content hashes form transitive connected components. A component cannot cross train, calibration and test, even when an excluded derivative supplies the connecting lineage. Variants, edits and eleven crops of one original remain one dependent group. Unknown or opaque site identities need conservative shared groups. Report uploader/device confounding and provenance gaps; this metadata tool cannot infer them from a waveform.

Each role needs eligible positives and real non-datacenter cooling controls. The whole pilot also needs traffic and wind controls; add outdoor generators, substations/transformers, industrial fans, insects, speech and mixtures where relevant. Similar equipment outside datacenters is essential. Keep ambiguous mixtures separate from verified controls. A dataset consisting of compressed datacenter videos versus unrelated studio negatives may learn production artifacts rather than the target sound.

One facility cannot test unseen-facility recognition. Two facilities can support a fixed exploratory training/held-out-site test but not independent threshold calibration. Three facilities can fill train/calibration/test once each; that remains a small site-dependent pilot, not general field validation. Report exact independent facilities, dependent groups and devices alongside clip counts. More crops do not repair a shortage of independent sites.

## Frozen experiment and deployment decision

Before new embeddings or model queries, commit the source/evidence ledger, exclusions, preparation contract, roles, crop-selection rules, fixed candidate configuration, baseline mapping, abstention rule and metrics. This protocol does not authorize arbitrary prompt searches or numeric thresholds selected after viewing test outputs. Choose and freeze any detailed numeric acceptance targets prospectively once the collection design is known; do not rewrite the old V3 criteria.

Reuse the pinned canonical 512-dimensional browser-WASM encoder and its existing preprocessing/parity checks. A separate compact head is the first experiment; a few sites do not justify full encoder fine-tuning. New datacenter labels require a new validator/head format and identity, not edits that weaken V3's fixed five-family-plus-unknown contract. The existing production worker emits an embedding separately, allowing a future qualified head to share the download while retaining V3 family hints.

Use the same newly reserved field inputs for a frozen paired baseline and candidate. V3 has no datacenter class: any mapping of accepted fan/buzz to a compatible proxy must be fixed before queries and reported as a proxy. Record positive recall, accepted precision, hard-negative false accepts, unknown/uncertain abstention, coverage and per-facility/device confusions. Preserve failures and denominators. Do not claim causal correctness on examples whose source contribution is unknown. Report numerical parity separately from recognition outcomes.

Test evidence is consumed once inspected. Learned changes, threshold changes or favorable source selection need another untouched test. A small pilot improvement can support a narrowly described experimental resemblance to documented field recordings; it does not demonstrate general datacenter recognition or confirm which facility produced an arbitrary microphone observation. Keep exact measured limits visible. Only after a justified prospective decision, software checks and browser verification should a new artifact be integrated, pushed on main and deployed to Vercel.
