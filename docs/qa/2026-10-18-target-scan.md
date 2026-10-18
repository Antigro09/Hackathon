# Full-capture equipment-target guidance

The optional AI now scans every retained second of supported 5/15/30-second live captures, as consecutive five-second windows. The frozen V3 encoder, trained head, numerical preprocessing and acceptance thresholds are unchanged. This improves temporal coverage; it does not establish data-center recognition accuracy.

The target check prioritizes accepted speech, wind and traffic families as possible interference. Fan-like windows mixed with unexplained or other-family windows remain unclear. Only fan-like agreement throughout receives cautious relevance guidance. Buzz includes insects and never establishes equipment identity. Music, animals, alarms, handling and other competing sounds can go unrecognized; no result confirms an accurate recording or a data-center source.

Each scan snapshots the native-rate PCM without detaching the DSP recording, loads one head and worker, verifies each result's provenance, and scores unique ordered window IDs. No verdict is published until all windows finish. Cancellation, replacement, navigation, partial errors, malformed provenance and stale/duplicate/future IDs cannot publish a partial target verdict. Recording usability is visible beside Explore, with a focusable shortcut to the complete digital check.

Validation before this feature commit: 94 tests across the sound-hints session, pure target assessment, recording check, observation UI and result-verdict suites passed. TypeScript and the production Vite build passed. Tests include all supported durations at both sample rates, late speech, mixed/null coverage, retained-buffer preservation and lifecycle failures. These are software checks, not field measurements or model sensitivity estimates.

A separately qualified short-frame speech detector is being integrated in a subsequent feature. The broad-family scan alone can miss brief, overlapping or boundary-spanning events.
