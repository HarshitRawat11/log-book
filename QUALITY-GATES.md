# QUALITY-GATES.md — v6 · GATE 3 TIGHTENED TO THE FOLD

> **QUALITY STATUS: PROVISIONAL.** Stage 1 (self-review) passed 2026-09-20 and was re-run in
> full on **2026-09-25** after the history fix and the rest-timer removal. Awaiting Stage 2.
> Thresholds approved and final. Fixes **F1–F8 applied and verified**, and the one item Stage 1
> carried as `UNVERIFIED` is now measured. **No claim in this document rests on reasoning
> alone.**
> Intent is in [INTENT-BRIEF.md](INTENT-BRIEF.md). These gates are v1 criteria of
> [FINISH-LINE.md](FINISH-LINE.md), amended to **v1.1** under **UNFREEZE FOR QUALITY**
> (granted 2026-09-20). The document is **not re-LOCKed** — that waits for Stage 2.

**Scope:** Gates 2, 3, 6 (adapted), 7, 8 and 10 apply. Gates 1, 4 and 5 are **waived** with
reasons. Gate 9 is **not applicable** (personal project).

---

## SCORECARD

**5 passing · 0 failing · 1 awaiting Stage 2 · 3 waived · 1 N/A**

| Gate | Status | Measured | Evidence |
|---|---|---|---|
| 2 Visual system coherence | **PASS** ✔ was FAIL | **6** type steps, **one** line-height each, **3** radii, 0 off-palette colours, 1 font family | `review/style-audit.json` |
| 3 Hierarchy | **PASS** ✔ was FAIL | **8 of 8** routes; greyscale weights 850–7,589 (were 37–174 on four of them); h1 **5.2px** at 20% | `review/gate3-hierarchy.json`, `review/squint-*.png` |
| 6 Motion (adapted) | **PASS** ✔ was FAIL | all 5; reduced-motion honoured under emulation, zero `width` animations | `review/verify-f1-f4.json` |
| 7 Typography craft | **PASS** ✔ was FAIL | 6.04:1 min contrast, 74-char measure, 8 of 8 primary elements ≥16px, every body size at **1.5** leading, 0 orphans | `review/craft-audit.json` |
| 10 Accessibility floor | **PASS** | 6.04:1 min contrast, zero failures; **108 of 108 tab stops show the focus ring**; no images; 0.5 Hz max | `review/craft-audit.json`, `review/focus-audit.json` |
| 8 Five-second test | **NOT MEASURED** | Stage 2 by construction — its protocol is run by the reviewer, not by Claude Code | — |
| 1 Intent · 4 Distinctiveness · 5 Imagery | **WAIVED** | not passed — see Waivers | — |
| 9 Behavioural metrics | **N/A** | personal project | — |

**Re-measured 2026-09-25**, against the build that removed the rest timer: 6 type steps with
one line-height each · 3 radii · 6.04:1 minimum contrast, 0 failures · 8 of 8 routes with a
prominent primary action · 108 tab stops, 0 missing a focus ring · 0 controls under 44px ·
0 horizontal overflow · 0 heading orphans · 0 console errors · `tsc` clean · 174 tests.

Tab stops fell 110 → 108: the two rest-length steppers in Settings are gone.

## How everything was measured

All figures come from the **production bundle** served by `vite preview`, built in sandbox
mode so no fake token could reach live Supabase, driven by headless Chrome over CDP with no
added dependency.

| Evidence | File |
|---|---|
| 30 screenshots, 10 routes × 375 / 768 / 1280 | `review/*-{375,768,1280}.png` |
| Colour, type, spacing, radius per route | `review/style-audit.json` |
| Contrast, type craft, motion | `review/craft-audit.json` |
| Squint / greyscale / thumbnail | `review/gate3-hierarchy.json`, `review/squint-*.png` |
| Keyboard tab order and focus rings | `review/focus-audit.json` |

Routes measured: `/train` `/history` `/exercises` `/food` `/foods` `/cardio` `/progress`
`/settings`, plus `/signin` and `/history/:id` for screenshots.

---

## Gate 2 — Visual System Coherence · **PASS** (fixed by F5, F6 and F7, 2026-09-20)

