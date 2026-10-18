import sys,json,hashlib,collections,io
from pathlib import Path
sys.path.insert(0,'output/ml-python')
import numpy as np
import soundfile as sf
from ml.bsd import _freeze,_json_bytes
from ml.data import _quality
ROOT=Path('output/v3-preflight');names=['bsd-final-audit','tobee','fsd-speech'];source_paths=[ROOT/n/'manifest.json'for n in names]
source=[json.loads(p.read_text(encoding='utf-8'))for p in source_paths];records=sum([m['records']for m in source],[])
old=sum([json.loads(Path(p).read_text(encoding='utf-8'))['records']for p in ['ml/runs/2026-10-18/manifest.json','ml/runs/2026-10-18-v2/manifest-v2.json']],[])
old_groups={r['uploader_group'].casefold()for r in old};old_ids={str(r['clip_id'])for r in old};old_hashes={r[k]for r in old for k in['sha256','original_sha256','pcm_sha256']}
assert not old_groups&{r['uploader_group'].casefold()for r in records}
assert not old_ids&{str(r['clip_id'])for r in records}
assert len({r['clip_id']for r in records})==len(records)
assert not old_hashes&{r[k]for r in records for k in['sha256','original_sha256','pcm_sha256']}
seen=set();original_verified=0
for r in records:
 fingerprints={r[k]for k in['sha256','original_sha256','pcm_sha256']};assert not fingerprints&seen;seen|=fingerprints
 raw=Path(r['local_path']).read_bytes();assert hashlib.sha256(raw).hexdigest()==r['sha256']
 pcm,rate=sf.read(io.BytesIO(raw),dtype='float32',always_2d=True);assert rate==48000 and pcm.shape==(240000,1)
 assert hashlib.sha256(pcm[:,0].astype('<f4').tobytes()).hexdigest()==r['pcm_sha256'];assert _quality(pcm[:,0])[1]is None
 if r['dataset']=='BSD35k-CS':orig=ROOT/'bsd-final-audit/original'/(r['clip_id']+'.wav')
 elif r['dataset']=='ToBee':orig=ROOT/'tobee/original'/(r['clip_id']+Path(r['source_filename']).suffix.lower())
 else:orig=ROOT/'fsd-speech/cache/original/eval'/(r['clip_id']+'.wav')
 digest=hashlib.sha256()
 with orig.open('rb')as f:
  while block:=f.read(1024*1024):digest.update(block)
 assert digest.hexdigest()==r['original_sha256'];original_verified+=1
counts=dict(collections.Counter(r['label']for r in records));groups={label:len({r['uploader_group']for r in records if r['label']==label})for label in counts}
for label in['buzz','mechanical_fan','speech','traffic','wind']:assert counts[label]>=20 and groups[label]>=3
assert counts['unknown']>=100 and groups['unknown']>=10
manifests=[{'path':str(p.resolve()),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}for p in source_paths]
combined={'formatVersion':1,'purpose':'v3-final-data-preflight-only-no-model-scores','seed':18043,'source_manifests':manifests,'counts':counts,'groups_per_label':groups,'originals_rehashed':original_verified,'previous_exposed_rows':len(old),'previous_unique_ids':len(old_ids),'previous_unique_groups':len(old_groups),'no_previous_group_id_or_cross_representation_hash_overlap':True,'unique_within_final_ids_and_cross_representation_hashes':True,'quality':'allfinite/RMS>=1e-5/peak<0.999, five seconds mono48000 float32; no gain/padding','label_limitations':'BSD labels are creator metadata screened for explicit primary family/source; no independent audio adjudication. ToBee is insect buzz, no electrical-hum/source-identity proof. Source/hive dependencies remain. These counts establish data availability, not model accuracy.','records':records}
_freeze(ROOT/'final-data.json',combined)
# Reserve all source candidates, including every superseded metadata plan and
# quality rejection. Hash all cached representations, not just retained clips.
plan_paths=[ROOT/n/'selection-plan.json'for n in['bsd','bsd-final','bsd-reviewed','bsd-final-audit','tobee','fsd','fsd-speech']]
plans=[json.loads(p.read_text(encoding='utf-8'))for p in plan_paths]
reserved_groups=set();reserved_ids=set()
for p in plans:
 reserved_groups.update(p.get('reserved_uploaders',[]));reserved_groups.update(r['uploader_group']for r in p['records']);reserved_ids.update(str(r['clip_id'])for r in p['records'])
for token in['ToBee:NU-Hive','ToBee:OSBH-citizen-science']:reserved_groups.update([token,token.casefold()])
original_hashes=set();prepared_hashes=set();pcm_hashes=set()
for n in['bsd','bsd-final','bsd-reviewed','bsd-final-audit','tobee','fsd','fsd-speech']:
 d=ROOT/n
 originals=list((d/'original').glob('*'))if(d/'original').exists()else list((d/'cache/original').rglob('*.wav'))
 for p in originals:
  if not p.is_file()or p.suffix.lower()not in['.wav','.mp3']:continue
  h=hashlib.sha256()
  with p.open('rb')as f:
   while block:=f.read(1024*1024):h.update(block)
  original_hashes.add(h.hexdigest())
 for p in(d/'audio').glob('*.wav'):
  raw=p.read_bytes();prepared_hashes.add(hashlib.sha256(raw).hexdigest());pcm,fs=sf.read(io.BytesIO(raw),dtype='float32');assert fs==48000 and pcm.shape==(240000,);pcm_hashes.add(hashlib.sha256(pcm.astype('<f4').tobytes()).hexdigest())
reservation={'formatVersion':1,'seed':18043,'purpose':'v3-final-reservations','groups':sorted(reserved_groups),'clip_ids':sorted(reserved_ids),'original_sha256':sorted(original_hashes),'prepared_sha256':sorted(prepared_hashes),'pcm_sha256':sorted(pcm_hashes),'source_manifests':manifests+[{'path':str(p.resolve()),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}for p in plan_paths],'note':'Entire selected uploader/hive groups reserved before model fitting; all superseded plans/failed metadata or quality candidates remain reserved. Entire ToBee collection stays final-only; its collection tokens include exact and casefold aliases, not additional independent groups. Includes all cached inspected representations, even discarded metadata candidates. No classifier/encoder/model score used in selection or preflight. BSD collection label is platform information; it is not an independent uploader group.'}
_freeze(ROOT/'final-reservations.json',reservation)
audit={'counts':counts,'groups_per_label':groups,'final_records':len(records),'old_records':len(old),'source_manifests':manifests,'reservation_sha256':hashlib.sha256((ROOT/'final-reservations.json').read_bytes()).hexdigest(),'combined_manifest_sha256':hashlib.sha256((ROOT/'final-data.json').read_bytes()).hexdigest(),'reservation_counts':{k:len(reservation[k])for k in['groups','clip_ids','original_sha256','prepared_sha256','pcm_sha256']}}
_freeze(ROOT/'preflight-audit.json',audit);print(json.dumps(audit,indent=2),flush=True)
