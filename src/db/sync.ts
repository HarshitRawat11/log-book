import { db } from './db'
import { supabase } from '../lib/supabase'
import { SYNC_TABLES, pkOf, type SyncTable } from './types'

/**
 * Outbox flusher and pull/reconcile.
 *
 * Design notes that are easy to lose and expensive to rediscover:
 *
 *  - Flush order follows SYNC_TABLES (parents before children). Pushing a `set`
 *    before its `workout` exists server-side fails on a foreign key.
 *  - Push happens BEFORE pull on reconnect, so local truth goes up first and
 *    the merge below stays simple.
 *  - A row with a queued op always wins a pull. That is the rule that stops a
 *    background pull clobbering sets you just logged on the gym floor.
 *  - Upserts are idempotent because ids are client-generated, so retrying an
 *    ambiguous timeout cannot duplicate a set.
 */

/**
 * What is wrong with the oldest stuck write.
 *
 * Carried on the status so the pill can SAY it. "1 stuck" on its own sent one
 * real problem - a duplicate exercise name - unnoticed for two days, because
 * the only place the reason existed was Settings -> Diagnostics, and nothing
 * on screen suggested looking there.
 */
export type StuckDetail = {
  table: SyncTable
  attempts: number
  /** Verbatim from Postgres. Guessing at a friendlier wording would lose the
   *  constraint name, which is the part that identifies the problem. */
  error: string | null
}

export type SyncStatus = {
  online: boolean
  pending: number
  flushing: boolean
  /** Ops that have failed repeatedly and need a human to look. */
  stuck: number
  /** The oldest stuck op. Null when nothing is stuck. */
  stuckDetail: StuckDetail | null
  lastError: string | null
  lastSyncedAt: number | null
}

type Listener = (s: SyncStatus) => void

const listeners = new Set<Listener>()
let status: SyncStatus = {
  online: navigator.onLine,
  pending: 0,
  flushing: false,
  stuck: 0,
  stuckDetail: null,
  lastError: null,
  lastSyncedAt: null,
}

function emit(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch }
  listeners.forEach((l) => l(status))
}

export function subscribeSync(l: Listener): () => void {
  listeners.add(l)
  l(status)
  return () => listeners.delete(l)
}

export function getSyncStatus(): SyncStatus {
  return status
}

async function refreshCounts() {
  const all = await db.outbox.toArray()
  // Oldest first, so the detail names the one that has been failing longest
  // rather than whichever happened to be queued last.
  const stuckOps = all.filter((o) => o.attempts >= 5).sort((a, b) => a.seq! - b.seq!)
  const first = stuckOps[0]
  emit({
    pending: all.length,
    stuck: stuckOps.length,
    stuckDetail: first
      ? { table: first.table, attempts: first.attempts, error: first.last_error }
      : null,
  })
}

/* ------------------------------------------------------------------ push -- */

let flushing = false
/** Set when auth fails, so we stop hammering a server that will keep saying no. */
let haltedForAuth = false

function isAuthError(message: string): boolean {
  return /jwt|token|unauthor|expired|401/i.test(message)
}

export async function flushOutbox(): Promise<void> {
  if (!supabase || flushing || haltedForAuth) return
  if (!navigator.onLine) return

  flushing = true
  emit({ flushing: true })

  try {
    const now = Date.now()

    for (const table of SYNC_TABLES) {
      const ops = await db.outbox
        .where('table')
        .equals(table)
        .and((o) => o.next_attempt_at <= now)
        .sortBy('seq')
      if (ops.length === 0) continue

      // One upsert per table per pass. Supabase takes an array, and the rows
      // within a table have no ordering constraints between them.
      const rows = ops.map((o) => o.payload)
      const { error } = await supabase
        .from(table)
        .upsert(rows, { onConflict: pkOf(table) })

      if (error) {
        if (isAuthError(error.message)) {
          haltedForAuth = true
          emit({ lastError: 'Session expired - sign in again' })
          return
        }
        // Back off this table's ops and move on; a poison row in `sets` should
        // not block `bodyweight` forever.
        await db.transaction('rw', db.outbox, async () => {
          for (const op of ops) {
            const attempts = op.attempts + 1
            await db.outbox.update(op.seq!, {
              attempts,
              last_error: error.message,
              // 2^n seconds, capped at 5 minutes.
              next_attempt_at: Date.now() + Math.min(2 ** attempts * 1000, 300_000),
            })
          }
        })
        emit({ lastError: error.message })
        continue
      }

      await db.outbox.bulkDelete(ops.map((o) => o.seq!))
    }

    emit({ lastError: null, lastSyncedAt: Date.now() })
  } finally {
    flushing = false
    emit({ flushing: false })
    await refreshCounts()
  }
}

