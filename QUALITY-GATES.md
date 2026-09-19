# QUALITY-GATES.md — v2 · FIX BATCH 1 APPLIED

> **QUALITY STATUS: IN PROGRESS.** Thresholds are approved and final (2026-09-20).
> Fixes **F1–F4 applied and verified** 2026-09-20. Stage 1 has not run.
> Intent is in [INTENT-BRIEF.md](INTENT-BRIEF.md). These gates are v1 criteria of
> [FINISH-LINE.md](FINISH-LINE.md), amended to **v1.1** under **UNFREEZE FOR QUALITY**
> (granted 2026-09-20). The document is **not re-LOCKed** — that waits for Stage 2.

**Scope:** Gates 2, 3, 6 (adapted), 7, 8 and 10 apply. Gates 1, 4 and 5 are **waived** with
reasons. Gate 9 is **not applicable** (personal project).

---

## SCORECARD

**2 passing · 3 failing · 1 not measurable yet · 3 waived · 1 N/A**

| Gate | Status | Measured | Evidence |
|---|---|---|---|
| **6 Motion (adapted)** | **PASS** ✔ was FAIL | all 5 sub-criteria; reduced-motion honoured under emulation, zero `width` animations remain | `review/verify-f1-f4.json` |
| 10 Accessibility floor | **PASS** (provisional) | 6.04:1 minimum contrast, zero failures; focus ring confirmed; no images; 0.5 Hz max | `review/craft-audit.json` |
| 2 Visual system coherence | **FAIL** | 4 of 7 pass; 7 type sizes (cap 6), 3 sizes carry 2 line-heights, 5 radii (cap 3) — unchanged, re-measured after F1–F4 | `review/style-audit.json` |
| 3 Hierarchy | **FAIL** | 4 of 8 routes have a dominant element that is the primary action; h1 reads 4.8px at 20% | `review/gate3-hierarchy.json`, `review/squint-*.png` |
| 7 Typography craft | **FAIL** — **7d only** | contrast, measure, primary size and orphans all pass; 3 body sizes remain below 1.5 line-height | `review/verify-f1-f4.json` |
| 8 Five-second test | **NOT MEASURED** | Stage 2, run by the owner | — |
| 1 Intent · 4 Distinctiveness · 5 Imagery | **WAIVED** | not passed — see Waivers | — |
| 9 Behavioural metrics | **N/A** | personal project | — |

**Regression check after F1–F4**, 8 routes × 375 and 390px: **0 controls under 44px, 0
horizontal overflow**, contrast unchanged at 6.04:1 minimum, `tsc` clean, 168 tests passing.

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

Routes measured: `/train` `/history` `/exercises` `/food` `/foods` `/cardio` `/progress`
`/settings`, plus `/signin` and `/history/:id` for screenshots.

---

## Gate 2 — Visual System Coherence · **FAIL**

| # | Check | Threshold | Current | Status |
|---|---|---|---|---|
| 2a | Every rendered colour maps to a token | 0 off-palette values | **0 off-palette.** 5 text colours, 11 backgrounds, 3 border colours across 10 routes | **PASS** |
| 2b | Palette cap | semantic ≤ 10; the 7 chart series and 11 cardio tokens exempt | 10 semantic, 7 series, 11 cardio | **PASS** |
| 2c | Typeface families | ≤ 2 | **1** — the system stack. Zero webfonts | **PASS** |
| 2d | Type-scale steps | **≤ 6** | **7** on the tabbed routes (11, 12, 14, 16, 18, 20, 24px); 8 with `/signin`'s 30px | **FAIL** |
| 2e | One line-height per step | every size has exactly 1 | **3 of 7 have 2**: 11px → 1.25/1.5 · 12px → 1.33/1.63 · 14px → 1.43/1.63 | **FAIL** |
| 2f | Spacing from a scale | all on the Tailwind scale | 9 padding, 8 gap values, all on scale | **PASS** |
| 2g | Radius values | **≤ 3 distinct** | **5**: 4, 8, 12, 16px, full. The 4px occurs once | **FAIL** |

The 2b cap is deliberately not the prompt's "1 primary, 1 accent, 2–3 neutrals": a tool with
charts needs seven separable series by definition, and the cardio screen is a documented
exception recorded beside its tokens in `index.css`.

## Gate 3 — Hierarchy · **FAIL**

**Method.** SQUINT: `filter: blur(8px)` (≈2% of a 375px viewport) on the live page, captured,
then a 12 × 26 grid scored by mean luminance deviation from the modal background; the top
cell's centre mapped back with `elementFromPoint`. GREYSCALE: interactive elements ranked by
`|luminance − page background| × area`. THUMBNAIL: largest rendered text × 0.2.

| Route | Squint dominant | Greyscale #1 | Weight | Verdict |
|---|---|---|---|---|
| `/train` | **Log set** | **Log set** | 5,982 | **PASS** |
| `/exercises` | **+ New exercise** | **+ New exercise** | 6,640 | **PASS** |
| `/foods` | **+ New recipe** | **+ New recipe** | 6,640 | **PASS** |
| `/cardio` | "40 min" | **Start session** | 7,589 | **PASS** |
| `/food` | "348" (kcal) | Library chip | **37** | **FAIL** |
| `/progress` | "78.1 kg latest" | chart select | **59** | **FAIL** |
| `/settings` | "Settings" (h1) | Sync now | **89** | **FAIL** |
| `/history` | header | a session row | **174** | **FAIL** |

