"""Stage exact five-second float PCM for the local-only canonical WASM runner.

No model inference, label selection, splitting, gain change, or resampling.
Input manifest records need local_path, sha256, clip_id, label, split, uploader.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
import soundfile as sf


def prepare(manifest_path: str | Path, output_dir: str | Path, audio_root: str | Path | None = None) -> Path:
    source = Path(manifest_path)
    manifest_bytes = source.read_bytes()
    manifest = json.loads(manifest_bytes)
    records = manifest.get('records')
    if not isinstance(records, list) or not records:
        raise ValueError('Manifest requires nonempty records')
    out = Path(output_dir).resolve()
    (out / 'pcm').mkdir(parents=True, exist_ok=True)
    rows = []
    ids = set()
    for row, record in enumerate(records):
        for key in ('clip_id', 'label', 'split', 'uploader', 'local_path', 'sha256'):
            if not isinstance(record.get(key), str) or not record[key]:
                raise ValueError(f'Missing {key} at row {row}')
        if record['clip_id'] in ids:
            raise ValueError('Duplicate clip ID')
        ids.add(record['clip_id'])
        audio_path = Path(record['local_path'])
        if audio_root is not None:
            audio_path = Path(audio_root) / audio_path.name
        elif not audio_path.is_absolute():
            audio_path = source.parent / audio_path
        actual_sha = hashlib.sha256(audio_path.read_bytes()).hexdigest()
        if actual_sha != record['sha256']:
            raise ValueError(f'Source SHA mismatch for {record["clip_id"]}')
        pcm, rate = sf.read(audio_path, dtype='float32', always_2d=True, frames=48000 * 5)
        if rate not in (44100, 48000) or len(pcm) < rate * 5:
            raise ValueError('Expected at least five seconds at 44100/48000 Hz')
        pcm = np.ascontiguousarray(pcm[:rate * 5, 0], dtype='<f4')
        if not np.isfinite(pcm).all() or np.max(np.abs(pcm)) >= .999 or np.sqrt(np.mean(pcm.astype(np.float64)**2)) < 1e-5:
            raise ValueError(f'Ineligible PCM for {record["clip_id"]}')
        pcm_bytes = pcm.tobytes()
        digest = hashlib.sha256(pcm_bytes).hexdigest()
        destination = out / 'pcm' / f'{row:06d}-{digest}.f32'
        destination.write_bytes(pcm_bytes)
        rows.append({key: record[key] for key in ('clip_id', 'label', 'split', 'uploader')} | {
            'row': row, 'source_sha256': actual_sha, 'pcm_sha256': digest,
            'pcm_path': destination.relative_to(out).as_posix(), 'sample_rate': rate, 'sample_count': len(pcm),
            'source_record': record,
        })
    staged = {'schemaVersion': 1, 'sourceManifestSha256': hashlib.sha256(manifest_bytes).hexdigest(),
              'preparation': 'soundfile Float32 first channel, first five seconds, no resampling or gain', 'records': rows}
    destination = out / 'manifest.json'
    destination.write_text(json.dumps(staged, indent=2), encoding='utf-8')
    return destination


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--audio-root')
    args = parser.parse_args()
    print(prepare(args.manifest, args.output, args.audio_root))
