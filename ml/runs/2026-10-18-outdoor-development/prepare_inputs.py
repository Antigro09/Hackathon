import hashlib
import json
from pathlib import Path
import subprocess
import numpy as np
import soundfile as sf

root = Path.cwd()
out = root / 'output/outdoor-development-2026-10-18'
out.mkdir(exist_ok=False)
(out / 'decoded').mkdir()
contexts = json.loads((root / 'output/outdoor-dc-source-research/invc-context.json').read_text())
alternative = json.loads((root / 'output/outdoor-dc-source-research/invc-alternative-negative-context.json').read_text())[0]
contexts = contexts[:3] + [{'name':'invc-university-compressor', 'url':alternative['audio_url'], 'sha256':alternative['sha256'],
    'page':alternative['source_page'], 'label_basis':alternative['context'],
    'digital_first5': {'source_decoded_fs_hz':22050}}]
rows = []
for context in contexts:
    clip_id = context['name']
    original = root / 'output/outdoor-dc-source-research' / f'{clip_id}.mp3'
    if hashlib.sha256(original.read_bytes()).hexdigest() != context['sha256']:
        raise ValueError('Original source hash mismatch')
    prepared = out / 'decoded' / f'{clip_id}.wav'
    command = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', str(original),
               '-t', '5', '-ar', '44100', '-ac', '1', '-c:a', 'pcm_f32le', str(prepared)]
    subprocess.run(command, check=True)
    pcm, rate = sf.read(prepared, dtype='float32', always_2d=True)
    if rate != 44100 or pcm.shape != (220500, 1) or not np.isfinite(pcm).all():
        raise ValueError('Unexpected prepared window')
    peak = float(np.max(np.abs(pcm)))
    rms = float(np.sqrt(np.mean(pcm.astype('float64')**2)))
    if peak >= .98 or rms < 1e-5:
        raise ValueError('Prepared input is blocked; do not modify gain')
    rows.append({'clip_id': clip_id, 'label': 'non-datacenter-cooling-context-candidate' if clip_id == 'invc-university-compressor' else 'provider-documented-outdoor-candidate',
                 'split': 'development-diagnostic', 'uploader': 'INVC-dependent-public-cases',
                 'local_path': prepared.relative_to(out).as_posix(),
                 'sha256': hashlib.sha256(prepared.read_bytes()).hexdigest(),
                 'original_sha256': context['sha256'], 'source_url': context['url'],
                 'context_url': context['page'], 'context': context['label_basis'],
                 'candidate_causal_label_only': True, 'independent_site_unknown': True,
                 'native_rate': context['digital_first5']['source_decoded_fs_hz'],
                 'prepared_rate': rate, 'prepared_peak': peak, 'prepared_rms': rms,
                 'gain_applied': False, 'crop_start_seconds': 0, 'crop_duration_seconds': 5,
                 'unpadded_seconds': 5, 'sample_count': len(pcm),
                 'prepared_pcm_sha256': hashlib.sha256(pcm[:,0].astype('<f4').tobytes()).hexdigest(),
                 'preparation_command': command})
document = {'schema_version': 1, 'purpose': 'Fixed development-only baseline diagnostic; no training or final evaluation',
            'provider_dependency_groups': 1, 'new_classifier_fit_allowed': False,
            'ffmpeg_version': subprocess.check_output(['ffmpeg', '-version'], text=True).splitlines()[0],
            'preparation': 'MP3 decode, first five genuine seconds, Float32 mono, explicit44.1kHz preparation; no gain/padding/repetition',
            'excluded': [{'id':'invc-sports-dry-cooler','reason':'ASR/VAD detected narration in first5s; no continuous5s speech-free interval.'},
                         {'id':'wwmt-dowagiac-original','reason':'News narration/interviews; no confirmed continuous5s natural-audio interval.'},
                         {'id':'invc-atlas','reason':'Only4.212154s, no padding or repetition permitted.'}],
            'records': rows}
(out / 'source-manifest.json').write_text(json.dumps(document, indent=2)+'\n')
print(json.dumps({'prepared': len(rows), 'sourceManifest': str(out / 'source-manifest.json'), 'modelQueries':False}))
