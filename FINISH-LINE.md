# FINISH-LINE.md — v1.2 · AMENDED, AWAITING RE-LOCK

| | |
|---|---|
| **Version** | **v1.2** — rest timer removed from scope under **UNFREEZE**, 2026-09-22 |
| **Previously** | v1.1 (quality gates, 2026-09-20) · v1.0, locked 2026-09-19, tagged `v1.0` at `d956164` |
| **Completion authority** | Harshit Rawat, sign-off alone (personal project) |
| **Acceptance status** | **SIGNED OFF** on v1.0 scope; the added gate criteria are not yet satisfied |
| **Re-LOCK** | **pending** — not permitted until QUALITY-GATES.md shows Stage 2 PASSED. The `v1.0` tag stays where it is until then |

> **Two unfreezes so far, each narrow.** v1.1 added the approved quality gates as v1 criteria
> (UNFREEZE FOR QUALITY, 2026-09-20). v1.2 removed the rest timer from scope (UNFREEZE,
> 2026-09-22). Neither authorised anything beyond itself. Every other request remains EXTRA,
> and reopening anything else still requires the word **UNFREEZE**.

> **This document is the only definition of what v1 is.** A criterion that is not
> written here does not exist. Anything not written here is EXTRA — see
> [CLAUDE.md](CLAUDE.md) for how a request is classified after the freeze.
>
> Scope reopens only on the explicit word **UNFREEZE**, through a new version of this
> document. Not by drift.

---

## 0. Provenance of these criteria — read this first

The original brief is **lost**. The README asserts *"All seven v1 acceptance criteria are
met"* ([README.md:862](README.md:862)) but does not say what they are, and no copy exists in
the repository.

What could be recovered, and how:

**The brief's section structure is reconstructed from 27 citations in the code** — this part
is `VERIFIED`, because the code cites the brief by number:

| § | Subject | Evidence |
|---|---|---|
| 4 | Sync indicator — "small, non-modal, silent when there is nothing to say" | `SyncPill.tsx:8` |
| 5 | Security — RLS "applied in a loop so a table cannot be forgotten" | `0001_initial_schema.sql:243` |
| 6 | Data rules — kg/g with no unit switcher, macros per 100g, **snapshots (critical rule)**, recipe yield required | 7 citations |
| 7.1 | Today's session — "the screen that matters most", no modals, numeric keypad | 3 citations |
| 7.2 | Double progression — inputs, suggestion opt-in, pre-fills nothing until tapped | 3 citations |
| 7.3 | Charts — "exactly the three formulas the brief specifies and no others" | `analytics.ts:10` |
| 7.4 | Diet — targets set manually, Mifflin-St Jeor, recents-first, 7-day average includes blanks | 8 citations |
| 7.5 | Food provider — "do not paper over the gap with fuzzy matching" | 2 citations |
| 8 | Design — dark by default for gym lighting, designed empty states | 2 citations |
| 10 | **Acceptance criteria** — contains the seven | `export.ts:9` |

**Exactly one of the seven survives verbatim** — `VERIFIED`, quoted in `export.ts:9`:

> *"I can export all my data to a file without asking you to write a script."*

It is a **first-person capability statement**. The other six below are written in that voice
and derived from what §§4–8 demanded and the code demonstrably does.

**Criteria 1–6 are `RECONSTRUCTED`, not recovered.** They were locked in full knowledge of
that. If the brief ever resurfaces and contradicts them, that is an UNFREEZE, not a defect.

---

## 1. Definition of Done

### 1a. The seven acceptance criteria

| # | Criterion | Origin |
|---|---|---|
| 1 | *I can log a full session on my phone one-handed, without the app getting in the way.* | `RECONSTRUCTED` |
| 2 | *It works with no signal in the gym, and syncs when I have one again.* | `RECONSTRUCTED` |
| 3 | *It tells me what to lift next, and I can see why it said that.* | `RECONSTRUCTED` |
| 4 | *I can log what I ate without hunting for it, including my own recipes.* | `RECONSTRUCTED` |
| 5 | *I can see whether any of it is working.* | `RECONSTRUCTED` |
| 6 | *My data is mine, and signed out nobody can read it.* | `RECONSTRUCTED` |
| 7 | *I can export all my data to a file without asking you to write a script.* | `VERIFIED — verbatim` |

