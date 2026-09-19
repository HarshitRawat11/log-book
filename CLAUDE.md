# CLAUDE.md — log-book

v1 of this project was frozen on **2026-09-19** and amended to **v1.1** on **2026-09-20** to
add quality gates as v1 criteria. The finish line is written in
[FINISH-LINE.md](FINISH-LINE.md) and that document is the only source of truth for what is in
scope. Read it before acting on any request.

It is **awaiting re-LOCK**: no LOCK until [QUALITY-GATES.md](QUALITY-GATES.md) shows Stage 2
PASSED. The `v1.0` tag has not been moved.

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

## QUALITY GATES

This project has approved quality gates in QUALITY-GATES.md and an intent brief in INTENT-BRIEF.md. The gates are v1 criteria of FINISH-LINE.md. A failing gate is a DEFECT and its fix is in scope. Any proposed visual change must name the gate it serves; a change that serves no gate is EXTRA under FINISH-LINE.md's rule. A change that would cause any gate to fail is refused unless the gate is waived in writing. The imagery policy, motion minimum, and accessibility floor in QUALITY-GATES.md are standing rules for this repository.

**Two notes specific to this repo, because the gates were adapted in Phase B:**

- The **imagery policy** resolves to *no content imagery*. Gate 5 is waived; `<img>` appears
  nowhere in `src/`. Adding images is EXTRA.
- The **motion minimum** is the adapted Gate 6, not the generic one: focus states, bounds on
  the four existing functional animations, and `prefers-reduced-motion`. **No scroll reveals
  and no hover states** — the device is a touch phone, and FINISH-LINE.md §1c locks "no
  motion" as the system. Adding animation is EXTRA.

---

## What is still in scope

The gap in FINISH-LINE.md §5, and nothing else. As of 2026-09-19 that is **two items, both
needing the phone**:

- **G1** — cardio step 4: a real 30-minute session, cues on time, drift < 2s, survives one
  backgrounding.
- **G3** — offline on the *installed* PWA. The mechanism is proven on desktop; the stated
  configuration is not.

G2, G4, G5 and G6 are closed. So are the quality-gate defects **G7–G11** — fix batches F1–F8
landed on 2026-09-20 and **Stage 1 passed**. Gates 2, 3, 6, 7 and 10 pass.

**G12 is the one quality item left:** Gate 8, the five-second test. Its protocol is run by the
owner, not by Claude, so it cannot be closed from here.

When G1, G3 and G12 land, v1 is done and every request is EXTRA.

**Three things the gates now pin down, so a future change does not undo them by accident:**

- **Type is six steps**, declared once in the `@theme` block in `index.css`, each with exactly
  one line-height. Do not add a `text-[Npx]` or a `leading-*` utility; change the block.
- **Three radii only** — `rounded-lg` controls, `rounded-2xl` containers, `rounded-full` pills.
- **One filled accent action per screen.** A second one breaks Gate 3b; removing the only one
  breaks it too.

**Re-checking the 44px rule:** use the browser, not a grep. Enumerate
`button, a, input, select, textarea` in the live DOM and read `getBoundingClientRect()`,
on every route, at 375 and 390, with and without data, and with the picker, reorder, note and
remove-confirm states open. A grep cannot see a control sized by padding, and neither a grep
nor an empty screen can see one that only exists once there is data. That mistake was made
twice; §5 records it.
