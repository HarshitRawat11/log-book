import { db } from '../db/db'
import { getSyncStatus } from '../db/sync'
import { SYNC_TABLES } from '../db/types'

/**
 * A snapshot of app state you can paste to someone trying to help.
 *
 * Deliberately excludes anything secret. No access token, no refresh token, no
 * localStorage dump - only a boolean for whether a session exists. It also
 * omits outbox payload VALUES and sends only their field names: enough to see
 * the shape of a stuck write without pasting a month of training data into a
 * chat window.
 */

export type Diagnostics = Record<string, unknown>

export async function collectDiagnostics(): Promise<Diagnostics> {
  const sync = getSyncStatus()

  const counts: Record<string, number> = {}
  for (const t of SYNC_TABLES) {
    try {
      counts[t] = await db.table(t).count()
    } catch {
      counts[t] = -1
    }
  }

  const outbox = (await db.outbox.toArray()).map((o) => ({
    table: o.table,
    row_id: o.row_id,
    attempts: o.attempts,
    last_error: o.last_error,
    // Field names only - never the values.
    payload_keys: Object.keys(o.payload ?? {}),
    queued_at: new Date(o.created_at).toISOString(),
  }))

  const cursors: Record<string, unknown> = {}
  for (const t of SYNC_TABLES) {
    const row = await db.meta.get(`lastPulled:${t}`)
    if (row) cursors[t] = row.value
  }

  let sw: unknown = 'unsupported'
  try {
    const regs = await navigator.serviceWorker.getRegistrations()
    sw = regs.map((r) => ({
      scope: r.scope,
      active: r.active?.state ?? null,
      waiting: r.waiting?.state ?? null,
      installing: r.installing?.state ?? null,
    }))
  } catch {
    sw = 'error'
  }

  // Android can evict IndexedDB under storage pressure. If sets ever vanish,
  // this is the first thing worth looking at.
  let storage: unknown = 'unsupported'
  try {
    const est = await navigator.storage.estimate()
    storage = {
      usage_mb: est.usage ? +(est.usage / 1048576).toFixed(2) : null,
      quota_mb: est.quota ? +(est.quota / 1048576).toFixed(0) : null,
      persisted: (await navigator.storage.persisted?.()) ?? null,
    }
  } catch {
    storage = 'error'
  }

  return {
    generated_at: new Date().toISOString(),
    build: { sha: __BUILD_SHA__, built_at: __BUILD_TIME__ },
    app: {
      url: location.origin,
      // standalone means it is running as an installed PWA rather than a tab.
      display_mode: window.matchMedia('(display-mode: standalone)').matches
        ? 'standalone'
        : 'browser',
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      // Local calendar date, to catch a timezone mismatch against workouts.date.
      local_date: new Date().toLocaleDateString('en-CA'),
      user_agent: navigator.userAgent,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
    },
    auth: { has_session: Object.keys(localStorage).some((k) => k.startsWith('sb-')) },
    sync: {
      online: navigator.onLine,
      pending: sync.pending,
      stuck: sync.stuck,
      flushing: sync.flushing,
      last_error: sync.lastError,
      last_synced_at: sync.lastSyncedAt ? new Date(sync.lastSyncedAt).toISOString() : null,
    },
    row_counts: counts,
    outbox,
    pull_cursors: cursors,
    service_workers: sw,
    storage,
  }
}

export function formatDiagnostics(d: Diagnostics): string {
  return JSON.stringify(d, null, 2)
}
