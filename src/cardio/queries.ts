import { db } from '../db/db'
import { alive, newRow, putRow } from '../db/mutate'
import { scheduleFlush } from '../db/sync'
import type { CardioPreset, CardioSession } from '../db/types'

/** Reads and writes for cardio, over the local store only. */

export async function listPresets(): Promise<CardioPreset[]> {
  return alive(await db.cardio_presets.toArray()).sort((a, b) => a.name.localeCompare(b.name))
}

export async function listSessions(): Promise<CardioSession[]> {
  return alive(await db.cardio_sessions.toArray()).sort((a, b) =>
    a.started_at < b.started_at ? 1 : -1,
  )
}

/**
 * Which preset the config screen opens on.
 *
 * Kept in the local-only `meta` table, like the session exercise order. It is
 * presentation state: losing it costs one tap, so it does not belong in the
 * outbox or on the server.
 */
const LAST_PRESET = 'cardio:lastPreset'

export async function lastUsedPresetId(): Promise<string | null> {
  return ((await db.meta.get(LAST_PRESET))?.value as string | undefined) ?? null
}

export async function rememberPreset(id: string): Promise<void> {
  await db.meta.put({ key: LAST_PRESET, value: id })
}

export async function savePreset(
  fields: Pick<CardioPreset, 'name' | 'activity' | 'work_seconds' | 'break_seconds' | 'rounds'>,
  existing?: CardioPreset,
): Promise<CardioPreset> {
  const row = existing
    ? { ...existing, ...fields }
    : (newRow(fields) as CardioPreset)
  const saved = await putRow('cardio_presets', row)
  scheduleFlush()
  return saved
}

/**
 * The two presets asked for in the brief, offered rather than auto-created.
 *
 * Silently writing rows on first open would sync two records the user never
 * asked for; one tap each is cheap and leaves the library theirs.
 */
export const STARTER_PRESETS = [
  { name: 'Kickboxing', activity: 'kickboxing', work_seconds: 300, break_seconds: 120, rounds: 6 },
  { name: 'HIIT', activity: 'hiit', work_seconds: 20, break_seconds: 10, rounds: 8 },
] as const

/** Sessions still missing an RPE, newest first - the "rate it later" prompt. */
export async function unratedSessions(): Promise<CardioSession[]> {
  return (await listSessions()).filter((s) => s.rpe === null && s.ended_at !== null)
}
