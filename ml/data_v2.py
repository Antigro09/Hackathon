"""Expanded development data and a new, explicitly separated evaluation cohort."""
from __future__ import annotations

from collections import Counter
import hashlib
import json
from pathlib import Path

from ml.data import (
    LABELS, MIRROR_REPO, MIRROR_REVISION, ORIGINAL_RECORD, _diverse_order,
    _download_pool, _rank, assert_disjoint, load_source_metadata, permitted_license,
)

SEED = 18042
UNKNOWN_CATEGORIES = {
    'ood_val': {'Rain', 'Water', 'Walk_and_footsteps', 'Dog', 'Engine', 'Singing'},
    'ood_test': {'Music', 'Bird', 'Bell', 'Door', 'Computer_keyboard', 'Glass', 'Tools'},
}
HASH_FIELDS = ('sha256', 'original_sha256', 'pcm_sha256')


def fresh_test_record(record: dict, previous_records: list[dict]) -> bool:
    """A new clip from an old uploader is not a fresh independent test source."""
    groups = {r['uploader_group'] for r in previous_records}
    ids = {r['clip_id'] for r in previous_records}
    old_hashes = {r[field] for r in previous_records for field in HASH_FIELDS if r.get(field)}
    return (record['uploader_group'] not in groups and record['clip_id'] not in ids
            and not any(record.get(field) in old_hashes for field in HASH_FIELDS))


def development_split(record: dict, previous_records: list[dict], seed: int = SEED) -> str:
    owners = {r['uploader_group']: r['split'] for r in previous_records
              if r['split'] in {'train', 'val'}}
    prior = owners.get(record['uploader_group'])
    if prior:
        return prior
    # Deterministic whole-uploader split, independent of audio/model scores.
    return 'val' if int(_rank(seed, record['uploader_group'])[:8], 16) % 5 == 0 else 'train'


def assert_mixed_disjoint(records: list[dict]) -> None:
    assert_disjoint([record for record in records if record.get('dataset') == 'FSD50K'])
    for field in ('clip_id', 'uploader_group', *HASH_FIELDS):
        owners: dict[str, str] = {}
        for record in records:
            value = record.get(field)
            if not value:
                raise ValueError(f'Missing grouping value: {field}')
            if owners.setdefault(value, record['split']) != record['split']:
                raise ValueError(f'Cross-split {field} leakage')


