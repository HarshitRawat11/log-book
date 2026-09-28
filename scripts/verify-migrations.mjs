/**
 * Applies every migration to a real Postgres 17 and checks the invariants the
 * security model rests on. Run with `npm run verify:migrations`.
 *
 * Why this exists alongside `src/db/schema.test.ts`: that test READS the
 * migration SQL with regexes, so it runs in vitest on any machine with no
 * Docker and catches shape mistakes cheaply. It cannot catch anything Postgres
 * only discovers at execution time - a constraint that does not compile, an
 * `alter table` against a column that was renamed two migrations earlier, a
 * policy that references a missing function. This script runs the SQL.
 *
 * It also proves the one thing the deployed app cannot prove about itself: that
 * RLS actually isolates one user's rows from another's. Against the live
 * project a signed-out read returns zero rows, but zero rows is also what a
 * typo returns, and RLS answers 42501 BEFORE any constraint error - so from the
 * client you cannot tell a working policy from a broken query. Here the harness
 * holds both identities and can watch the rows disappear.
 *
 * Zero dependencies: the docker CLI and psql inside the container do the work.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')
const PRELUDE = join(ROOT, 'supabase', 'test', 'prelude.sql')

const IMAGE = 'postgres:17'
const NAME = `logbook-verify-${process.pid}`
const DB = 'logbook'

const USER_A = '11111111-1111-4111-8111-111111111111'
const USER_B = '22222222-2222-4222-8222-222222222222'

let failures = 0

const sh = (args, opts = {}) =>
  execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts })

/**
 * Run SQL inside the container. Throws with psql's own message on error.
 *
 * `tuples` adds -t -A: rows only, unaligned. Without it a scalar query comes
 * back wrapped in a column header, a rule of dashes and "(1 row)", and every
 * comparison against it fails for reasons that have nothing to do with the
 * schema.
 */
function psql(sql, { quiet = true, tuples = false } = {}) {
  const args = ['exec', '-i', NAME, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', DB]
  if (quiet) args.push('-q')
  if (tuples) args.push('-t', '-A')
  args.push('-X')
  try {
    return sh(args, { input: sql })
  } catch (e) {
    const msg = [e.stderr, e.stdout].filter(Boolean).join('\n').trim()
    throw new Error(msg || e.message)
  }
}

/**
 * A single scalar. Takes the LAST non-empty line, because a query preceded by
 * `set role` / `set request.jwt.claim.sub` emits a SET acknowledgement first.
 */
const scalar = (sql) => {
  const rows = psql(sql, { quiet: true, tuples: true })
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  return rows[rows.length - 1] ?? ''
}

function step(label, fn) {
  process.stdout.write('  ' + label.padEnd(52) + ' ')
  try {
    const note = fn()
    console.log(note ? String(note) : 'ok')
  } catch (e) {
    failures++
    console.log('FAILED')
    for (const line of String(e.message).split('\n').slice(0, 6)) console.log('      ' + line)
  }
}

function cleanup() {
  try { sh(['rm', '-f', NAME]) } catch { /* already gone */ }
}

// ---------------------------------------------------------------- preflight
try {
  sh(['info', '--format', '{{.ServerVersion}}'])
} catch {
  console.error('Docker is not reachable. Start Docker Desktop and try again.')
  console.error('If it is running but wedged, `wsl --shutdown` then restart it.')
  process.exit(2)
}

console.log(`${IMAGE} · container ${NAME}`)
process.on('exit', cleanup)
process.on('SIGINT', () => { cleanup(); process.exit(130) })

// ------------------------------------------------------------------- set up
sh(['run', '-d', '--name', NAME, '-e', 'POSTGRES_PASSWORD=verify', '-e', `POSTGRES_DB=${DB}`, IMAGE])

let ready = false
for (let i = 0; i < 60; i++) {
  try {
    sh(['exec', NAME, 'pg_isready', '-U', 'postgres', '-d', DB])
    ready = true
    break
  } catch {
    execFileSync(process.execPath, ['-e', 'setTimeout(()=>{},1000)'], { stdio: 'ignore' })
  }
}
if (!ready) {
  console.error('Postgres never became ready.')
  process.exit(1)
}

// ---------------------------------------------------------------- migrations
step('prelude (Supabase stand-in)', () => psql(readFileSync(PRELUDE, 'utf8')) && 'ok')

const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
if (files.length === 0) {
  console.error('No migrations found in supabase/migrations.')
  process.exit(1)
}
for (const f of files) {
  step(f, () => psql(readFileSync(join(MIGRATIONS, f), 'utf8')) && 'ok')
}

// ---------------------------------------------------------------- invariants
console.log('')

step('RLS enabled and forced on every table', () => {
  const total = scalar(`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
                        where n.nspname='public' and c.relkind='r';`)
  const bad = scalar(`select coalesce(string_agg(c.relname, ', '), '')
                      from pg_class c join pg_namespace n on n.oid=c.relnamespace
                      where n.nspname='public' and c.relkind='r'
                        and not (c.relrowsecurity and c.relforcerowsecurity);`)
  if (bad) throw new Error(`not forced on: ${bad}`)
  return `${total}/${total}`
})

step('every table carries the sync columns', () => {
  const bad = scalar(`select coalesce(string_agg(t.relname, ', '), '')
    from pg_class t join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public' and t.relkind='r' and (
      select count(*) from pg_attribute a
      where a.attrelid=t.oid and not a.attisdropped
        and a.attname in ('user_id','updated_at','deleted_at')) < 3;`)
  if (bad) throw new Error(`missing user_id/updated_at/deleted_at on: ${bad}`)
  return 'ok'
})

step('one user cannot see another\'s rows', () => {
  psql(`insert into auth.users (id) values ('${USER_A}'), ('${USER_B}') on conflict do nothing;`)

  // Superusers bypass RLS entirely, so the check has to run as `authenticated`.
  const asUser = (uid, body) =>
    psql(`set role authenticated;
          set request.jwt.claim.sub = '${uid}';
          ${body}
          reset role;`)

  asUser(USER_A, `insert into exercises (name, muscle_group, equipment,
                    target_rep_min, target_rep_max, load_increment_kg, min_weight_kg)
                  values ('Isolation probe','back','barbell',6,10,2.5,20);`)

  const mine = scalar(`set role authenticated;
                       set request.jwt.claim.sub = '${USER_A}';
                       select count(*) from exercises;`)
  const theirs = scalar(`set role authenticated;
                         set request.jwt.claim.sub = '${USER_B}';
                         select count(*) from exercises;`)

  if (mine !== '1') throw new Error(`owner should see 1 row, saw ${mine}`)
  if (theirs !== '0') throw new Error(`OTHER USER SAW ${theirs} ROWS - RLS is not isolating`)
  return 'owner 1, other 0'
})

// ------------------------------------------------------------------- verdict
console.log('')
if (failures > 0) {
  console.log(`${failures} check${failures === 1 ? '' : 's'} failed.`)
  process.exit(1)
}
console.log(`${files.length} migrations applied, invariants hold.`)
