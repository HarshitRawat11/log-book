# FINISH-LINE.md — v1.0 · LOCKED

| | |
|---|---|
| **Version** | v1.0 |
| **Locked** | 2026-09-19 |
| **Completion authority** | Harshit Rawat, sign-off alone (personal project) |
| **Acceptance status** | **SIGNED OFF** |
| **Freeze commit** | the commit tagged `v1.0` |

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
| `/train` | Today's session: add lift, log set, edit set in place, 5 set types, rest timer, session name, notes, reorder, finish | `VERIFIED` 200 |
| `/history` | Every session newest-first; backfill any date | `VERIFIED` 200 |
| `/history/:id` | One past session, fully editable | `VERIFIED` route exists |
| `/exercises` | Library CRUD: rep range, increment, floor, machine setting, assisted flag | `VERIFIED` 200 |
| `/food` | Day's log by meal slot, totals against target, 7-day average | `VERIFIED` 200 |
| `/foods` | Foods and recipes; recipe yield; provider search | `VERIFIED` 200 |
| `/cardio` | Presets and config | `VERIFIED` 200 |
| `/cardio/session` | Running timer, no navigation chrome | `VERIFIED` route exists |
| `/cardio/review/:id` | RPE and notes after the fact | `VERIFIED` route exists |
| `/progress` | Strength chart, tonnage, weekly volume, bodyweight | `VERIFIED` 200 |
| `/settings` | Sync, library links, rest length, targets, version, export, diagnostics, sign out | `VERIFIED` 200 |

**Owed content: none.** `VERIFIED` — a scan of all tracked source for `TODO`, `FIXME`,
`lorem`, `coming soon`, `[FILL`, `PLACEHOLDER` and empty `alt` returned zero. There is no
owed-content register because nothing is owed, by me or by anyone else.

**Explicit content exclusions** — considered and NOT part of v1:

- Historical import of phone notes. Abandoned in writing; history is typed by hand.
- A routine/template editor. Replaced by "repeat a session" by deliberate decision.
- Unilateral left/right set tracking. Handled manually by the owner.
- Per-exercise set history screen. Suggested, never built.

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
- **Motion** — none. Nothing in the app animates. **This is the system, not an omission**;
  adding motion is EXTRA.

| # | Criterion | Status |
|---|---|---|
| D1 | No screen deviates from the token set above (no hardcoded hex outside `index.css`) | **NOT VERIFIED** — see G6 |
| D2 | Renders correctly at **375px** and **390px** wide | `VERIFIED` at 375 on Train, Exercises, History, Progress, Settings |
| D3 | No horizontal page scroll at 375px on any route | `VERIFIED` on the five above; **unverified on `/food`, `/foods`, `/cardio`** — see G4 |
| D4 | Every list has a designed empty state (brief 8) | **NOT VERIFIED** — see G5 |

**Design exclusions:** light mode is supported but not designed-for; no animation; no custom
iconography beyond the five inline tab glyphs.

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
| O10 | Every interactive control ≥ **44 × 44 px** | **NOT MET** — 7 known failures, see G2 |
| O11 | The app loads and renders with the network offline | **NOT VERIFIED** — never tested, see G3 |

---

## 2. Deployment criterion

`VERIFIED` Deployed and responding **200** at **https://log-book-hr.netlify.app**, serving
`sha: 3d4524a`, identical to local `HEAD` at the moment of measurement.

**This URL is final for v1. No custom domain is required.**

The lock commit is documentation only and does not change the deployed application, so
production continues to serve `3d4524a` and the criterion stays satisfied without a redeploy.

---

## 3. Completion authority

Personal project. **v1 is complete on Harshit's sign-off alone.** No client, no third party,
no acceptance checklist. Sign-off given 2026-09-19.

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

---

## 5. Gap to the finish line

The **only** remaining work in scope. Everything else is EXTRA.

| # | Item | What makes it VERIFIED |
|---|---|---|
| G1 | **Cardio step 4** — a real 30-minute session on the phone | Every cue on time · total drift < 2s · correct round count logged · survives one deliberate backgrounding. Recorded in README with the date. |
| G2 | **O10** — seven controls below 44px (table below) | Each measured ≥ 44px at 375px |
| G3 | **O11** — offline has never been proven | Load the installed PWA with the network off; the app renders and a set can be logged |
| G4 | **D3** — horizontal-scroll check on `/food`, `/foods`, `/cardio` at 375px | `scrollWidth <= clientWidth` on each |
| G5 | **D4** — empty-state check on every list | Each list screen shows a designed empty state with a next action |
| G6 | **D1** — no hardcoded hex outside `index.css` | A grep returns only token references |

**G2 in full** — v0 of this document said *four*. That was an undercount: I had only measured
the five routes I opened at 375px, so the two Food chips were never looked at. The same
omission is why G4 exists.

| Control | Where | Declared height |
|---|---|---|
| `History` chip | `Train.tsx:223` | 36px — *browser-measured* |
| Suggestion pill | `ExerciseCard.tsx:505` | 36px — *browser-measured* |
| `Why?` | `ExerciseCard.tsx:517` | 36px — *browser-measured* |
| Sync pill | `SyncPill.tsx:52` | 26px — *browser-measured* |
| `Library` chip | `Food.tsx:48` | 36px — from source (`min-h-9`) |
| `Today` chip | `Foods.tsx:60` | 36px — from source (`min-h-9`) |
| Meal-slot filter | `Foods.tsx:75` | 40px — from source (`min-h-10`) |

The 20px checkbox at `Exercises.tsx:338` **passes**: it sits inside a `<label>` with `p-3` and
two lines of text, and the whole label is the tap target.

**The gap is not empty.** G1 is the substantive one; G2–G6 are verification and polish.

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