These seven are intent. **The tables below are the test.** A dispute about whether the app
satisfies criterion 1 is settled by 1b–1d, never by re-reading the sentence.

### 1b. Content — every screen, by name

A screen not on this list is out of scope.

| Route | Must exist | Status |
|---|---|---|
| `/signin` | Magic-link form; no account creation | `VERIFIED` 200 |
| `/train` | Today's session: add lift, log set, edit set in place, 5 set types, session name, notes, reorder, finish | `VERIFIED` 200 |
| `/history` | Every session newest-first; backfill any date | `VERIFIED` 200 |
| `/history/:id` | One past session, fully editable | `VERIFIED` route exists |
| `/exercises` | Library CRUD: rep range, increment, floor, machine setting, assisted flag | `VERIFIED` 200 |
| `/food` | Day's log by meal slot, totals against target, 7-day average | `VERIFIED` 200 |
| `/foods` | Foods and recipes; recipe yield; provider search | `VERIFIED` 200 |
| `/cardio` | Presets and config | `VERIFIED` 200 |
| `/cardio/session` | Running timer, no navigation chrome | `VERIFIED` route exists |
| `/cardio/review/:id` | RPE and notes after the fact | `VERIFIED` route exists |
| `/progress` | Strength chart, tonnage, weekly volume, bodyweight | `VERIFIED` 200 |
| `/settings` | Sync, library links, targets, version, export, diagnostics, sign out | `VERIFIED` 200 |

**Owed content: none.** `VERIFIED` — a scan of all tracked source for `TODO`, `FIXME`,
`lorem`, `coming soon`, `[FILL`, `PLACEHOLDER` and empty `alt` returned zero. There is no
owed-content register because nothing is owed, by me or by anyone else.

**Explicit content exclusions** — considered and NOT part of v1:

- Historical import of phone notes. Abandoned in writing; history is typed by hand.
- A routine/template editor. Replaced by "repeat a session" by deliberate decision.
- Unilateral left/right set tracking. Handled manually by the owner.
- Per-exercise set history screen. Suggested, never built.
- **The rest timer between sets. Built, shipped, then removed at the owner's request
  2026-09-22 under UNFREEZE** — with its Settings control and its stored
  `rest:defaultSeconds` key. Re-adding it is EXTRA.

### 1c. Design / creativity

The visual system **as it stands is the v1 visual system**. Named components, all `VERIFIED`
in `index.css`:

- **Palette** — dark by default (brief 8: gym lighting); tokens `--bg --surface --surface-2
  --border --text --text-dim --accent --danger --ok`, redefined under
  `prefers-color-scheme: light`.
- **Chart series** — seven fixed slots `--series-1..7`, assigned by slot, never cycled,
  validated for lightness band, chroma, adjacent-pair CVD separation and contrast.
- **Layout** — `Screen` shell (sticky header, scrolling body), `TabBar` of five, cards as
  `rounded-2xl border border-border bg-surface`.
- **Motion** — no *decorative* motion. **This is the system, not an omission**; adding
  animation is EXTRA.

  *Corrected 2026-09-20.* This previously read "none. Nothing in the app animates", which was
  never true: four functional animations existed at lock time — a sync pulse, two progress
  fills and a drag. The rule is unchanged and no scope moved; only the description was wrong.
  Three remain since v1.2 removed the rest bar; QUALITY-GATES.md Gate 6 enumerates them.

| # | Criterion | Status |
|---|---|---|
| D1 | No screen deviates from the token set above (no hardcoded hex outside `index.css`) | `VERIFIED` met 2026-09-19 — a grep for hex, `rgb()` or `hsl()` outside `index.css` returns nothing |
| D2 | Renders correctly at **375px** and **390px** wide | `VERIFIED` met 2026-09-19 — all 8 tabbed routes at both widths, seeded and empty |
| D3 | No horizontal page scroll at 375px on any route | `VERIFIED` met 2026-09-19 — `scrollWidth === clientWidth` on all 8 routes at 375 and 390 |
| D4 | Every list has a designed empty state (brief 8) | `VERIFIED` met 2026-09-19 — all 7 list screens, each with a named next action |

