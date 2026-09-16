# log-book

A single-user, installable PWA for logging resistance training and daily food intake, and
for seeing whether any of it is working.

One user. No sharing, no multi-tenancy. Optimised for speed of daily use on a phone with
one hand free, and for being easy to change later.

## Stack

| Layer | Choice |
|---|---|
| Build | Vite 8 |
| UI | React 18 + TypeScript |
| Styling | Tailwind CSS 4 |
| Routing | React Router 7 |
| Local store | IndexedDB via Dexie |
| Backend | Supabase (Postgres + Auth), region `ap-south-1` |
| Charts | Recharts |
| PWA | `vite-plugin-pwa` (Workbox) |

React 18 rather than 19 is deliberate: it is what the project brief specifies, and it has
the deepest documentation coverage, which matters more here than a newer runtime.

## Running it

```bash
npm install
cp .env.local.example .env.local   # then fill in your Supabase URL and anon key
npm run dev
```

| Script | Does |
|---|---|
| `npm run dev` | Dev server on :5173, service worker enabled |
| `npm run build` | Typecheck, then production build |
| `npm run preview` | Serves `dist/` on :4173 — the only way to see real chunking |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest, run once |
| `npm run icons` | Regenerate `public/icon-*.png` from `scripts/generate-icons.mjs` |
| `npm run ifct` | Regenerate `src/data/ifct.json` from the IFCT 2017 source |

## Security model

**The Supabase anon key is public.** It ships inside the JS bundle and anyone can read it
out of devtools. This is normal and expected — it identifies the project, it does not
authorise anything. The database is protected by Row Level Security, and by nothing else.

- RLS is enabled *and forced* on every table, without exception.
- Every table carries `user_id uuid default auth.uid()`, with a single `FOR ALL` policy
  granted `TO authenticated` and gated on `auth.uid() = user_id`. Because no policy is
  granted to the `anon` role, a signed-out read returns zero rows rather than an error.
- The `service_role` key appears nowhere in this repo, in `.env.local`, or in any build
  output. It bypasses RLS completely. It must never be referenced from `src/`.
- Auth is Supabase magic-link email using the PKCE flow, single account, no passwords and
  no social providers.

## Sync model

Writes are offline-first through an outbox. Every mutation writes to IndexedDB and appends
to a local queue in one transaction; the UI re-renders from local state and never blocks on
the network. A background flusher drains the queue to Supabase when connectivity allows.

Two consequences are already visible in the schema:

- **Primary keys are client-generated UUIDs**, so retrying an ambiguous write is an upsert
  onto the same row rather than a duplicate set.
- **Nothing is ever hard-deleted.** Deletion sets `deleted_at`. A hard `DELETE` cannot be
  replicated through the outbox — the row simply reappears on the next pull.
- **The outbox keys each row on that table's real primary key**, via `pkOf()` in `db/types`.
  Everything is keyed by `id` except `profile`, which is keyed by `user_id` and has no `id`
  column at all.

### Why pkOf exists, and the test that guards it

The outbox originally assumed `id` everywhere, so the targets screen invented one for
`profile` to satisfy it — and Supabase rejected every push with
`PGRST204: Could not find the 'id' column of 'profile'`. Macro targets saved locally and
never once reached the server, retrying quietly into the backoff. The app looked fine. That
is the worst shape a sync bug can take, and it survived a whole phase.

Nothing in TypeScript can catch this: types are erased, and the mismatch exists only between
our payload and Postgres. `db/schema.test.ts` reads the migration SQL instead and asserts
that `pkOf` names a column which actually exists, that `profile` has no `id`, that every
other synced table does, and that all of them carry `user_id`, `updated_at` and `deleted_at`.

### Accepted limitation: last-write-wins

Conflict resolution is **last-write-wins on `updated_at`**, which is set by the client.

Two devices editing the same row while both offline will silently lose one of the edits.
A device with a wrong clock can make an older edit win. There is no merge UI and no
conflict prompt, by design.

This is acceptable *only* because there is one user, realistically on one device at a time.
It is a known limitation, not an oversight. If a real conflict ever occurs, revisit it then
— do not pre-emptively build CRDTs for it.

## Data provenance

- **Training and food entries** are yours, stored in your own Supabase project.
- **History is entered by hand.** A one-time ETL from two months of phone notes was attempted
  and abandoned — see below.
- **`food_log` rows snapshot their macros at the moment of logging.** They are never
  recomputed from the current `foods` row. Correcting a food's macros in November does not
  rewrite August. History is a record, not a view.
