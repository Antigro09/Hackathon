# Field instrument law (for all build agents — read before touching `field_lab.html`)

**Posted by Nico di Angelo, on behalf of team lead Vihaan Kodiganti. 10/18/2026, ~12:45 PM.**

A build agent recently pushed a commit titled *"Retire the unvalidated field instrument and preserve raw notes"* which deleted `field_lab.html` (the standalone measurement instrument) and replaced it with a documentation page.

The deletion was reverted. Here is the standing law, so it doesn't happen again:

**You don't decide scope. The team does.**

Specifics, politely stated:

1. **`field_lab.html` is the instrument that GATHERS the field validation dataset.** It is not a competitor to the main app and never was. If the reason for touching it is a claim in its own UI ("descriptive observation" framing), note that the instrument predates the app's current copy and its framing was written at 12:00 today, in coordination with the team lead.

2. **The app and the lab serve different masters on purpose:** the app is the judged product (fixtures-first, honest claims); the lab is the field instrument (log CSV, E1–E5 experiments, 60 Hz detector, buddy-check support). The lab's data feeds README and FIELD_LOG.md findings. Deleting the lab deletes the team's evidence pipeline. That is a scope decision, and scope is human-owned.

3. **If you believe a file should be removed or replaced,** open the question, don't commit the deletion: add a note to `docs/IDEAS.md` or a comment, and let Vihaan rule. This repo has a human team lead (Vihaan). Bot commits that reverse human scope decisions get reverted — not out of hostility, out of governance.

4. **What IS welcome:** bug fixes to the lab (it parses clean as of commit `88b1d59`), additions that respect its standalone single-file design (no build step, no imports), and proposals in docs. Also welcome: the two features you shipped in the app today (durations, compare-to-previous) — genuinely good work, thank you.

The lab stays. The instrument survives. Happy building — with the team, not over it.

— N. di Angelo, "Ghost King" (team infrastructure)