| # | Check | Threshold | Current | Status |
|---|---|---|---|---|
| 2a | Every rendered colour maps to a token | 0 off-palette values | **0 off-palette.** 5 text colours, 11 backgrounds, 3 border colours across 10 routes | **PASS** |
| 2b | Palette cap | semantic ≤ 10; the 7 chart series and 11 cardio tokens exempt | 10 semantic, 7 series, 11 cardio | **PASS** |
| 2c | Typeface families | ≤ 2 | **1** — the system stack. Zero webfonts | **PASS** |
| 2d | Type-scale steps | **≤ 6** | **6** — 12, 14, 16, 18, 20, 26px. Declared in one `@theme` block; `text-[11px]`, `text-3xl` and the 11px chart tick are gone | **PASS** |
| 2e | One line-height per step | every size has exactly 1 | **every step has exactly 1.** Structural: leading is declared per step in `@theme` and no `leading-*` utility survives outside `/cardio/session` | **PASS** |
| 2f | Spacing from a scale | all on the Tailwind scale | 9 padding, 8 gap values, all on scale | **PASS** |
| 2g | Radius values | **≤ 3 distinct** | **3**: 8px controls, 16px containers, full pills. The stray 4px and the 12px tier are gone | **PASS** |

The 2b cap is deliberately not the prompt's "1 primary, 1 accent, 2–3 neutrals": a tool with
charts needs seven separable series by definition, and the cardio screen is a documented
exception recorded beside its tokens in `index.css`.

## Gate 3 — Hierarchy · **PASS** (fixed by F7 and F8, 2026-09-20)

**Method.** SQUINT: `filter: blur(8px)` (≈2% of a 375px viewport) on the live page, captured,
then a 12 × 26 grid scored by mean luminance deviation from the modal background; the top
cell's centre mapped back with `elementFromPoint`. GREYSCALE: interactive elements ranked by
`|luminance − page background| × area`. THUMBNAIL: largest rendered text × 0.2.

| Route | Squint dominant | Greyscale #1 | Weight | Was |
|---|---|---|---|---|
| `/train` | **Log set** | **Log set** | 5,982 | 5,982 |
| `/exercises` | **+ New exercise** | **+ New exercise** | 6,640 | 6,640 |
| `/foods` | **+ New recipe** | **+ New recipe** | 6,640 | 6,640 |
| `/cardio` | config summary | **Start session** | 7,589 | 7,589 |
| `/food` | **+ Add** | **+ Add** | 5,260 | 37 |
| `/settings` | **Sync now** | **Sync now** | 5,692 | 89 |
| `/history` | **+ Log a session…** | **+ Log a session…** | 5,692 | 174 |
| `/progress` | **+ Log** | **+ Log** | 850 | 59 |

| # | Check | Threshold | Current | Status |
|---|---|---|---|---|
| 3a | One dominant element per view, and it is the intended focal point. **"View" means the first viewport at 390×844 — not the whole scrollable document** | 8 of 8 routes | **8 of 8** | **PASS** |
| 3b | Hierarchy survives greyscale: the primary action is the most prominent interactive element, **and is reachable without scrolling** | 8 of 8 | **8 of 8**, weights 850–7,589 | **PASS** |
| 3c | Screen title identifiable at 20% (the app-switcher case) | ≥ 5px | **5.2px** — the h1 step is 26px | **PASS** |

**One cause, one fix.** The four failing routes had no filled control at all — every action
was bordered or ghost. Each was given exactly one filled accent action and the weights moved
by two orders of magnitude.

`/food` was the awkward one, and the reservation raised before F8 still shaped the answer: it
has four "+ Add" buttons, and filling all four would be four dominant elements, which is no
hierarchy and exactly the *busy* the intent brief rules out. Only the meal slot the clock
says you are in is filled. Getting that guess wrong costs nothing — the other three are still
there, one tap away, unchanged.

**Method limitation, recorded not hidden:** the dominance ratio came out at exactly 1.00 on
three routes because a wide filled button spans several grid cells with identical weight, so
"second place" is often the same element. The greyscale ranking is the reliable signal; the
ratio is indicative only and is not used as a threshold.