- Anything under `data/*.txt`, plus `data/import-review.csv`, is gitignored as personal data.

### The abandoned import

A parser was written and run against a representative session before this was called off, so
the reasoning is on the record rather than a matter of taste.

It put **18 of 18 rows in `ambiguous`** — correctly. The notes carry no dates at all, and
`workouts.date` is `not null`, so no session can be placed. Beyond that: per-side drop sets
are written on one line (`10 kg - 4, 5 kg - 6 R, 10 kg - 6, 5 kg - 4 L`) with no side or
drop-set column to receive them; machine settings ride inside the exercise name
(`Peck deck fly w 1 seat and 3 pin`), which forks one exercise into two the week a seat
position changes; and warm-ups are unmarked, so every set would import as a working set and
feed the progression engine.

None of that is a parser bug. The information genuinely is not in the text, and a rule that
guesses at it produces plausible wrong numbers instead of visible gaps. Reviewing two months
of that by hand costs more than retyping the sessions, so history is backfilled through
**History → pick a date**.

`source` and `import_batch_id` remain on `workouts` and `sets`. They cost nothing, and they
are the right shape if a bulk load is ever worth doing.

## What counts as a set

A set row carries `is_warmup` and a `set_type` of `normal`, `dropset` or `myorep`. A drop or
a myorep mini-set is a **continuation** of the set logged before it, not a set of its own —
which is what lets counting work without a grouping id. The single definition lives in
`isWorkingSet` (`db/types.ts`), and everything counts through it:

| | counted as a set | tonnage |
|---|---|---|
| `normal` | yes | yes |
| `dropset`, `myorep` | **no** | **yes** |
| warm-up | no | no |

So a top set with three drops is one working set on the weekly chart, but all four rows'
weight × reps land in tonnage — the reps were genuinely performed. Drops and myoreps are
also kept out of progression and estimated 1RM: a drop to 18kg is not a top set, and letting
one in would drag both down after a session that was in fact harder than usual.

The database enforces the pairing (`warmup_is_normal`), and the logging screen offers the
four as one exclusive choice rather than a checkbox plus a dropdown, so the combinations the
constraint rejects cannot be expressed.

**Pre-fill follows the same rule.** `repeatOf` takes the last *working* set, not simply the
last row logged. It took the highest `set_index` outright at first, so the set after a drop
to 20kg pre-filled at 20kg — but a drop is a continuation and the weight being worked at is
still 36, so every set following a drop would have needed correcting by hand.

## Cardio: the interval timer

Built around one constraint: **no screen contact between start and end.** Hands are wrapped
and gloved from the moment a session starts, so if a design needs a tap mid-session to keep
working, the design is wrong. Audio is the primary output, and there is no recovery path —
a timer that drifts or stalls cannot be nudged back into life.

### Nothing counts down

The schedule is **absolute timestamps**, computed once at the start tap, for the whole
session. The display is derived: take `Date.now()`, find the phase it falls in, subtract.
If the main thread freezes for eight seconds and wakes late, the next render is simply
correct, because nothing was being counted.

Every cue for the entire session is handed to the **AudioContext clock** at the start tap.
That clock runs independently of the main thread, so a throttled or frozen page cannot make
a bell late.

Measured on the device during the spike: the audio clock tracked wall time to **10ms across
73 seconds** while main-thread events arrived 1.2s late by the end. That gap is the whole
architecture.

### What the spike settled

Pre-scheduled Web Audio **survived the screen going off** on the Redmi — all six cues of a
70-second run sounded. So there is no keepalive tone and no MediaSession element, both of
which were on the table and both of which would have been heavier.

Worth recording why the obvious workaround is not used: the widely-repeated trick is a
zero-gain oscillator to keep a backgrounded tab alive, and **Chrome deliberately defeats
it** — a tab is only exempt from background throttling while playing audio above a volume
threshold, added precisely to stop pages doing this. If the screen-off case had failed, the
fix would have been genuine media playback, not silence.

### Cues

Synthesised with `OscillatorNode`, so there are no audio assets to source, license or fail
to load. Speech was dropped deliberately: `speechSynthesis` does not schedule on the audio
clock, is throttled when the tab loses focus, and on Chrome Android its boundary events do
not fire at all.

| cue | when |
|---|---|
| ascending bell 880→1320 | round start |
| three clicks at 1660 | 10s before a round ends — **rounds only** |
| descending bell 740→494 | round end |
| three ticks at 1200 | last three seconds of a break, leading into the round |
| flourish | session end |

