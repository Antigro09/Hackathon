"""Internal source annotation only. Does not invoke TonalWatch/CLAP classifiers."""
import dataclasses
import hashlib
import importlib.metadata
import json
import pathlib
import subprocess
import sys
import time

from huggingface_hub import snapshot_download
from faster_whisper import WhisperModel
from faster_whisper.audio import decode_audio
from faster_whisper.vad import get_speech_timestamps, VadOptions

BASE = pathlib.Path(__file__).resolve().parent
OUT = BASE / "annotations"
OUT.mkdir(exist_ok=True)
REPO = "Systran/faster-whisper-tiny.en"
REVISION = "0d3d19a32d3338f10357c0889762bd8d64bbdeba"
started = time.time()
local = snapshot_download(REPO, revision=REVISION,
    local_dir=str(BASE / "annotation-model-tiny-en"),
    allow_patterns=["config.json", "model.bin", "tokenizer.json", "vocabulary.*"])
model = WhisperModel(local, device="cpu", compute_type="int8", cpu_threads=4)
packages = {k: importlib.metadata.version(k) for k in
    ["faster-whisper", "ctranslate2", "huggingface-hub", "onnxruntime", "av", "numpy"]}
for item in sys.argv[1:]:
    p = pathlib.Path(item).resolve()
    print("ANNOTATING", p.name, flush=True)
    audio = decode_audio(str(p), sampling_rate=16000)
    vad = get_speech_timestamps(audio, vad_options=VadOptions(
        threshold=0.5, min_speech_duration_ms=250,
        min_silence_duration_ms=500, speech_pad_ms=100), sampling_rate=16000)
    segments, info = model.transcribe(str(p), language="en", beam_size=5,
        condition_on_previous_text=False, word_timestamps=True,
        vad_filter=True, vad_parameters={"min_silence_duration_ms":500})
    data = [dataclasses.asdict(x) for x in segments]
    speech = [{"start":x["start"]/16000,"end":x["end"]/16000} for x in vad]
    gaps = []
    end = 0.0
    for x in speech + [{"start":len(audio)/16000,"end":len(audio)/16000}]:
        if x["start"] - end >= 5:
            gaps.append({"start":end,"end":x["start"],"duration":x["start"]-end})
        end = max(end,x["end"])
    record = {"purpose":"Source speech annotation; not source identity or music verification; no CLAP call",
        "input":str(p),"input_sha256":hashlib.sha256(p.read_bytes()).hexdigest(),
        "decoded_duration":len(audio)/16000,"annotation_model":REPO,"revision":REVISION,
        "packages":packages,"speech_vad":speech,"candidate_gaps_5s":gaps,
        "segments":data,"asr_info":dataclasses.asdict(info),
        "limits":"VAD/ASR can miss speech or hallucinate. A gap is only a candidate for listening and visual/context review, not verified natural source sound."}
    dst=OUT/(p.stem+".json")
    dst.write_text(json.dumps(record,indent=2),encoding="utf8")
    print(json.dumps({"file":p.name,"duration":record["decoded_duration"],
        "segments":len(data),"candidate_gaps_5s":gaps,"annotation":str(dst)}),flush=True)
print("Elapsed seconds",round(time.time()-started,1),flush=True)
