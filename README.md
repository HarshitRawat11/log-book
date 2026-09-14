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
