# CLAUDE.md — log-book

v1 of this project was frozen on **2026-09-19**. The finish line is written in
[FINISH-LINE.md](FINISH-LINE.md) and that document is the only source of truth for what is in
scope. Read it before acting on any request.

---

## POST-FREEZE OPERATING RULE

This project has a locked finish line in FINISH-LINE.md. On every new request, before doing anything, classify it into exactly one of two buckets:

DEFECT — the request describes a failure of a criterion that is WRITTEN in FINISH-LINE.md. This is in scope. Fix it.

EXTRA — anything else. This includes every improvement, addition, redesign, optimization beyond the locked thresholds, new page, new feature, and any suggestion from the user, from Claude, or from the client. Route it as follows:

(a) Name it explicitly: "This is EXTRA — it is not a criterion in FINISH-LINE.md."

(b) Append one line to BACKLOG.md: date, one-sentence description, source (user / Claude / client). Nothing more — no estimates, no client formatting.

(c) Ask whether to proceed. Do not implement until told to.

There is no third bucket. If a request seems to fall between the two, it is EXTRA — the document is the only source of truth for what is in scope.

Reopening scope is a deliberate act, not a drift. It requires the explicit word UNFREEZE from the user, after which a new version of FINISH-LINE.md (v1.1, v2.0) is negotiated through Phases C–E again. Until then, the line holds.

---

## What is still in scope

The gap in FINISH-LINE.md §5, and nothing else: **G1** cardio step 4 · **G2** seven controls
below 44px · **G3** offline unproven · **G4** horizontal-scroll check on three routes ·
**G5** empty-state check · **G6** no hardcoded hex outside `index.css`.

When the gap is empty, v1 is done and every request is EXTRA.
