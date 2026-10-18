# Equipment-noise relevance and competing sounds

The user's target is a recording that represents persistent equipment noise near a data center. A technically complete microphone capture can still record the wrong thing. The app therefore keeps digital recording usability, broad sound identification and equipment-target relevance separate.

After explicit Explore consent, two local checks scan the complete supported 5/15/30-second recording:

1. A pinned Silero speech detector screens short frames and reports approximate possible-speech intervals. It ends and releases its worker before the larger model starts. Its thresholds are upstream defaults, fixed before the development probes; it is not tuned to the outdoor candidate outcomes.
2. The unchanged V3 CLAP encoder and frozen five-family head process consecutive five-second copies. Accepted speech, traffic and wind are possible competing sounds. The head can abstain. Different or unexplained intervals cannot be cleared by another fan-like interval.

Possible speech or another accepted interference family prompts review or retaking. Unfamiliar or mixed sound remains unclear. Only consistent fan-like windows receive cautious relevance guidance, with the explicit warning that HVAC and other machinery can sound similar. No outcome confirms an accurate recording, excludes all interference, or attributes the source to a data center.

Speech is one example, not the definition of interference. Music, birds or other animals, sirens/alarms, impacts, microphone handling, other machinery and overlapping sources can also make the capture unrepresentative. The five-family head does not identify every such event. They can be missed or remain unclassified. Users should review the complete capture and retake if competing sounds obscure the intended equipment noise. The digital Recording check separately handles clipping, missing data, near-silence, processing-setting uncertainty and other supported capture flags.

Both checks must complete before a combined verdict appears. Failure, cancellation or a new observation discards partial target results. No audio is uploaded; only same-origin static model/runtime assets are requested. Fresh transfer is approximately 67 MB because each worker independently retrieves and verifies the shared runtime; the unique model/runtime files total approximately 52 MB. AI results remain excluded from printed/text reports and public map posts.

The [speech-screen feasibility study](../ml/browser/speech-vad/README.md) checks preprocessing parity, interval-policy agreement, repeatability, narrated controls and a software fixture with speech inserted after 20 seconds. These are development/software checks, not a representative field sensitivity estimate. The [outdoor-source audit](DATACENTER_AUDIO_READINESS.md) still does not qualify data-center attribution. The existing V3 head abstained on all four fixed outdoor development candidates; no new data-center classifier has been fitted or promoted.
