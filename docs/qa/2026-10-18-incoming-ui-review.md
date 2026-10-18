# Incoming UI review and corrections

Reviewed immutable range `31ae9ee..bb1609c` after fetching the three new main
commits. Preserved the new hero illustration, layout and approachable direction.

Corrected concrete regressions:

- `App.tsx` referenced removed `setMapReadings` in Clear session, preventing the
  TypeScript production build. Clear session now resets its existing local
  observation state; public community observations remain a separate workflow.
- The new verdict labeled the C−A low-frequency screen as tonality. Actual DSP
  fixtures demonstrate that a 1 kHz tone can have no low-frequency indication,
  while broadband bass can exceed the C−A threshold without a sustained peak.
  The verdict now explicitly describes low-frequency contribution and leaves the
  peak indicator separate. Three actual-engine regression cases cover both
  examples and silence.
- Learn no longer equates C-weighting with bodily effects, wall transmission,
  source identity or legal evaluation. Its uncalibrated-level explanation is
  visible before the optional technical details.
- The capture instruction list was nested inside an h3. It is now a sibling
  card with a short heading. Repeated captures are comparisons, not an
  implemented median/aggregation procedure; moving farther away is not promised
  to improve every recording.
- Home describes documenting an uncalibrated recording and reviewed public map
  metadata, without an unsupported health-causality statement or a blanket
  no-upload claim. Data-center proximity remains context, not source proof.

The whole in-progress application passed 534 tests in 29 files and strict
TypeScript/Vite build after these changes and the adjacent recording-status UI.
No DSP thresholds, model weights, numerical scoring or community schema changed.
Final browser/deployment checks are recorded with the subsequent target-check
release rather than treating these unit/build checks as physical audio evidence.
