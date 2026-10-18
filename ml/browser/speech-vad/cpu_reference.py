"""Fixed pinned upstream model; sequential stateful inference, no classifier training."""
import ast,hashlib,json,time
from pathlib import Path
from typing import List
import numpy as np
import onnxruntime as ort
ROOT=Path.cwd();OUT=ROOT/'output/speech-vad-study'
manifest=json.loads((OUT/'inputs16k.json').read_text())
assert json.loads((OUT/'preprocessing-proof.json').read_text())['segmentationCases']==2000
model=OUT/'silero_vad_16k_op15.onnx'
assert hashlib.sha256(model.read_bytes()).hexdigest()=='7ed98ddbad84ccac4cd0aeb3099049280713df825c610a8ed34543318f1b2c49'
tree=ast.parse((OUT/'upstream_utils_vad.py').read_text())
function=next(x for x in tree.body if isinstance(x,ast.FunctionDef) and x.name=='get_speech_timestamps_from_probs')
namespace={'List':List};exec(compile(ast.Module(body=[function],type_ignores=[]),'pinned-upstream-utils','exec'),namespace)
options=ort.SessionOptions();options.intra_op_num_threads=1;options.inter_op_num_threads=1
session=ort.InferenceSession(str(model),sess_options=options,providers=['CPUExecutionProvider'])
rows=[]
for row in manifest['records']:
    pcm=np.frombuffer((OUT/row['file16k']).read_bytes(),dtype='<f4')
    assert hashlib.sha256(pcm.tobytes()).hexdigest()==row['sha25616k']
    state=np.zeros((2,1,128),dtype='float32');context=np.zeros((1,64),dtype='float32');probabilities=[];started=time.perf_counter()
    for offset in range(0,len(pcm),512):
        chunk=pcm[offset:offset+512];chunk=np.pad(chunk,(0,max(0,512-len(chunk))))
        x=np.concatenate([context,chunk.reshape(1,512)],axis=1)
        output,state=session.run(None,{'input':x,'state':state,'sr':np.array(16000,dtype='int64')})
        context=x[:,-64:];probabilities.append(float(output[0,0]))
    intervals=namespace['get_speech_timestamps_from_probs'](probabilities,audio_length_samples=len(pcm),return_seconds=False)
    intervals=[{'start':x['start']/16000,'end':x['end']/16000} for x in intervals]
    rows.append({'id':row['id'],'samples':len(pcm),'probabilities':probabilities,'intervals':intervals,'inferenceMs':(time.perf_counter()-started)*1000})
    print(json.dumps({'id':row['id'],'intervals':intervals}),flush=True)
result={'purpose':'Development feasibility, not independent field accuracy','protocolSha256':manifest['protocolSha256'],'runtime':'onnxruntime'+ort.__version__,'modelSha256':hashlib.sha256(model.read_bytes()).hexdigest(),'records':rows}
(OUT/'cpu-reference.json').write_text(json.dumps(result,indent=2))
