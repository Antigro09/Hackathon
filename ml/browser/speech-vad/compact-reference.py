"""Small independent SciPy reference metadata used by portable product unit tests."""
from pathlib import Path
import hashlib,json,sys
sys.path.insert(0,str(Path.cwd()/'output/speech-vad-study/python'))
import numpy as np
from scipy.signal import resample_poly
for rate in [44100,48000]:
    pcm=np.asarray([((i*1103515245+12345)%65536)/65536-.5 for i in range(253)],dtype='float32')
    out=resample_poly(pcm,160 if rate==44100 else 1,441 if rate==44100 else 3)
    print(json.dumps({'rate':rate,'samples':len(out),'sha256':hashlib.sha256(out.tobytes()).hexdigest()}))
