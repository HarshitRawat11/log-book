# CLAUDE.md — log-book

v1 of this project was frozen on **2026-09-19**, amended to **v1.1** on **2026-09-20** to add
quality gates as v1 criteria, to **v1.2** on **2026-09-22** to remove the rest timer from
scope, and to **v1.3** on **2026-09-28** to move hosting to Cloudflare Pages. The finish line is written in
[FINISH-LINE.md](FINISH-LINE.md) and that document is the only source of truth for what is in
scope. Read it before acting on any request.

**v1.3 is LOCKED as of 2026-09-28**, tagged `v1.3`. The gap is empty, all six applicable
quality gates pass, and Stage 2 is signed. Earlier tags are left where they are, so every
locked line stays findable.

Hosting is **Cloudflare Pages** — `https://log-book-hr.pages.dev`, deployed with
`wrangler pages deploy dist --project-name=log-book-hr`, config in `public/_headers` and
`public/_redirects`. `_headers` has no line continuation: the CSP must stay on one line or it
silently degrades. Netlify is gone - site deleted and `netlify.toml` removed on 2026-09-28.

**Every request from here is EXTRA** unless it names a criterion written in FINISH-LINE.md.

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
  the three existing functional animations, and `prefers-reduced-motion`. **No scroll reveals
  and no hover states** — the device is a touch phone, and FINISH-LINE.md §1c locks "no
  motion" as the system. Adding animation is EXTRA.

---

## What is still in scope

**Nothing.** The gap in FINISH-LINE.md §5 is empty as of 2026-09-27 and v1 is done.

G2, G4, G5, G6 and the quality-gate defects G7–G11 closed in fix batches F1–F8. **G3**
(offline on the installed PWA) and **G12** (Gate 8, the five-second test) were run by the
owner and passed outright. **G1** (the 30-minute cardio session) was closed by the owner on
partial evidence — a 4:30 run — and §5 records what that did and did not exercise. Do not
re-open it silently; if cue drift over a long session is ever suspected, that note is the
place to start.

Classify every request DEFECT or EXTRA. There is no third bucket and no remaining in-scope
work.

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