Start ascends and end descends: mid-combo and not looking at the bench, the *direction* of
the sound is the only thing that says which way the transition went. Fundamentals sit
between 500Hz and 1.7kHz with a 4ms attack, because a phone speaker rolls off below ~500Hz
and a sine at speaker volume disappears under a heavy bag.

### The running screen

Full-screen colour carries the state. The pair was measured, not chosen by eye — a first
attempt looked obviously different on screen but came out at **2.31:1 under protanopia**:

| | normal | protanopia | deuteranopia | tritanopia |
|---|---|---|---|---|
| `#ef6c00` work vs `#06283d` rest | 4.94:1 | 4.31:1 | 6.08:1 | 4.92:1 |

The separation is carried by lightness as much as hue, which is what makes it survive. A
red/green pair would not. Identity is never colour alone regardless: the word WORK or REST
is on screen, and a progress bar reads before the numerals do at three metres.

Tap anywhere pauses — and **pause plays its own sound**, because a stray glove that pauses
you at minute twenty is otherwise discovered by still throwing punches. Ending needs a
sustained two-second hold on top of that, so a knocked phone costs at most a pause.

### What is logged

The session row is written **at the start**, not the end, so a session the OS kills at
minute twenty still exists. The active schedule is persisted locally, so reopening the app
lands straight back in the running session at the correct point — it asks for one tap to
re-arm audio, which a browser will not unlock without a gesture.

A session ended early is logged with `completed = false` and the rounds actually finished.
The interval configuration is **snapshot onto the row**, with no `preset_id`: editing the
kickboxing preset in December must not rewrite what October's sessions claim to have been.

**Work minutes count `rounds_completed` and exclude breaks.** Forty minutes on the clock
with 2:00 rests is thirty minutes of work, and counting the clock would flatter every week.

### Fast-forward

`?speed=N` on `/cardio` compresses a session so a whole multi-round cycle is verifiable in
under a minute — a URL parameter rather than a control, so it never clutters a screen used
with gloves on. Both the schedule *and* the cue offsets scale, so a fast run rehearses the
real cue structure rather than a reduced one. The row still records real durations: a ×20
rehearsal must not be logged as fifteen-second rounds.

### Phone settings this depends on

HyperOS is more aggressive than stock Android, and no correct code fixes a device setting:

- **Battery optimisation set to unrestricted** for Chrome, not adaptive.
- **Lock Chrome in the recents list**, so the memory manager does not reclaim it.
- **Allow background activity / autostart**, if listed separately.
- Turn off aggressive battery-saver modes while training.
- **Install as a PWA**, not a browser tab — it gets its own task entry.

## Units

Kilograms and grams throughout. No unit switcher.

## Food data

Two providers behind one interface (`src/food/provider.ts`), so swapping either
is a one-file change:

- **IFCT 2017**, bundled. 528 Indian foods from the Indian Food Composition
  Tables (National Institute of Nutrition, Hyderabad), trimmed at build time to
  the six fields we use — about 10KB gzipped, lazy-loaded. No key, no rate
  limit, no outage. Searched first, and works in a gym basement.
- **Open Food Facts**, remote. Packaged and branded goods only, behind an
  explicit button. Note that a browser cannot set `User-Agent` (forbidden header),
  so we send `X-User-Agent`, which OFF accepts for exactly this reason. Their
  `/api/v2/search` ignores `search_terms` and returns the whole database, so we
  use `cgi/search.pl`, which actually does full text. Data is ODbL.

**IFCT energy is in kilojoules and the source documents no units at all.** The
kJ→kcal conversion was inferred by arithmetic against foods with known values
and is pinned by both a build-time tripwire in `scripts/generate-ifct.mjs` and a
test. If a regenerated dataset ever ships raw kJ, every calorie in the app would
silently become 4.184× too large — plausible enough on one row to go unnoticed
for weeks.

Anything a provider returns is cached into the local `foods` table on first use,
so the library becomes self-sufficient.

## Deleting, and what survives it

Deletion is a tombstone, so the question is always what still *reads* the deleted row. The
rule throughout: **removing something from the library never rewrites what it was part of.**

- **A deleted food stays in the recipes that use it.** `refreshRecipeDerived` reads
  `db.foods` directly rather than `listFoods()`, which filters tombstones. It did not, so
  deleting a food quietly removed it from every recipe using it — not immediately, but the
  next time that recipe was edited and its totals recomputed. Delete ghee, add a tomato to
  the curry a week later, and the curry silently loses the ghee's calories entirely — the
  pinned case in `macros.test.ts` drops from 105 to 60 kcal/100g. Every portion logged from
  it afterwards is wrong, and plausibly wrong, which is what made it dangerous.
