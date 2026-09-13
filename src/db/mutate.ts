import { db } from './db'
import type { SyncTable, SyncedRow } from './types'

/**
 * The write path.
 *
 * Every mutation writes the entity AND appends to the outbox inside ONE Dexie
 * transaction. A crash between the two is therefore impossible: you cannot end
 * up with a set that exists locally but will never sync, nor a queued push for
 * a row that was never written.
 *
 * Nothing here awaits the network. The UI re-renders from the local write.
 */

let currentUserId: string | null = null

/** Set by AuthProvider whenever the session changes. */
export function setCurrentUserId(id: string | null) {
  currentUserId = id
}

export function requireUserId(): string {
  if (!currentUserId) throw new Error('No signed-in user; refusing to write a row without user_id')
  return currentUserId
}

export function newId(): string {
  return crypto.randomUUID()
}

export function nowIso(): string {
  return new Date().toISOString()
}

/**
 * Fills in the four columns every synced row carries, so callers only supply
 * the fields that are actually theirs. Returns `T & SyncedRow`, which means
 * call sites get a fully typed row back and need no cast.
 */
export function newRow<T extends object>(fields: T): T & SyncedRow {
  return {
    id: newId(),
    user_id: requireUserId(),
    updated_at: nowIso(),
    deleted_at: null,
    ...fields,
  }
}

/**
 * Queue a full-row upsert.
 *
 * Compaction: if this row already has queued ops, they are replaced by this
 * one. Editing a set five times offline pushes once, not five times - and
 * because the payload is whole-row rather than a delta, the newest op alone is
 * a complete description of the intended state.
 */
async function enqueue(table: SyncTable, row: Record<string, unknown>) {
  const rowId = row.id as string
  await db.outbox.where('row_id').equals(rowId).and((op) => op.table === table).delete()
  await db.outbox.add({
    table,
    row_id: rowId,
    payload: row,
    attempts: 0,
    next_attempt_at: 0,
    last_error: null,
    created_at: Date.now(),
  })
}

/** Insert or update a row locally and queue it for push. */
export async function putRow<T extends { id: string }>(table: SyncTable, row: T): Promise<T> {
  const stamped = { ...row, updated_at: nowIso() }
  await db.transaction('rw', db.table(table), db.outbox, async () => {
    await db.table(table).put(stamped)
    await enqueue(table, stamped as unknown as Record<string, unknown>)
  })
  return stamped
}

/** Patch some fields of an existing row. */
export async function patchRow<T extends { id: string }>(
  table: SyncTable,
  id: string,
  patch: Partial<T>,
): Promise<void> {
  await db.transaction('rw', db.table(table), db.outbox, async () => {
    const existing = await db.table(table).get(id)
    if (!existing) throw new Error(`${table}/${id} not found locally`)
    const next = { ...existing, ...patch, updated_at: nowIso() }
    await db.table(table).put(next)
    await enqueue(table, next)
  })
}

/**
 * Soft delete. Sets deleted_at and pushes it like any other change.
 *
 * A hard delete would be wrong here and the bug is subtle: the row would vanish
 * locally, the next pull would not know it was meant to be gone, and it would
 * quietly come back. Tombstones are what make deletion replicate.
 */
export async function deleteRow(table: SyncTable, id: string): Promise<void> {
  await patchRow(table, id, { deleted_at: nowIso() } as never)
}

/** Rows still visible - i.e. not tombstoned. */
export function alive<T extends { deleted_at: string | null }>(rows: T[]): T[] {
  return rows.filter((r) => r.deleted_at === null)
}