**Design exclusions:** light mode is supported but not designed-for; no animation; no custom
iconography beyond the five inline tab glyphs.

### Quality gates (added v1.1)

Methods and thresholds live in [QUALITY-GATES.md](QUALITY-GATES.md) and are **referenced, not
restated** — that document is the single definition of how each is measured. Intent is in
[INTENT-BRIEF.md](INTENT-BRIEF.md).

| # | Criterion | Status at v1.1 |
|---|---|---|
| D5 | Quality Gate 2 — visual system coherence | **PASS** 2026-09-20 — 6 type steps, one line-height each, 3 radii |
| D6 | Quality Gate 3 — hierarchy (squint, greyscale, thumbnail) | **PASS** 2026-09-20 — 8 of 8 routes |
| D7 | Quality Gate 6 — motion, adapted | **PASS** 2026-09-20 |
| D8 | Quality Gate 7 — typography craft | **PASS** 2026-09-20 |
| D9 | Quality Gate 8 — five-second test | **NOT MEASURED** — Stage 2 |
| D10 | Quality Gate 10 — accessibility floor | **PASS**, not adjustable |
| — | Quality Gates 1, 4, 5 | **WAIVED** with written reasons. A waived gate is not a passed gate |

**A failing gate is a DEFECT and its fix is in scope. A visual change that serves no gate is
EXTRA.**

### 1d. Optimization

Lighthouse is deliberately absent, and that is a decision rather than a gap: the app is behind
magic-link auth, so an audit would only ever score the sign-in screen. These eleven measurable
thresholds are its substitute, and they are the **whole** of the optimization criterion — a
number better than these is EXTRA.

| # | Threshold | Status |
|---|---|---|
| O1 | `npx tsc --noEmit` exits clean | `VERIFIED` met |
| O2 | `npx vitest run` — all pass | `VERIFIED` met, **168 passing** |
| O3 | Zero **application** console errors on load of any route | `VERIFIED` met — the only message is a CSP block on an inline script, and `dist/index.html` has zero inline scripts |
| O4 | Cold transfer on first load ≤ **250 KB** | `VERIFIED` met at **177 KB** over 8 requests |
| O5 | Total precache ≤ **1.5 MB** | `VERIFIED` met at **1,078 KB**, 32 entries |
| O6 | Every route returns **200** in production | `VERIFIED` met, 9/9 |
| O7 | Two builds of one commit produce identical filenames | `VERIFIED` met, 23 assets |
| O8 | Signed out, every synced table returns zero rows; a signed-out insert is refused | `VERIFIED` met 2026-09-17 — 15/15 tables `200 []`, insert `42501` |
| O9 | No secret in the bundle: no `service_role`, no sandbox credentials | `VERIFIED` met |
| O10 | Every interactive control ≥ **44 × 44 px** | `VERIFIED` met 2026-09-19 — 0 controls under 44px across 8 routes × 2 widths, seeded and empty, plus 4 interactive states |
| O11 | The app loads and renders with the network offline | **PARTIAL** — mechanism proven on desktop, not on the installed PWA. See G3 |
| O12 | Motion performance bounds — no layout shift from motion (CLS ≤ 0.1) and animations on transform/opacity only. Method in QUALITY-GATES.md, Gate 6d/6e | `VERIFIED` met 2026-09-20 — CLS 0–0.0003; zero `width` animations remain |

---

## 2. Deployment criterion

**The app is deployed at https://log-book-hr.netlify.app, responds 200, and nothing that
ships has changed since the deployed build.**

**This URL is final for v1. No custom domain is required.**

### The check, in one command

The build stamp is baked into the bundle and shown on the Settings screen. Production passes
when no commit after that stamp touches anything the bundle is built from:

```bash
git log --oneline <deployed-stamp>..HEAD -- src public index.html vite.config.ts tsconfig.json package.json package-lock.json netlify.toml
```

**Empty output passes.** Any line is a defect — shipped code exists that production is not
serving. Read the stamp from Settings, or from the served bundle.

> *Reworded 2026-09-20.* This previously read *"serving `sha: X`, identical to local `HEAD`"*,
> which no deploy could satisfy for longer than the next commit: editing a Markdown file
> falsified it, and this document twice had to carry a paragraph explaining why that did not
> really count. A criterion that can never stay true is not a gate, so this is a repair rather
> than a relaxation — **every line of shipped code must still be live**, and the command above
> says so mechanically instead of in prose. Verified to discriminate: run against a commit
> predating the last source change it returns that change; run against the deployed commit it
> returns nothing.

### `VERIFIED` 2026-09-25

Production serves `sha: 06d2e4b`, and the command above returns nothing.

Evidence, because a bare 200 means little here: the SPA rewrite returns `index.html` with a
**200** for any missing asset, so every probe was run against a control. The real entry chunk
came back as `application/javascript`, 62,616 bytes; a deliberately nonexistent one came back
as `text/html`, 1,630 bytes. All ten routes 200. The build stamp inside the Settings chunk
*as served by production* reads `7399107`. `manifest.webmanifest` is served as
`application/manifest+json`. No `service_role` and no sandbox credential appears in what
production serves.

`--prod` returned `JSONHTTPError: Forbidden` for the **third** time (14 Sep, 17 Sep, 20 Sep),
and the documented draft-then-`restoreSiteDeploy` path worked again. It is the normal path
for this site, not an incident.

---

## 3. Completion authority

Personal project. **v1 is complete on Harshit's sign-off alone.** No client, no third party,
no acceptance checklist. Sign-off given 2026-09-19.

**Added v1.1:** LOCK is not permitted until [QUALITY-GATES.md](QUALITY-GATES.md) shows
**Stage 2 PASSED**. Gate 9 (behavioural) is exempt from this precondition and is verified
post-launch.

---

## 4. Explicitly out of scope

Everything below was considered, suggested, or partially started and is **NOT** part of v1.

**Abandoned by decision** — historical notes import · routine/template editor · unilateral
L/R sets.

**Suggested, never built** — per-exercise set history screen · plate-arithmetic helper ·
PR/best-set markers · bodyweight logging reminder · session-duration charting · copying a
session *including* its sets · filtering History.

**Deliberate dead schema, staying put** — `sets.rir` and the three `routines*` tables exist in
Postgres, are unused by the client, and are documented as such. Dropping them is out of scope.

**Owner's data entry, not software** — the fortnight of backfill, setting macro targets,
logging a first bodyweight. The app supports all three; using it is not a build criterion. The
diet half of the app is **in scope and complete** even though it has never been used in anger;
unused is not the same as unbuilt.

**Post-v1 refinements already shipped** — the 21 items under *"Since v1"* in the README. They
are done; they are recorded as history, not as criteria.

**Infrastructure** — no CI, no automated deploys, no error reporting, no analytics. Deploys
are manual and local by deliberate choice.

**Quality Gate 9, behavioural metrics (added v1.1)** — out of scope **for LOCK purposes**. It
requires analytics and a 30-day live window, neither of which exists or is wanted here. It is
a post-launch verification, not a v1 criterion, and it can never block a LOCK.

---

## 5. Gap to the finish line

The **only** remaining work in scope. Everything else is EXTRA.

| # | Item | Status | What makes it VERIFIED |
|---|---|---|---|
| G1 | **Cardio step 4** — a real 30-minute session on the phone | **OPEN** | Every cue on time · total drift < 2s · correct round count logged · survives one deliberate backgrounding. Recorded in README with the date. |
| G2 | **O10** — controls below 44px | **CLOSED** `8c45f7e` | Each measured ≥ 44px at 375px |
| G3 | **O11** — offline on the installed PWA | **PARTIAL** | Load the installed PWA with the network off; the app renders and a set can be logged |
| G4 | **D3** — horizontal-scroll check on `/food`, `/foods`, `/cardio` | **CLOSED** `8c45f7e` | `scrollWidth <= clientWidth` on each |
| G5 | **D4** — empty-state check on every list | **CLOSED** `8c45f7e` | Each list screen shows a designed empty state with a next action |
| G6 | **D1** — no hardcoded hex outside `index.css` | **CLOSED** `bdff75f` | A grep returns only token references |