- **An archived or deleted exercise stays in past sessions.** History, session detail, Train
  and the weekly volume chart resolve through `listAllExercises()`; only pickers use the
  filtered list. They all used the filtered list once, and dropped what they could not find,
  so archiving a lift emptied the sessions containing it. A session with three real sets
  rendered as *"Nothing logged in this session — add an exercise, or delete the session
  below"*, with the sets sitting in the database the whole time.
- **Logged entries are never affected by either**, because `food_log` carries its own macro
  snapshot.

Archiving means stop offering it today. It cannot mean rewrite last month.

Every destructive action goes through `ConfirmDelete`, which states what is actually lost —
ingredient counts, set counts — and what is not. Foods, recipes and exercises deleted on a
single tap until that existed; only sessions asked. Deleting an exercise points at archiving
as the gentler option, since that keeps the 1RM chart.

## Charts

Four views, each answering one question. Formulas are exactly the three the
brief specifies:

- **Estimated 1RM** per exercise — Epley, `weight × (1 + reps/30)`, taking the
  best set of each session. Labelled an estimate in the UI, with the caveat that
  accuracy degrades above ~10–12 reps. A single rep returns the weight itself
  rather than the formula's inflated 1.033×.
- **Session tonnage** — `Σ (weight × reps)` across working sets, warm-ups excluded.
- **Weekly working sets** per muscle group, by ISO week. Called *working* sets,
  not "hard" sets: in the literature a hard set means one taken near failure, and
  since RIR is optional here that cannot be filtered on honestly.
- **Bodyweight** with a 7-day moving average, computed over a 7-day *window*
  rather than the last 7 readings — so a gap in weighing widens the window
  instead of silently averaging across three weeks.

Series colours are fixed validated slots (`--series-1..7` in `index.css`),
assigned by slot and never cycled. They pass lightness-band, chroma, adjacent-pair
CVD separation, normal-vision and contrast checks against both card surfaces. In
light mode three slots fall below 3:1 on white, so the stacked chart ships a
**table view** as relief. A ninth muscle group is never given a generated hue —
past six, series fold into "Other".

## Bundle

Train is the only eager route. Everything else is a `lazy()` chunk, and the two stable
vendor groups (`vendor-react`, `vendor-data`) are pinned in `vite.config.ts`.

| | raw | gzip |
|---|---|---|
| Boot JS, one chunk (before) | 969 kB | 279 kB |
| Boot JS, split | **529 kB** | **159 kB** |
| ...of which our own code | 29 kB | 9 kB |
| Progress, on demand | 385 kB | 110 kB |

**The point is update size, not download size.** Workbox precaches every chunk either way,
so an install still fetches the lot — and that is what keeps the lazy routes working
offline. What changed is that Workbox revisions each file separately: as one bundle, any
edit re-downloaded 279 kB onto the phone at every deploy. Split, a normal change to app
code moves ~9 kB and the vendor chunks stay put in the cache.

### The build has to be reproducible for any of that to be true

It was not, for a while, and the claim above was wrong the whole time.

`__BUILD_TIME__` was `new Date().toISOString()`. A `define` is substituted at transform
time, so a fresh timestamp on every build changed the hash of every app chunk on every
build — **two builds of the same commit produced entirely different filenames**. The vendor
chunks held, since node_modules is not transformed with defines, but every route chunk was
re-downloaded on every deploy whether or not a line of it had changed.

Caught by a docs-only commit moving eleven chunk hashes, then confirmed by building the same
source twice and diffing. It is now keyed to the commit (`git log -1 --format=%cI`), which
is as informative and is stable — hence the Settings row reading **Committed** rather than
Built. Two builds of one commit are now identical, verified the same way.

Anything else added to `define` must be a function of the commit, not of the moment.

The measurement that drove it, from a throwaway build that split every package apart:
Recharts is 255 kB raw, and drags in d3 (~60 kB), its own redux (~28 kB), `es-toolkit`
(14 kB) and `decimal.js-light` (13 kB) — about 370 kB, a third of the bundle, to draw a
screen opened once a week. Only `Progress` imports it, so it now rides in that chunk.

**Known, not done:** `supabase-js` eagerly constructs a realtime client, so
`realtime-js` + `phoenix` + `storage-js` + `functions-js` — about 87 kB raw, 25 kB gzipped
of features this app never uses — sit in the boot path and will not tree-shake. Removing
them means dropping the umbrella package for `auth-js` + `postgrest-js` directly, which is
a rewrite of the auth path for 25 kB on a bundle that is precached anyway. Not worth the
risk to the one flow that must never break.