/* ------------------------------------------------------------------ pull -- */

async function lastPulledAt(table: SyncTable): Promise<string> {
  const row = await db.meta.get(`lastPulled:${table}`)
  return (row?.value as string) ?? '1970-01-01T00:00:00Z'
}

export async function pullTable(table: SyncTable): Promise<number> {
  if (!supabase || !navigator.onLine || haltedForAuth) return 0

  const since = await lastPulledAt(table)
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .gt('updated_at', since)
    .order('updated_at', { ascending: true })

  if (error) {
    // Without this the pull path ignores the halt that the push path sets, and
    // a dead session turns into twelve failing requests on every visibility
    // change and every interval tick. Observed as 134 consecutive 401s.
    if (isAuthError(error.message)) {
      haltedForAuth = true
      emit({ lastError: 'Session expired - sign in again' })
    }
    return 0
  }
  if (!data) return 0

  const pk = pkOf(table)
  let applied = 0

  await db.transaction('rw', db.table(table), db.outbox, db.meta, async () => {
    for (const remote of data as Record<string, unknown>[]) {
      const id = remote[pk] as string

      // A row with a queued local write always wins. It is about to be pushed,
      // and the pulled copy is by definition older than the edit in hand.
      const queued = await db.outbox
        .where('row_id')
        .equals(id)
        .and((o) => o.table === table)
        .count()
      if (queued > 0) continue

      const local = (await db.table(table).get(id)) as Record<string, unknown> | undefined
      if (local && String(local.updated_at) >= String(remote.updated_at)) continue

      await db.table(table).put(remote)
      applied++
    }

    if (data.length > 0) {
      const newest = String((data[data.length - 1] as Record<string, unknown>).updated_at)
      // Rewind slightly. Clocks are not perfectly aligned and rows written in
      // the same millisecond can be returned across two pages; a few seconds of
      // overlap costs one redundant compare and avoids missing a row entirely.
      const overlapped = new Date(new Date(newest).getTime() - 5000).toISOString()
      await db.meta.put({ key: `lastPulled:${table}`, value: overlapped })
    }
  })

  return applied
}

export async function pullAll(): Promise<number> {
  let total = 0
  for (const table of SYNC_TABLES) total += await pullTable(table)
  emit({ lastSyncedAt: Date.now() })
  return total
}

let syncing = false

/**
 * Push first, then pull. Order matters - see the note at the top.
 *
 * @param manual A sync the user explicitly asked for. This clears an auth halt
 *   and retries: otherwise "Sync now" is a button that does nothing forever
 *   once the session has lapsed, which is worse than having no button.
 */
export async function syncNow(opts: { manual?: boolean } = {}): Promise<void> {
  if (opts.manual) haltedForAuth = false
  // Guards the whole push-then-pull pair. Guarding only the flush let two
  // pulls interleave and race each other's lastPulled cursor.
  if (syncing) return
  syncing = true
  try {
    await flushOutbox()
    await pullAll()
  } finally {
    syncing = false
  }
}

/* --------------------------------------------------------------- wiring -- */

let started = false
let interval: number | undefined
let debounce: number | undefined
/** Kept so stopSync can actually unbind them. */
let teardown: (() => void) | null = null

/** Nudge the flusher shortly after a local write, without spamming it. */
export function scheduleFlush() {
  void refreshCounts()
  window.clearTimeout(debounce)
  debounce = window.setTimeout(() => void flushOutbox(), 1000)
}

export function startSync() {
  if (started) return
  started = true

  const onOnline = () => {
    emit({ online: true })
    void syncNow()
  }
  const onOffline = () => emit({ online: false })
  const onVisible = () => {
    if (document.visibilityState === 'visible') void syncNow()
  }

  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  document.addEventListener('visibilitychange', onVisible)

  // Only ticks while there is something to do.
  interval = window.setInterval(() => {
    if (status.pending > 0) void flushOutbox()
  }, 30_000)

  teardown = () => {
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    document.removeEventListener('visibilitychange', onVisible)
  }

  void refreshCounts()
  void syncNow()
}

export function stopSync() {
  started = false
  haltedForAuth = false
  window.clearInterval(interval)
  // Previously left bound. Sign out and back in and startSync ran again, so
  // every cycle added another set: two listeners, then three, each firing its
  // own syncNow on every visibility change. The single-flight guard made it
  // cheap rather than harmful, which is exactly why it would never have been
  // noticed.
  teardown?.()
  teardown = null
  window.clearTimeout(debounce)
}

/** Called after a successful re-auth. */
export function resumeAfterAuth() {
  haltedForAuth = false
  void syncNow()
}