**Method corrected 2026-09-25.** The greyscale ranking used to skip elements below the fold.
That filter is not in the criterion — 3b says "the most prominent interactive element", not
"above the fold" — and it made the result depend on the clock. Re-running at 16:00 put `/food`
back at weight 37 because the one filled Add had moved to the dinner slot, 15px below an
844px viewport. The filter is gone and the ranking now covers the whole page, which is what
the criterion asks. The first post-F8 measurement passed partly by luck: it ran just after
midnight, when the filled slot was breakfast and therefore near the top.

**Resolved 2026-09-25, by the owner.** The question above — does "per view" mean the visible
screen or the whole document? — was genuinely open, and the owner answered it: the add button
belongs above the fold. 3a and 3b now say so explicitly, which makes them **stricter** than
before, and `/food` was changed to meet them.

The fix is one filled `+ Add to <meal>` placed after the 7-day average and before the meal
sections. It does not follow the clock down the page; only its label does. Measured bottom at
**500px**, which clears both a 390×844 phone and a 375×667 one. Tapping it opens that meal's
form and scrolls to it — armed on that tap only, so a meal's own Add does not yank the page —
and the button hides while a form is open, so there are never two add surfaces.

The four per-slot Add buttons went back to plain borders, leaving exactly one filled action on
the screen, which is what 3b wants.

## Gate 6 — Motion, **ADAPTED** · **PASS** (fixed by F1 and F2, 2026-09-20)

No scroll reveals and no hover states are required: the target device is a touch phone where
hover does not exist, and FINISH-LINE.md §1c locks "no motion" as the system.

**Full inventory — 3 animations, all functional, none decorative.** The rest bar was a
fourth until 2026-09-22, when the rest timer was removed from scope under UNFREEZE:

| Element | Trigger | Duration / easing | Property |
|---|---|---|---|
| Sync dot `animate-pulse` | while flushing | 2s `cubic-bezier`, infinite | opacity |
| Hold-to-end fill | press and hold | 2000ms `linear` | **transform** (was width — F2) |
| Reorder row | drag | ~150ms Tailwind default | transform |

| # | Check | Threshold | Current | Status |
|---|---|---|---|---|
| 6a | Every interactive element has a visible focus state | all | **108 of 108 tab stops** across 9 routes show the ring — `2px solid rgb(78, 163, 255)`, one style everywhere ([index.css:145](src/index.css:145)) | **PASS** |
| 6b | No decorative motion added | 0 new animations | 0 at rest across all 8 tabbed routes | **PASS** |
| 6c | `prefers-reduced-motion` respected | all stop or resolve instantly | **PASS** — under emulated `reduce`: transitions 1e-05s, `animate-pulse` iteration count **1** (was infinite). With no preference it returns to 2s infinite, so the rule discriminates | **PASS** |
| 6d | No layout shift from motion | CLS ≤ 0.1 | **0, 0, 0.0003** | **PASS** |
| 6e | Animations use transform/opacity only | all | **PASS** — a DOM sweep finds **zero** elements with a `width` transition | **PASS** |

**The one documented exception (F1).** `.motion-hold-progress` keeps its 2000ms transition
under `reduce`, verified at 2s while everything around it drops to 1e-05s. That bar *is* the
two-second press: stilling it would fill it instantly while the press still had two seconds
to run — the one place where honouring the preference would make the interface lie.

**Settled 2026-09-20 — was `UNVERIFIED`.** Fields carrying Tailwind's `outline-none` sit
beside the global focus rule, and source order said the ring should win. It does, and it is
now measured rather than reasoned: the real tab order was walked on all nine routes with
dispatched `Tab` key events — not `.focus()`, which does not engage `:focus-visible` — giving
**110 tab stops, 11 of them carrying `outline-none`, and zero with no visible ring.** Exactly
one ring style appears anywhere: `2px solid rgb(78, 163, 255)`.

The earlier note said "three inputs". That was wrong: `outline-none` appears at **16** sites
across inputs, selects and textareas. The figure was taken from memory rather than a grep.