### G2 — closed, and wrong twice before it was

v0 said **four** controls. v1.0 corrected that to **seven**. Both were undercounts; the real
number was **nine**. The method was the problem, not the arithmetic:

- Grepping the source for height utilities cannot see a control sized by **padding alone** —
  the two chart buttons on `Progress` were exactly that.
- Grepping at all only covers the routes you think to look at. The two Food chips were missed
  at v0 because I had only opened five routes at 375px, which is the same omission that
  created G4.
- Two more controls **only exist once there is data** — the Reps input and the strength-chart
  `select` — so neither a grep nor a sweep of empty screens could find them.

What actually worked: enumerating `button, a, input, select, textarea` in the live DOM and
reading `getBoundingClientRect()`, across every route, at both widths, with and without
seeded data, and again with the picker, reorder, note and remove-confirm states open. That
is the method this criterion should be re-checked with in future, not a grep.

The delicate one was the `NumberField` steppers at 40px. They were narrowed to 40 in the
first place to stop the weight input collapsing and clipping `62.5` — the regression that
shipped in `bdfdf2f`. Widening them back was measured, not assumed: 53px of text space
remains and the widest realistic value, `127.5`, needs 46px.

The 20px checkbox at `Exercises.tsx:338` **passes**: it sits inside a `<label>` with `p-3` and
two lines of text, and the whole label is the tap target.

### G3 — what was proven, and what was not

`VERIFIED` on desktop, 2026-09-19: a production build was served, its service worker took
control and precached 29 entries including `/index.html`, the origin was then **stopped**
(`curl` → connection refused), and on reload the app rendered `/train` in full from cache.
A set was logged with the origin dead: `sets` 1 → 2, `outbox` 0 → 1. With `navigator.onLine`
forced false the sync pill read *"Offline · 1 to sync"*.

`NOT VERIFIED`: the criterion says **the installed PWA with the network off**. This was
desktop Chrome with one origin unreachable while the machine still had a network. The
mechanism is proven; the stated configuration is not. G3 stays open, and it is an
owner-phone task alongside G1.

**The v1.0 gap is two items, both needing the phone.** Everything verifiable from this machine
is done.

### Quality-gate defects (added v1.1)

In scope by definition — a failing gate written here is a DEFECT. Fix identifiers match
QUALITY-GATES.md.

| # | Item | Status | Fix |
|---|---|---|---|
| G7 | **D5 / Gate 2** — type scale over the cap, duplicate line-heights | **CLOSED** — 6 steps, one leading each | F5 |
| G8 | **D8 / Gate 7d** — body line-height outside 1.5–1.7 | **CLOSED** — every body step at 1.5 | F5 |
| G9 | **D5 / Gate 2g** — 5 distinct radii against a cap of 3 | **CLOSED** — 3 | F6 |
| G10 | **D6 / Gate 3a, 3b** — 4 of 8 routes had no dominant interactive element | **CLOSED** — 8 of 8 | F8 |
| G11 | **D6 / Gate 3c** — the h1 read 4.8px at 20% | **CLOSED** — 5.2px | F7 |
| G12 | **D9 / Gate 8** — the five-second test | **OPEN** — Stage 2, run by the owner | — |

Fix batch F1–F4 closed Gate 6 entirely, Gate 7c and Gate 7e on 2026-09-20; F5–F8 closed
Gates 2, 3 and the rest of 7 the same day. **Stage 1 passed.** The only quality item left is
G12, which cannot be run by me: its protocol is the owner's five-second test.

---

## 6. Recording mechanism

1. **`FINISH-LINE.md`** in the repo root — this file. The single source of truth.
2. **An annotated git tag `v1.0`** on the freeze commit, so the line is findable from history
   without reading the file.
