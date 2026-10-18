# Legacy website software qualification

Two fixed synthetic inputs only; no final/development recordings, model weights
or audio bytes are stored here. This is software qualification before the frozen
paired cohort comparison, not recognition or field evidence.

The actual unchanged public website worker completed two results, zero errors.
Raw top-two rankings/status/gate/preprocessing/timing remain in
`baseline-results.json`; both results are uncertain. The original 44.1/48 kHz
metadata and unchanged PCM hashes were preserved. Model load took 3.685 seconds;
inferences took 1.111 and 0.439 seconds, with model reuse on the second request.

`browser-evidence-raw.txt` is the raw CLI response; `browser-evidence.json` is its
lossless parsed JSON. `browser-requests.txt` includes static requests; the console
has zero warnings/errors. All remote model/runtime requests are allowlisted GETs
answered by 307 redirects to the hash-verified loopback snapshots; no audio is
uploaded. `requests.ndjson` is the server log captured after this qualification.

The previous two attempts to serialize the 161 MB graph through Playwright's
response-body bridge interrupted its browser before any result. They remain in
ignored scratch output and were not accuracy trials. The successful source
snapshots use direct Chromium streaming of the same pinned graph bytes.

Source snapshots and `checksums.json` bind this evidence. Its contract pins the
public combined graph, tokenizer, transformer and asyncify runtime; it does not
substitute the candidate's audio-only graph or standard WASM runtime. No candidate
head, fresh cohort classifier call or reliability decision occurred in this run.
