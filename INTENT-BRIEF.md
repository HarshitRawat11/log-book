# INTENT-BRIEF.md — PROPOSED

> Awaiting approval. No gate is written and no design change is made until this is approved.
> Phase B answers recorded 2026-09-19.

---

## Audience

**One person: the owner.** Not a segment, not a persona — the single account holder, who also
wrote the brief and the code.

The state he is in when it matters: **mid-set on a gym floor, phone in one hand, out of
breath, under bad overhead lighting**, with sixty to ninety seconds before the next set. That
is the condition the app is designed for and the one every gate is judged against.

Two lesser contexts, which must not be allowed to drive the design: at a desk reviewing
`/progress`, and in a kitchen logging food.

There is no second audience. No sharing, no multi-tenancy, no visitors, no client
([README.md:6](README.md:6), FINISH-LINE.md §3).

## Core message

**Everything you lifted and ate is here, it is correct, and it is one thumb away.**

## Primary action

**Log a set.** Measured as: cold launch → a set written to IndexedDB, one-handed, without
scrolling past anything.

Every other capability in the app — history, food, cardio, charts, export — is subordinate to
that one and must not be allowed to cost it a tap.

## Adjectives

**Must evoke — fast, legible, unfussy.** What each makes testable:

| Adjective | Becomes a test of |
|---|---|
| Fast | nothing stands between launch and the primary action |
| Legible | size and contrast floors that hold at arm's length, in poor light |
| Unfussy | every element on screen is doing work |

**Must never evoke — cluttered, busy, decorative.** Each with the element most at risk, named
now so the judgement later is not retrofitted:

| Anti-adjective | Element most at risk | Why |
|---|---|---|
| Cluttered | the Train exercise card | densest surface in the app; `/train` renders 95 elements |
| Busy | `/progress` | the heaviest route measured, **251 elements** |
| Decorative | the cardio full-screen colour | the one choice that *looks* purely aesthetic. It is not — the pair is measured for dichromacy separation and read at three metres — but it is the element that would fail this test first if it ever drifted |

## Desired first impression in five seconds

Opening `/train` mid-session, without scrolling and without reading a sentence, he can see:
**which exercise he is on, what he did last time, and the weight and reps inputs with Log
set.** If any of those three requires a scroll or a paragraph, the impression has failed.

## Benchmarks

**Gate 4 is waived (Phase B), so benchmarks no longer carry a pass/fail function.** They are
offered as reference only, and all three are `UNVERIFIED` — proposed from general knowledge,
not inspected in this session. Replace or delete them freely.

Note also that the closest references are **applications, not websites**; a marketing site is
the wrong shape to learn from for a tool used under load.

1. **Hevy** — a gym logger with a genuinely good one-handed logging loop. Worth studying for
   how few taps sit between opening the app and writing a set, and for how it shows the
   previous session's numbers without a second screen.
2. **Linear** — for restraint: a tight type scale, heavy use of one neutral ramp, and almost
   no decoration. The relevant lesson is the discipline, not the aesthetic.
3. **Apple Health / Fitness rings** — for reading a number at a glance from a distance, which
   is the cardio screen's problem exactly.

If you would rather skip benchmarks entirely, that is now consistent — with Gate 4 waived,
nothing depends on them.

## Integration with FINISH-LINE.md — **CASE 3**

FINISH-LINE.md **exists and is LOCKED**.

| | |
|---|---|
| Version | **v1.0** |
| Locked | **2026-09-19** |
| Tag | `v1.0`, annotated, at `d956164` |

A scoped amendment is therefore required, and it needs the exact words **UNFREEZE FOR
QUALITY** from you.

**That phrase authorises one change only:** adding the approved gates to FINISH-LINE.md as v1
criteria and bumping the version to v1.1 with a dated amendment note. It reopens nothing else.
Every non-gate request stays EXTRA under the existing freeze. After the gates pass Stage 2,
the document is re-LOCKed at v1.1 and the tag moved.

In all cases: **a failing gate is a DEFECT and its fix is in scope. A visual change that
serves no gate is EXTRA.**

### Which gates apply, after Phase B

| Gate | Status |
|---|---|
| 2 Visual system coherence | **APPLIES** |
| 3 Hierarchy | **APPLIES** |
| 6 Motion | **APPLIES, ADAPTED** — focus states, bounds on the 4 existing functional animations, and `prefers-reduced-motion`. No scroll reveals, no hover: the device is a touch phone and hover does not exist on it. No conflict with locked §1c |
| 7 Typography craft | **APPLIES** |
| 8 Five-second test | **APPLIES** — but run against the owner's own five-second impression above, not three strangers |
| 10 Accessibility floor | **APPLIES**, not adjustable |
| 1 Intent alignment | **WAIVED** — no hero, no fold, no visitor. Every screen is a working surface |
| 4 Distinctiveness | **WAIVED** — no logo to cover, no brand to be mistaken for, one user who wrote the brief |
| 5 Imagery | **WAIVED** — the app has no content imagery by design; `<img>` appears nowhere in `src/`. Adding AI imagery to a gym logger would serve no intent |
| 9 Behavioural metrics | **NOT APPLICABLE** — personal project, no analytics, none wanted |

A waived gate is **not** a passed gate. All four are listed separately in QUALITY-GATES.md
with these reasons.

### Already-measured failures these gates will inherit

From Phase A, so Phase D starts from evidence rather than a blank sheet:

- **Type scale**: 8 rendered sizes (11, 12, 14, 16, 18, 20, 24, 30px) against a proposed cap
  of 6; 20 distinct size/line-height/weight combinations.
- **Line-height is not consistent per step**: 11px renders at both 16.5 and 13.75; 12px at 16
  and 19.5; 14px at 20 and 22.75.
- **Radii**: 5 distinct values (4, 8, 12, 16, full) against a proposed cap of 3.
- **`prefers-reduced-motion` is not handled anywhere**, and the sync dot's `animate-pulse`
  loops indefinitely.

Passing already, measured: one font stack, 100% token-mapped colour across 10 routes, zero
console errors, CLS 0–0.0003, a global `:focus-visible` ring.
