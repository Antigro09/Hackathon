# Full-capture equipment-target guidance

The optional AI now scans every retained second of supported 5/15/30-second live captures, as consecutive five-second windows. The frozen V3 encoder, trained head, numerical preprocessing and acceptance thresholds are unchanged. This improves temporal coverage; it does not establish data-center recognition accuracy.

The target check prioritizes accepted speech, wind and traffic families as possible interference. Fan-like windows mixed with unexplained or other-family windows remain unclear. Only fan-like agreement throughout receives cautious relevance guidance. Buzz includes insects and never establishes equipment identity. Music, animals, alarms, handling and other competing sounds can go unrecognized; no result confirms an accurate recording or a data-center source.

Each scan snapshots the native-rate PCM without detaching the DSP recording, loads one head and worker, verifies each result's provenance, and scores unique ordered window IDs. No verdict is published until all windows finish. Cancellation, replacement, navigation, partial errors, malformed provenance and stale/duplicate/future IDs cannot publish a partial target verdict. Recording usability is visible beside Explore, with a focusable shortcut to the complete digital check.

Validation before this feature commit: 94 tests across the sound-hints session, pure target assessment, recording check, observation UI and result-verdict suites passed. TypeScript and the production Vite build passed. Tests include all supported durations at both sample rates, late speech, mixed/null coverage, retained-buffer preservation and lifecycle failures. These are software checks, not field measurements or model sensitivity estimates.

A separately qualified short-frame speech detector is being integrated in a subsequent feature. The broad-family scan alone can miss brief, overlapping or boundary-spanning events.

## Mounted 30-second browser check and retention fix

The first mounted 30-second check caught an integration mismatch: App still used the legacy first-five-second retention helper. The new panel correctly blocked that incomplete input instead of silently claiming a full scan. App now copies the complete native recording before transferring the independent DSP buffer. A fresh generated 63 Hz / 48 kHz virtual-microphone capture then completed all six unique five-second requests (240,000 samples each) and displayed all six intervals. The model abstained throughout, so the target stayed unclear. One AI worker was active, the retained standard result remained available, all requests were same-origin GETs without request bodies, and there were no page errors. The Recording check shortcut focused its destination without changing the route; Clear unloaded the model.

Incoming UI commit `a904320` was merged while preserving its removed Home pill and context-form placement above results. Its reintroduced unqualified health/measurement and blanket no-upload copy was corrected, and the observation heading again describes noise near a facility rather than established source attribution. The generated-input browser result verifies application wiring only, not acoustic or field accuracy.
