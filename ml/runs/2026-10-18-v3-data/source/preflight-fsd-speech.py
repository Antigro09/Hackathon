import sys,json,collections
from pathlib import Path
sys.path.insert(0,'output/ml-python')
from ml.data import load_source_metadata,permitted_license,LABELS,_diverse_order,_download_pool,_sha256
from ml.bsd import _freeze
root=Path('output/v3-preflight/fsd-speech');root.mkdir(parents=True,exist_ok=True)
old=sum([json.loads(Path(p).read_text(encoding='utf-8'))['records']for p in ['ml/runs/2026-10-18/manifest.json','ml/runs/2026-10-18-v2/manifest-v2.json']],[])
groups={r['uploader_group'].casefold()for r in old};ids={r['clip_id']for r in old};hashes={r[k]for r in old for k in['sha256','original_sha256','pcm_sha256']}
source,_=load_source_metadata('output/tonalwatch-training-data')
pool=[{**r,'label':'speech','split':'test','dataset':'FSD50K'}for r in source['eval']if set(r['original_labels'])&set(LABELS)=={'Speech'}and permitted_license(r['license'])and r['uploader_group']and r['uploader_group'].casefold()not in groups and r['clip_id']not in ids]
selected=_diverse_order(pool,18043)[:100]
plan={'seed':18043,'cap':100,'reason':'Metadata-only expansion of existing first20 fresh official-eval speech candidates after BSD creator audit excluded synthesized/processed/uncertain speech; before any model predictions. No scores used.','reserved_uploaders':sorted({r['uploader_group']for r in selected}),'records':selected}
_freeze(root/'selection-plan.json',plan)
# Reuse the already verified first20 preflight originals without any re-selection.
import os
for p in Path('output/v3-preflight/fsd/cache/original/eval').glob('*.wav'):
 q=root/'cache/original/eval'/p.name;q.parent.mkdir(parents=True,exist_ok=True)
 if not q.exists():os.link(p,q)
exclusions=collections.Counter();records=_download_pool(selected,root,exclusions,4)
passing=[r for r in records if not{r[k]for k in['sha256','original_sha256','pcm_sha256']}&hashes]
manifest={'source':'FSD50K fresh official evaluation speech only','selection_plan_sha256':_sha256((root/'selection-plan.json').read_bytes()),'reserved_uploaders':plan['reserved_uploaders'],'count':len(passing),'groups':len({r['uploader_group']for r in passing}),'exclusion_counts':dict(exclusions),'records':passing}
_freeze(root/'manifest.json',manifest);print(json.dumps({k:v for k,v in manifest.items()if k!='records'},indent=2),flush=True)
