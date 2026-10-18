# Completed experimental run

This directory stores the public-data Colab run's attribution manifest, portable frozen-encoder classifier head, complete evaluation, and environment. Raw audio and encoder weights are not included. The head is experimental and retains `promotionAllowed: false`; it is not used by the live app.

Read [results and material limitations](../../../docs/AI_EXPERIMENT_RESULTS.md), especially the 42% known coverage and almost complete speech rejection. The saved plot was rerendered from `evaluation.json` to move its legend outside the data.

The exact manifest SHA-256 is `1c5f7a8ba2f5d38c661073deeadc5253a5e4c70ce8d2143a975a69a392731549`. Git attributes preserve recorded artifact bytes without newline conversion. Clip-level original URLs and CC0/CC BY attribution remain in the manifest. Linux `/content/` paths describe the completed runtime; reproduce the source downloads using `ml/data.py`, rather than expecting those paths on a new machine.