3. **`BACKLOG.md`** — one line per EXTRA: date, one sentence, source.
4. **`CLAUDE.md`** in the repo root, carrying the post-freeze operating rule verbatim.

**Why this combination:** the repo had no project-level `CLAUDE.md`, so a fresh session
inherited nothing and would happily keep suggesting improvements — which is exactly how 21
post-v1 items shipped. The tag matters because this project deploys from local builds with no
CI, so the commit is the only durable marker of what "v1" pointed at.

---

## Changelog

**v1.2 — 2026-09-22 — rest timer removed from scope, under UNFREEZE.** It was required
content on `/train` ("rest timer") and on `/settings` ("rest length"); both are struck. The
feature, its setting and its stored key are gone from the app, and it is now listed under
*Explicitly out of scope*, so re-adding it would be EXTRA.

This is a **narrowing** of v1, not a defect fix — nothing was failing. It needed UNFREEZE
precisely because deleting a criterion is a scope change, and the owner gave it.

Knock-on: quality Gate 6's motion inventory drops from four functional animations to three,
since the rest bar was one of them. Recorded in QUALITY-GATES.md; the gate still passes.


**v1.1 — 2026-09-20 — quality gates added as v1 criteria under UNFREEZE FOR QUALITY.**
The approved gates in [QUALITY-GATES.md](QUALITY-GATES.md) are now criteria **D5–D10** under
Design and **O12** under Optimization, referenced rather than restated. Gates 1, 4 and 5 are
waived with written reasons; Gate 9 is out of scope for LOCK. Completion Authority gains a
precondition: no LOCK until Stage 2 passes. The gap gains **G7–G12**. Fix batch F1–F4 was
applied the same day and closed Gate 6, Gate 7c and Gate 7e.

**Deployment criterion reworded, 2026-09-20.** §2 said production must serve a build
"identical to local `HEAD`". No deploy could satisfy that past the next Markdown commit, and
the document had twice papered over it with an explanatory paragraph. It is now a single
`git log` command that returns empty when nothing shippable has changed since the deployed
stamp. A repair, not a relaxation: all shipped code must still be live, and the new form is
mechanically checkable where the old one was prose. The URL, the 200 requirement and the
substance are unchanged.

**Fix batches, 2026-09-20.** F1–F4 then F5–F8, all eight applied and re-measured; Stage 1
of the three-stage judgement passed. Gates 2, 3, 6, 7 and 10 pass; 1, 4 and 5 are waived; 8
awaits Stage 2; 9 is not applicable.

**This amendment reopened nothing else.** Everything outside the gates remains frozen at v1.0,
and the `v1.0` tag has deliberately **not** been moved — it still marks what v1.0 pointed at.

**Status update — 2026-09-19, after the lock.** No criterion changed; only our position
against them. G2, G4, G5 and G6 closed, taking D1–D4 and O10 to met. G3 moved to PARTIAL:
offline is proven on desktop but not on the installed PWA. The gap is now **G1 and G3**, both
of which need the phone. The corrected sub-44px count — four, then seven, then nine — is
recorded in §5 along with why grepping kept missing them, because the method matters more
than the number.

**v1.0 — 2026-09-19 — LOCKED.** From v0:

- Added the locked header: date, version, authority, **SIGNED OFF**.
- Removed every `PROPOSED` marker. The optimization thresholds O1–O11, the four design
  criteria (now numbered D1–D4), the final URL and the recording mechanism are criteria, not
  proposals.
- **Corrected G2 from four sub-44px controls to seven**, with the source of the undercount
  stated and each control's evidence distinguished (browser-measured vs. read from source).
- Recorded the three Phase-B positions the owner did not contest before locking: cardio is
  **inside** the line and step 4 is criterion G1; the Netlify URL is **final**; the diet half
  is **in scope and complete**, unused being distinct from unbuilt.
- Noted that the lock commit is documentation only, so the deployment criterion holds without
  a redeploy.
- Noted that a resurfaced brief contradicting criteria 1–6 is an UNFREEZE, not a defect.
