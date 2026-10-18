"""Prepare prospective VAD study inputs and independent upstream/SciPy references. No model inference."""
import ast
import hashlib
import json
import math
from pathlib import Path
import random
import subprocess
import sys

ROOT=Path.cwd()
OUT=ROOT/'output/speech-vad-study'
sys.path.insert(0,str(OUT/'python'))
import numpy as np
from scipy.signal import resample_poly
import scipy

sha=lambda b:hashlib.sha256(b).hexdigest()
records=[]
for name in ['invc-outside-inside','invc-before-after','invc-150m','invc-university-compressor','invc-sports-dry-cooler']:
    path=ROOT/'output/outdoor-dc-source-research'/f'{name}.mp3'
    command=['ffmpeg','-hide_banner','-loglevel','error','-i',str(path),'-ar','44100','-ac','1','-f','f32le','-']
    pcm=np.frombuffer(subprocess.check_output(command),dtype='<f4').copy()
    if len(pcm)>44100*30 or not np.isfinite(pcm).all():raise ValueError('Unbounded source')
    for scope,data in [('full',pcm),('first5',pcm[:220500])]:
        filename=f'{name}-{scope}.f32'
        (OUT/filename).write_bytes(data.tobytes())
        records.append({'id':f'{name}-{scope}','file':filename,'rate':44100,'sampleCount':len(data),'sha256':sha(data.tobytes()),'originalSha256':sha(path.read_bytes()),'processing':'FFmpeg8.1.2 mono44100 decode, no normalization, then browser16k anti-alias FIR','candidateNotGroundTruth':True})
    if name=='invc-sports-dry-cooler':voice=pcm[:int(2.5*44100)]

# Explicitly synthetic coverage fixture: genuine narrated excerpt over a20s low-level sinusoidal lead-in.
t=np.arange(30*44100,dtype=np.float64)/44100
late=(.02*np.sin(2*np.pi*120*t)).astype('float32')
late[20*44100:20*44100+len(voice)]+=voice
for name,data in [('synthetic-late-speech-30s',late),('synthetic-silence-30s',np.zeros(30*44100,dtype='float32'))]:
    filename=name+'.f32';(OUT/filename).write_bytes(data.tobytes())
    records.append({'id':name,'file':filename,'rate':44100,'sampleCount':len(data),'sha256':sha(data.tobytes()),'softwareFixture':True,'fieldEvidence':False,'speechInsertedAtSeconds':20 if name.startswith('synthetic-late') else None})

# Load the pure upstream probability segmentation function directly from pinned source AST.
tree=ast.parse((OUT/'upstream_utils_vad.py').read_text())
function=next(node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name=='get_speech_timestamps_from_probs')
namespace={'List':list}
exec(compile(ast.Module(body=[function],type_ignores=[]),'pinned-upstream-utils','exec'),namespace)
reference=namespace['get_speech_timestamps_from_probs']
rng=random.Random(18042026)
cases=[]
for index in range(2000):
    sample_count=rng.randint(1,480000)
    frames=math.ceil(sample_count/512)
    probabilities=[]
    while len(probabilities)<frames:
        probabilities += [rng.choice([0,.1,.34,.35,.49,.5,.8,.99,1])]*rng.randint(1,30)
    probabilities=probabilities[:frames]
    intervals=reference(probabilities,audio_length_samples=sample_count,return_seconds=False)
    cases.append({'samples':sample_count,'probabilities':probabilities,'intervals':[{'start':x['start']/16000,'end':x['end']/16000} for x in intervals]})
(OUT/'upstream-segmentation-fixtures.json').write_text(json.dumps(cases,separators=(',',':')))

resampling=[]
for rate in [44100,48000]:
    for kind in ['impulse','random','high-frequency']:
        n=rate*2+37
        if kind=='impulse':data=np.zeros(n,dtype='float32');data[0]=1;data[n//2]=.5;data[-1]=-.5
        elif kind=='random':data=np.random.default_rng(1804+rate).uniform(-.5,.5,n).astype('float32')
        else:data=np.sin(2*np.pi*12000*np.arange(n)/rate).astype('float32')*.5
        expected=resample_poly(data,16000//math.gcd(rate,16000),rate//math.gcd(rate,16000))
        filename=f'resample-{rate}-{kind}'
        (OUT/(filename+'.input.f32')).write_bytes(data.tobytes());(OUT/(filename+'.expected.f32')).write_bytes(expected.tobytes())
        resampling.append({'id':filename,'rate':rate,'kind':kind,'input':filename+'.input.f32','expected':filename+'.expected.f32','expectedSha256':sha(expected.tobytes()),'source':'SciPy'+scipy.__version__+' resample_poly Float32 defaultKaiserbeta5'})
manifest={'schemaVersion':1,'protocolSha256':sha((ROOT/'ml/browser/speech-vad/protocol.json').read_bytes()),'createdBeforeModelInference':True,'records':records,'resamplingReferences':resampling,'segmentationReferences':2000,'upstreamUtilsSha256':sha((OUT/'upstream_utils_vad.py').read_bytes()),'packages':{'numpy':np.__version__,'scipy':scipy.__version__}}
(OUT/'inputs.json').write_text(json.dumps(manifest,indent=2))
print(json.dumps({'preparedRecords':len(records),'segmentationReferences':len(cases),'resamplingReferences':len(resampling),'modelQueries':False}))
