# gymlog

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
| Local store | IndexedDB via Dexie *(Phase 2)* |
| Backend | Supabase (Postgres + Auth), region `ap-south-1` |
| Charts | Recharts *(Phase 4)* |
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
| `npm run icons` | Regenerate `public/icon-*.png` from `scripts/generate-icons.mjs` |

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

*(Implemented in Phase 2. Recorded here now because the schema already assumes it.)*

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
- **Imported history** (the one-time ETL from phone notes) is stamped `source = 'import'`
  with a shared `import_batch_id` on both `workouts` and `sets`, so the entire import can be
  removed with a single statement.
- **`food_log` rows snapshot their macros at the moment of logging.** They are never
  recomputed from the current `foods` row. Correcting a food's macros in November does not
  rewrite August. History is a record, not a view.
- `data/raw-notes.txt` and `data/import-review.csv` are gitignored as personal data. The
  parser and the exercise map are committed, so the import rules stay auditable.

## Units

Kilograms and grams throughout. No unit switcher.

## Deployment

Netlify, site `gymlog-hr` → **https://gymlog-hr.netlify.app**

Deploys are manual and from a local build — there is no git integration and no
CI, deliberately, while the app is still being built out phase by phase:

```bash
npm run build
npx netlify-cli deploy --prod --dir=dist --site=gymlog-hr
```

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

- **Site URL**: `https://gymlog-hr.netlify.app`
- **Redirect URLs**: `https://gymlog-hr.netlify.app/auth/callback`,
  plus `http://localhost:5173/auth/callback` for local development.

## Phase status

- [x] **Phase 0** — plan, schema, screen inventory, outbox design, food-API research
- [x] **Phase 1** — scaffold, schema, RLS, magic-link auth, app shell, PWA
- [ ] **Phase 2** — training: exercises, routines, logging, outbox, progression
- [ ] **Phase 3** — diet: foods, recipes with yield, food log, provider search
- [ ] **Phase 4** — progress: charts, bodyweight, rollups, export, deployment
