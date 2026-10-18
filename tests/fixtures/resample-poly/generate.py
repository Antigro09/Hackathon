"""Regenerate independent references with scipy==1.15.3, numpy==2.2.6.

Run from the repository root: python tests/fixtures/resample-poly/generate.py
No JavaScript implementation is imported or used to calculate the references.
"""
from pathlib import Path
import hashlib
import json
import sys

ROOT = Path(__file__).resolve().parents[3]
if (ROOT / 'output/ml-python').exists():
    sys.path.insert(0, str(ROOT / 'output/ml-python'))
import numpy as np
import scipy
from scipy.signal import resample_poly

if scipy.__version__ != '1.15.3' or np.__version__ != '2.2.6':
    raise RuntimeError('References require scipy==1.15.3 and numpy==2.2.6')

indices = set(range(64)) | set(range(240000 - 64, 240000)) | set(range(95936, 96128))
state = 804
for _ in range(128):
    state = (1664525 * state + 1013904223) & 0xffffffff
    indices.add(state % 240000)
indices = sorted(indices)
cases = []
for fs in (16000, 32000, 44100, 48000, 96000):
    for kind in ('tone63', 'tone1000', 'noise', 'edgeImpulses'):
        source = np.zeros(fs * 5, dtype=np.float32)
        if kind.startswith('tone'):
            hz = int(kind[4:])
            source = (0.125 * np.sin(2 * np.pi * hz * np.arange(fs * 5) / fs)).astype(np.float32)
        elif kind == 'noise':
            state = 0x08042026
            for index in range(len(source)):
                state ^= (state << 13) & 0xffffffff
                state ^= state >> 17
                state ^= (state << 5) & 0xffffffff
                state &= 0xffffffff
                source[index] = (state / 4294967296 - 0.5) * 0.25
        else:
            source[[0, 1, fs * 2 + 17, len(source) - 2, len(source) - 1]] = [0.75, -0.5, 0.375, -0.25, 0.625]
        result = resample_poly(source, 48000, fs)
        assert result.shape == (240000,) and result.dtype == np.float32
        cases.append({'sampleRateHz': fs, 'kind': kind,
                      'sourceSha256': hashlib.sha256(source.astype('<f4').tobytes()).hexdigest(),
                      'values': [float(result[index]) for index in indices]})
reference = {'generator': 'scipy.signal.resample_poly(Float32 source, 48000, actual_rate), all defaults',
             'scipyVersion': scipy.__version__, 'numpyVersion': np.__version__,
             'window': ['kaiser', 5.0], 'padtype': 'constant', 'cval': 0,
             'durationSeconds': 5, 'outputSamples': 240000,
             'indices': indices, 'cases': cases}
(Path(__file__).resolve().parent / 'reference.json').write_text(json.dumps(reference, indent=2) + '\n', encoding='utf-8')
print(f'Wrote {len(cases)} independent references, {len(indices)} checks each')