## Deployment

Netlify, site `log-book-hr` → **https://log-book-hr.netlify.app**

(`log-book.netlify.app` was already taken by someone else, hence the suffix.)

Deploys are manual and from a local build — there is no git integration and no
CI, deliberately, while the app is still being built out phase by phase:

```bash
git commit ...      # commit FIRST: the build stamps git HEAD into the bundle
npm run build
npx netlify-cli deploy --prod --dir=dist --site=d30fc361-f894-43cd-89f2-9b2e7a38200b
```

`--site` takes the project **ID**, not the name. Passing `log-book-hr` fails with
`Failed retrieving site data ... Not Found`, which reads like a login problem and is not
one — `netlify-cli status` will happily confirm you are signed in. `netlify-cli sites:list`
prints the ID.

### If `--prod` returns `JSONHTTPError: Forbidden`

Seen on 14 Sep 2026, after several successful deploys the same day. The account is fine —
still signed in, site `state: current`, no stuck deploy, nothing over its limit — and a
**draft deploy of the identical directory succeeds**. Only the production publish is
refused, so it is something server-side rather than anything in this repo.

Deploy as a draft, verify it, then promote that deploy id:

```bash
npx netlify-cli deploy --dir=dist --site=<site-id>        # prints a deploy id + preview URL
npx netlify-cli api restoreSiteDeploy --data '{"site_id":"<site-id>","deploy_id":"<id>"}'
```

The promoted deploy serves correctly at the production URL, but keeps
`context: deploy-preview` in the API, so do not read that field as evidence of what is
live — check `getSite`'s `published_deploy.id`, or just fetch the build stamp.

Settings shows that stamp. With `registerType: 'prompt'` a phone keeps serving
the old bundle until the update pill is tapped, so "the screen looks wrong" and
"I am on last week's build" are otherwise indistinguishable. Settings also has a
**Check for updates** button as the manual escape hatch.

`netlify.toml` carries the parts that are easy to get wrong:

- **SPA rewrite** (`/* → /index.html 200`). Without it `/auth/callback` 404s,
  which breaks every magic link, since that is the URL the email points at.
- **`Content-Type` for `/manifest.webmanifest`.** Netlify does not recognise the
  extension and serves it as `application/octet-stream`; Chrome then ignores the
  manifest and silently drops the install prompt, with no error anywhere.
- **`Cache-Control: must-revalidate` on `/sw.js` and `/index.html`**, so a deploy
  actually reaches a phone that already registered the old service worker.
- **CSP** pinning `connect-src` to Supabase and Open Food Facts.

Note that new sites on this Netlify account inherit `site_sso_login = true` from
the account default, which puts them behind an SSO gate and returns 401 to
everyone. This site has `sso_login` disabled at site level; the account default
is untouched, so any *new* site will need the same treatment.

### Supabase auth URLs

Magic links only work for origins Supabase knows about. In
**Authentication → URL Configuration**:

- **Site URL**: `https://log-book-hr.netlify.app`
- **Redirect URLs**: `https://log-book-hr.netlify.app/auth/callback`,
  plus `http://localhost:5173/auth/callback` for local development.

## Phase status

- [x] **Phase 0** — plan, schema, screen inventory, outbox design, food-API research
- [x] **Phase 1** — scaffold, schema, RLS, magic-link auth, app shell, PWA, deployed and installed
- [x] **Phase 2** — training: exercise library, logging, set editing, outbox and sync, progression,
      repeat-a-session
- [x] **Phase 3** — diet: foods, recipes with yield, food log, targets, provider search
- [x] **Phase 4** — progress: charts, bodyweight, weekly rollups, export, deployed

All seven v1 acceptance criteria are met. The historical import is **not being done** — history
is typed in by hand, for the reasons under data provenance above.

- [x] **Phase 5, step 0** — research; three of the specified assumptions confirmed, one corrected
- [x] **step 1** — schema, presets, config screen; signed-out reads proven to return zero rows
- [x] **step 2** — timer engine; full 8-round cycle verified in 46s at `?speed=5`
- [x] **step 3** — session screen, notes and RPE, Progress charts, CSV export
- [ ] **step 4** — a real 30-minute session on the phone. **Not yet run.** Until it is, the
      timer is unproven where it matters: cue accuracy over thirty unattended minutes, total
      drift under two seconds, and surviving a backgrounding mid-session.
