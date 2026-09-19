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

The gap in FINISH-LINE.md §5, and nothing else. As of 2026-09-19 that is **two items, both
needing the phone**:

- **G1** — cardio step 4: a real 30-minute session, cues on time, drift < 2s, survives one
  backgrounding.
- **G3** — offline on the *installed* PWA. The mechanism is proven on desktop; the stated
  configuration is not.

G2, G4, G5 and G6 are closed. When G1 and G3 land, v1 is done and every request is EXTRA.

**Re-checking the 44px rule:** use the browser, not a grep. Enumerate
`button, a, input, select, textarea` in the live DOM and read `getBoundingClientRect()`,
on every route, at 375 and 390, with and without data, and with the picker, reorder, note and
remove-confirm states open. A grep cannot see a control sized by padding, and neither a grep
nor an empty screen can see one that only exists once there is data. That mistake was made
twice; §5 records it.