Scope of the walk: the tab order reachable from a fresh load of each route. It does not cover
transient states such as the exercise picker or reorder mode, which are opened by activating a
control rather than by tabbing.

## Gate 7 — Typography Craft · **PASS** (7c, 7d, 7e fixed 2026-09-20)

| # | Check | Threshold | Current | Status |
|---|---|---|---|---|
| 7a | Text contrast | ≥ 4.5:1; large ≥ 3:1 | **6.04:1 minimum across 239 text nodes**, 8 routes, at 375 and 1280. Zero failures | **PASS** |
| 7b | Body measure | 60–80 characters | **74** at 1280px; the column is `max-w-lg` so measure is bounded by construction | **PASS** |
| 7c-i | **Primary content ≥ 16px** | all primary elements | **8 of 8 pass** after F4 — see below | **PASS** |
| 7c-ii | Everything else ≥ 11px | absolute floor | minimum rendered is **11px** | **PASS** (ratchet) |
| 7d | Body line-height | 1.5–1.7 | **every body step is 1.5** — 12, 14, 16 and 18px. Set once in `@theme`, so it cannot drift per element | **PASS** |
| 7e | No orphaned words on headings | none, or consistent by intent | **0 orphans** across 8 routes at 375px, measured per-word with `Range` line-box grouping | **PASS** |

### 7c — the narrow definition

**Primary content is:** every leaf text node inside the **open exercise card** on `/train` and
`/history/:id` that **contains a digit**, plus the card's exercise-name heading.

Chosen because that card is the mid-set reading surface the whole app is designed around, and
because "contains a digit" is mechanical — a script can check it with `/\d/`, and a person can
check it by eye in under a minute. It deliberately excludes field labels, set-type chips and
secondary controls, which are read once and then known.

Everything outside that definition is governed by 7c-ii's 11px floor, which is set at today's
minimum: its job is to stop drift, not to demand work.

| Primary element | Before | After F4 | |
|---|---|---|---|
| Previous-session line — "10/10/9 @ 60 kg" | 12px | **16px** | PASS |
| Set index — "1", "2" | 12px | **16px** | PASS |
| Progression suggestion — "→ 60 kg × 10" | 14px | **16px** | PASS |
| Exercise name — "Barbell Row" | 16px | 16px | PASS |
| Logged set row — "62.5 kg × 8" | 16px | 16px | PASS |
| Weight input · Reps input | 20px | 20px | PASS |

The three that failed were exactly the values you read *between* sets rather than type: what
you did last time, which set you are on, and what to do next.

The set-index column also went `w-5` → `w-6`: at 16px two tabular digits need 20px and the
old column was exactly that, leaving nothing for the arrow a continuation set gets.

## Gate 8 — Five-Second Test · **NOT MEASURED**

Adapted per the Intent Brief: run against the owner, not three strangers — the app has one
user and no visitors, so a stranger's reading of it is not evidence about anything.

**Protocol for Stage 2, run by you.** Open `/train` cold, mid-session, and within five seconds
without scrolling confirm you can see: **which exercise you are on**, **what you did last
time**, and **the weight/reps inputs with Log set**. PASS if all three. Record answers here.

## Gate 10 — Accessibility Floor · **PASS** (provisional) · not adjustable

| # | Check | Threshold | Current | Status |
|---|---|---|---|---|
| 10a | WCAG AA contrast | 4.5:1 / 3:1 | **6.04:1 minimum, zero failures** | **PASS** |
| 10b | Visible focus indicators | all focusable | **108 of 108 tab stops**, including all 11 that carry `outline-none` | **PASS** |
| 10c | Keyboard-navigable | all interactive | the tab order walked end to end on all 9 routes — **108 stops**, every one reachable by `Tab` alone | **PASS** ✔ was PARTIAL |
| 10d | Alt text on every image | all | **No images exist.** No `<img>` in `src/`; 5 inline tab glyphs and 1 chevron, all beside text labels | **PASS** |
| 10e | No motion flashing > 3 Hz | none | Fastest is `animate-pulse`, 2s cycle = **0.5 Hz** | **PASS** |
| 10f | Touch targets ≥ 44 × 44px | all | Criterion **O10** in FINISH-LINE.md, met 2026-09-19. Referenced, not restated | **PASS** |