def prepare_dataset_v2(
    previous_manifest: str | Path,
    output_dir: str | Path,
    *,
    cache_root: str | Path | None = None,
    extra_records: list[dict] | None = None,
    seed: int = SEED,
    max_train_per_class: int = 500,
    max_val_per_class: int = 80,
    max_test_per_class: int = 40,
    max_unknown_per_split: int = 160,
    workers: int = 6,
) -> Path:
    """Keep old calibration assignments; exclude every old source from new test.

    All max_* arguments cap FSD selection only. Supplemental limits are fixed
    in V2_PROTOCOL.md and in the separately recorded source manifest.
    ``extra_records`` supplies separately attributed MIMII fan/unknown-machine
    and IVBEE honeybee buzz recordings. FSD50K's eligible fan/buzz evaluation
    population was exhausted by run1, so old test recordings are never recycled.
    """
    previous_path = Path(previous_manifest)
    if min(max_train_per_class, max_val_per_class, max_test_per_class, max_unknown_per_split, workers) < 1:
        raise ValueError('Download caps and workers must be positive')
    previous_bytes = previous_path.read_bytes()
    previous = json.loads(previous_bytes)
    old = previous['records']
    root = Path(output_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    cache = Path(cache_root).resolve() if cache_root else root / 'data'
    source, metadata = load_source_metadata(cache)
    exclusions = Counter()
    old_groups = {r['uploader_group'] for r in old}
    old_unknown_groups = {r['uploader_group'] for r in old if r['split'] == 'ood_val'}
    pools = []
    for original, rows in source.items():
        eligible: dict[str, list[dict]] = {label: [] for label in LABELS.values()}
        for row in rows:
            hits = set(row['original_labels']) & set(LABELS)
            if len(hits) != 1 or not row['uploader_group'] or not permitted_license(row['license']):
                continue
            label = LABELS[next(iter(hits))]
            if original == 'eval' and (row['uploader_group'] in old_groups or label == 'mechanical_fan'):
                exclusions['old_test_source_or_exhausted_fan_pool'] += 1
                continue
            if original == 'dev' and row['uploader_group'] in old_unknown_groups:
                exclusions['previous_unknown_calibration_uploader'] += 1
                continue
            split = 'test' if original == 'eval' else development_split(row, old, seed)
            eligible[label].append({**row, 'label': label, 'split': split, 'dataset': 'FSD50K'})
        # A metadata-only, uploader-diverse cap is fixed before looking at scores.
        cap = 2 * (max_train_per_class + max_val_per_class) if original == 'dev' else 4 * max_test_per_class
        for rows_for_label in eligible.values():
            pools.extend(_diverse_order(rows_for_label, seed)[:cap])
    prepared = _download_pool(pools, cache, exclusions, workers)
    selected: list[dict] = []
    hashes: set[str] = set()
    caps = {'train': max_train_per_class, 'val': max_val_per_class, 'test': max_test_per_class}
    for split, cap in caps.items():
        for label in LABELS.values():
            values = _diverse_order([r for r in prepared if r['split'] == split and r['label'] == label], seed)
            for record in values:
                values_hashes = {record[field] for field in HASH_FIELDS}
                if values_hashes & hashes:
                    exclusions['duplicate_audio'] += 1
                    continue
                if split == 'test' and not fresh_test_record(record, old):
                    exclusions['previously_exposed_test_audio'] += 1
                    continue
                selected.append(record)
                hashes.update(values_hashes)
                if sum(r['split'] == split and r['label'] == label for r in selected) >= cap:
                    break
    reserved_groups = {r['uploader_group'] for r in selected}
    for split, original in [('ood_val', 'dev'), ('ood_test', 'eval')]:
        own = UNKNOWN_CATEGORIES[split]
        other = UNKNOWN_CATEGORIES['ood_test' if split == 'ood_val' else 'ood_val']
        candidates = []
        for row in source[original]:
            tags = set(row['original_labels'])
            if (not tags & own or tags & (set(LABELS) | other)
                    or not row['uploader_group'] or row['uploader_group'] in reserved_groups
                    or not permitted_license(row['license'])):
                continue
            if split == 'ood_test' and row['uploader_group'] in old_groups:
                continue
            candidates.append({**row, 'split': split, 'label': 'unknown', 'dataset': 'FSD50K',
                               'ood_categories': sorted(tags & own)})
        values = _download_pool(_diverse_order(candidates, seed)[:4 * max_unknown_per_split], cache, exclusions, workers)
        count = 0
        for record in _diverse_order(values, seed):
            values_hashes = {record[field] for field in HASH_FIELDS}
            if values_hashes & hashes or (split == 'ood_test' and not fresh_test_record(record, old)):
                exclusions['duplicate_or_previously_exposed_unknown'] += 1
                continue
            selected.append(record)
            hashes.update(values_hashes)
            count += 1
            if count >= max_unknown_per_split:
                break
        reserved_groups.update(r['uploader_group'] for r in selected)
    for supplied in extra_records or []:
        record = dict(supplied)
        values_hashes = {record[field] for field in HASH_FIELDS}
        if values_hashes & hashes:
            raise ValueError('Supplemental audio duplicates another selected recording')
        if record['split'] in {'test', 'ood_test'} and not fresh_test_record(record, old):
            raise ValueError('Supplemental test contains an already exposed source')
        selected.append(record)
        hashes.update(values_hashes)
    assert_mixed_disjoint(selected)
    counts = {split: dict(Counter(r['label'] for r in selected if r['split'] == split))
              for split in ('train', 'val', 'test', 'ood_val', 'ood_test')}
    failures = []
    for split, minimum in [('train', 12), ('val', 4), ('test', 3)]:
        for label in LABELS.values():
            if counts[split].get(label, 0) < minimum:
                failures.append(f'{split}/{label}: {counts[split].get(label, 0)} < {minimum}')
    for split in ('ood_val', 'ood_test'):
        if counts[split].get('unknown', 0) < 40:
            failures.append(f'{split}: fewer than40 unknown recordings')
    manifest = {
        'schema_version': 2, 'seed': seed,
        'previous_manifest_sha256': hashlib.sha256(previous_bytes).hexdigest(),
        'source': {'original_record': ORIGINAL_RECORD, 'metadata_archives': metadata,
                   'mirror_repo': MIRROR_REPO, 'mirror_revision': MIRROR_REVISION},
        'preprocessing': previous['preprocessing'],
        'selection_caps': {
            'FSD50K': {'train_per_class': max_train_per_class, 'val_per_class': max_val_per_class,
                       'test_per_class': max_test_per_class, 'unknown_per_split': max_unknown_per_split},
            'supplemental_record_counts': dict(Counter(r['split'] for r in extra_records or [])),
            'supplemental_counts_by_dataset': {
                dataset: dict(Counter(r['split'] for r in extra_records or [] if r['dataset'] == dataset))
                for dataset in sorted({r['dataset'] for r in extra_records or []})},
        },
        'records': sorted(selected, key=lambda r: (r['split'], r['label'], r['clip_id'])),
        'summary': {'counts': counts, 'exclusions': dict(exclusions),
                    'counts_by_dataset': {
                        dataset: dict(Counter(r['split'] for r in selected if r['dataset'] == dataset))
                        for dataset in sorted({r['dataset'] for r in selected})},
                    'uploaders_or_machine_groups': {split: len({r['uploader_group'] for r in selected if r['split'] == split}) for split in counts}},
        'validation_passed': not failures, 'validation_failures': failures,
        'limitations': previous['limitations'] + [
            'Original known-validation uploaders remain reused development calibration material.',
            'New test excludes every run1 uploader, identifier and exact audio hash.',
            'Scarce fresh FSD categories and supplemental machine-domain data limit generalization.',
            'Supplemental machine groups are not Freesound uploaders or an official FSD evaluation split.',
            'IVBEE buzz is a held-out honeybee laboratory collection; specimens share recording hardware/conditions and do not validate electrical hum.',
        ],
    }
    path = root / 'manifest-v2.json'
    path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding='utf-8')
    print(json.dumps(manifest['summary'], indent=2), flush=True)
    if failures:
        raise ValueError(f'Insufficient eligible data: {failures}; see {path}')
    return path