| # | Check | Threshold | Current | Status |
|---|---|---|---|---|
| 3a | One dominant element per view, and it is the intended focal point | 8 of 8 routes | **4 of 8** | **FAIL** |
| 3b | Hierarchy survives greyscale: the primary action is the most prominent interactive element | 8 of 8 | **4 of 8** | **FAIL** |
| 3c | Screen title identifiable at 20% (the app-switcher case) | ≥ 5px | **4.8px** (24px h1) | **FAIL**, marginally |

**One cause, not eight.** The four passing routes each have a **filled accent button**; the
four failing ones have none — every action is bordered or ghost. Greyscale weights split by
two orders of magnitude, 5,982–7,589 against 37–174.

**Method limitation, recorded not hidden:** the dominance ratio came out at exactly 1.00 on
three routes because a wide filled button spans several grid cells with identical weight, so
"second place" is often the same element. The greyscale ranking is the reliable signal; the
ratio is indicative only and is not used as a threshold.

## Gate 6 — Motion, **ADAPTED** · **PASS** (fixed by F1 and F2, 2026-09-20)

No scroll reveals and no hover states are required: the target device is a touch phone where
hover does not exist, and FINISH-LINE.md §1c locks "no motion" as the system.

**Full inventory — 4 animations, all functional, none decorative:**

| Element | Trigger | Duration / easing | Property |
|---|---|---|---|
| Sync dot `animate-pulse` | while flushing | 2s `cubic-bezier`, infinite | opacity |
| Hold-to-end fill | press and hold | 2000ms `linear` | **transform** (was width — F2) |
| Reorder row | drag | ~150ms Tailwind default | transform |
| Rest bar | timer tick | Tailwind default | **transform** (was width — F2) |

| # | Check | Threshold | Current | Status |
|---|---|---|---|---|
| 6a | Every interactive element has a visible focus state | all | Global `:focus-visible`, 2px accent, 2px offset ([index.css:145](src/index.css:145)); confirmed under keyboard Tab | **PASS** |
| 6b | No decorative motion added | 0 new animations | 0 at rest across all 8 tabbed routes | **PASS** |
| 6c | `prefers-reduced-motion` respected | all 4 stop or resolve instantly | **PASS** — under emulated `reduce`: transitions 1e-05s, `animate-pulse` iteration count **1** (was infinite). With no preference it returns to 2s infinite, so the rule discriminates | **PASS** |
| 6d | No layout shift from motion | CLS ≤ 0.1 | **0, 0, 0.0003** | **PASS** |
| 6e | Animations use transform/opacity only | all 4 | **PASS** — a DOM sweep finds **zero** elements with a `width` transition | **PASS** |

**The one documented exception (F1).** `.motion-hold-progress` keeps its 2000ms transition
under `reduce`, verified at 2s while everything around it drops to 1e-05s. That bar *is* the
two-second press: stilling it would fill it instantly while the press still had two seconds
to run — the one place where honouring the preference would make the interface lie.

**Carried to Stage 1 — `UNVERIFIED`:** three inputs carry Tailwind's `outline-none` beside the
global focus rule. Source order says the ring wins (Tailwind imported at
[index.css:1](src/index.css:1), rule at line 145, equal specificity) and the ring was
confirmed on a nav link and a button, but keyboard focus could not be landed on one of those
inputs to prove it.

## Gate 7 — Typography Craft · **FAIL** — 7d only (7c and 7e fixed/measured 2026-09-20)

| # | Check | Threshold | Current | Status |
|---|---|---|---|---|
| 7a | Text contrast | ≥ 4.5:1; large ≥ 3:1 | **6.04:1 minimum across 239 text nodes**, 8 routes, at 375 and 1280. Zero failures | **PASS** |
| 7b | Body measure | 60–80 characters | **74** at 1280px; the column is `max-w-lg` so measure is bounded by construction | **PASS** |
| 7c-i | **Primary content ≥ 16px** | all primary elements | **8 of 8 pass** after F4 — see below | **PASS** |
| 7c-ii | Everything else ≥ 11px | absolute floor | minimum rendered is **11px** | **PASS** (ratchet) |
| 7d | Body line-height | 1.5–1.7 | 14px → **1.43** · 12px → **1.33** · 11px → **1.25**. Only 16px (1.5) and 18px (1.56) are in band. Re-measured after F1–F4: unchanged | **FAIL** — fix F5, not approved |
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
| 10b | Visible focus indicators | all focusable | Global ring, confirmed under keyboard Tab | **PASS** (see Gate 6 unverified item) |
| 10c | Keyboard-navigable | all interactive | Tab traverses nav and session controls; **not exhaustively walked** | **PARTIAL** |
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

## Anti-adjective statements — due at Stage 1

Retained from Gate 1's method even though Gate 1 is waived, because the Intent Brief names the
element most at risk for each: **cluttered** → the Train exercise card · **busy** →
`/progress`, 251 elements · **decorative** → the cardio full-screen colour.

---

## Remaining fixes, not approved

| # | Fix | Would close |
|---|---|---|
| F5 | 6 type steps, one line-height each, body 1.5–1.7 | 2d, 2e, 7d → **closes Gate 7** |
| F6 | Radii ≤ 3 | 2g → **closes Gate 2** |
| F7 | h1 24 → 26px+ for the thumbnail test | 3c — or waive; 4.8 vs 5.0 is marginal |
| F8 | A filled primary action on the 4 flat screens | 3a, 3b → **closes Gate 3** |

F8 carries a standing reservation: `/food` has four "+ Add" buttons, and `/progress` and
`/settings` may have no honest primary action. For some of those screens the right answer may
be a written exception in Gate 3 rather than an invented button.

## Changelog

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