---

## Waivers

A waived gate is **not** a passed gate.

| Gate | Reason (Phase B, 2026-09-19) |
|---|---|
| **1 Intent alignment** | No hero, no fold, no visitor. Every screen is a working surface for one signed-in user. The useful part — the primary action being findable — survives inside Gate 3. |
| **4 Distinctiveness** | No logo to cover, no brand to be mistaken for, no competitor to be distant from. One user, who wrote the brief. |
| **5 Imagery** | No content imagery by design; `<img>` appears nowhere in `src/`. Adding AI imagery to a gym logger serves no stated intent. |
| **9 Behavioural metrics** | Not applicable. Personal project, no analytics, none wanted. |

---

## STAGE 1 — Claude Code self-review · **PASSED 2026-09-20**

Every gate re-run from scratch against the production bundle after the final fix batch.

| Gate | Status | Evidence |
|---|---|---|
| 2 Visual system coherence | **PASS** | `review/style-audit.json` |
| 3 Hierarchy | **PASS** | `review/gate3-hierarchy.json`, `review/squint-*.png` |
| 6 Motion (adapted) | **PASS** | `review/verify-f1-f4.json` |
| 7 Typography craft | **PASS** | `review/craft-audit.json` |
| 10 Accessibility floor | **PASS** | `review/craft-audit.json`, `review/focus-audit.json` |
| 1, 4, 5 | **WAIVED** | reasons recorded under Waivers |
| 8 Five-second test | **NOT MEASURED** | Stage 2 by construction — see below |
| 9 Behavioural metrics | **N/A** | personal project |

**Gate 8 cannot pass at Stage 1.** Its own protocol says it is run by the reviewer, not by
Claude Code. It is not an outstanding defect; it is the first item of Stage 2.

### Anti-adjective statements

Required by Gate 1's method, retained although Gate 1 is waived, because the Intent Brief
names the element most at risk for each.

**Cluttered — the Train exercise card.** It does not evoke it: exactly one card in a session
is open at a time and the rest collapse to a header plus their logged sets, and inside the
open card every one of the eight elements carrying a number is a value you read or act on,
with nothing decorative to remove.

**Busy — `/progress`, 251 elements.** It does not evoke it: the count is dominated by SVG
nodes inside four charts, not by controls — the screen carries **8** interactive elements in
total, arranged as four stacked cards that each answer exactly one question, with one filled
action and the next-heaviest control an order of magnitude lighter.

**Decorative — the cardio full-screen colour.** It does not evoke it: the orange/navy pair is
measured rather than chosen, holding 4.31:1 separation at its worst under protanopia; the
word WORK or REST is always on screen so identity is never carried by colour alone; and the
numeral is sized in viewport units to be read at three metres. Nothing on that screen is
there to look pleasant.

### What Stage 2 needs from you

1. **Run Gate 8.** Open `/train` cold, mid-session. Within five seconds, without scrolling,
   can you see which exercise you are on, what you did last time, and the weight/reps inputs
   with Log set?
2. Look over the three-viewport screenshots in `review/`.
3. Reply **PASS**, or list what fails. On PASS, FINISH-LINE.md is re-LOCKed at v1.1 and the
   tag moved.

## Changelog

**v6 — 2026-09-25 — Gate 3 tightened to the fold, and `/food` changed to meet it.** The
ambiguity flagged in v5 is resolved the strict way at the owner's direction: "per view" means
the first viewport, and the primary action must be reachable without scrolling. `/food` now
carries one filled `+ Add to <meal>` at a fixed position, bottom at 500px, above the fold on
both a 390×844 and a 375×667 phone.

Worth stating plainly: this **edits two written criteria**. It makes them stricter, in the
direction the owner just specified, so I did not ask for UNFREEZE. If that reading is wrong it
is one revert.

All five gates re-measured after the change and still pass: 6 type steps, no duplicate
line-heights, 6.04:1 contrast with 0 failures, 8 of 8 routes, 0 controls under 44px, 0
overflow, 0 orphans. Screenshots refreshed again.


**v5 — 2026-09-25 — re-verified after v1.2.** Every gate re-run against the build that
removed the rest timer and fixed the history line. All five still pass; `review/` screenshots
refreshed, because they had been showing a rest bar and a wrong history line for three days.

Two things found while re-running, both recorded in Gate 3 above rather than smoothed over:
the greyscale ranking had a below-the-fold filter that is not in the criterion and made the
result depend on the time of day, and — underneath that — `/food`'s one filled action drops
below the fold at dinner and snack. The filter is fixed. The design question is the owner's.


**v4 — 2026-09-20 — the last unverified item settled.** The focus ring on fields carrying
`outline-none` was reasoned from CSS source order at Stage 1 but never proved. It is proved
now: 110 tab stops walked with dispatched key events across 9 routes, 11 of them on
`outline-none` fields, **zero missing a ring**. Gate 10c moves **PARTIAL → PASS** as a side
effect, because walking the order end to end is exactly what that criterion asked for. The old
note's "three inputs" figure was wrong — the utility appears at 16 sites — and the correction
is recorded rather than quietly overwritten.


**v3 — 2026-09-20 — FIX BATCH 2, STAGE 1 PASSED.** F5–F8 applied:

- **F5** the type scale is six steps with one line-height each, declared in a single `@theme`
  block. `text-[11px]` (3 sites), `text-3xl` on `/signin` and `/cardio/review`, the 11px
  Recharts tick, and every `leading-relaxed` / `-snug` / `-tight` / `-none` outside
  `/cardio/session` are gone. **2d, 2e and 7d FAIL → PASS.**
- **F6** radii collapsed from 5 values to **3** — 8px controls, 16px containers, full pills.
  **2g FAIL → PASS. Gate 2 now passes.**
- **F7** folded into F5: the 2xl step is 26px, not 24, so the h1 reads **5.2px** at 20%
  against a 5px floor. **3c FAIL → PASS.**
- **F8** one filled accent action on each of the four flat screens — `/history` backfill,
  `/settings` Sync now, `/progress` + Log, and on `/food` only the meal slot the clock says
  you are in. **3a and 3b FAIL → PASS. Gate 3 now passes.**
- Stage 1 re-ran every gate and passed. Only Gate 8 is outstanding, and it is Stage 2 by
  construction.


**v2 — 2026-09-20 — FIX BATCH 1.** F1–F4 applied under UNFREEZE FOR QUALITY:

- **F1** `prefers-reduced-motion` honoured ([index.css](src/index.css)), with one documented
  exception for the hold-to-end bar. **6c FAIL → PASS.**
- **F2** the rest bar and hold-to-end fill animate `transform: scaleX()` instead of `width`
  ([RestBar.tsx](src/training/RestBar.tsx), [CardioSession.tsx](src/routes/CardioSession.tsx)).
  **6e FAIL → PASS. Gate 6 now passes entirely.**
- **F3** heading orphans measured: **0** across 8 routes. **7e NOT MEASURED → PASS.**
- **F4** three primary card elements raised to 16px
  ([ExerciseCard.tsx](src/training/ExerciseCard.tsx)). **7c-i FAIL → PASS.**
- Gates 2 and 7d **re-measured** after the batch rather than assumed unchanged — still 7 type
  sizes, still 3 sizes with two line-heights.
- Regression: 0 controls under 44px and 0 overflow across 8 routes × 375 and 390px.

**v1 — 2026-09-20 — GATES APPROVED.** From v0:

- **7c narrowed on the owner's instruction.** Was a blanket "body ≥ 16px on mobile", which
  failed **188 of 239 text nodes (79%)**. Now scoped to primary content inside the open
  exercise card, defined mechanically as *contains a digit, plus the exercise name*, which
  fails **3 of 7**. A second floor, 7c-ii, holds everything else at 11px as a ratchet.
- All `PROPOSED` markers removed; thresholds are final.
- Scorecard added with per-gate measured values and evidence paths.
- Dominance ratio demoted to indicative and explicitly **not** used as a threshold, because
  the method cannot separate two cells of the same wide element.

**v0 — 2026-09-19.** First measurement of every applicable gate.
