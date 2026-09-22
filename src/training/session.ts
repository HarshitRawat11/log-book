import { db } from '../db/db'
import { alive, newRow, patchRow, putRow } from '../db/mutate'
import { scheduleFlush } from '../db/sync'
import type { Workout, WorkoutSet } from '../db/types'
import { setsForWorkout } from './queries'

/**
 * Which exercises are showing in a session, and in what order.
 *
 * The manual part of the order lives in the local-only `meta` table rather than
 * a synced one. It is presentation state: if it were lost you would re-add an
 * exercise, never lose a set. Sets are what sync.
 *
 * Shared by Train (today) and the history detail view, so a past session is
 * edited through exactly the same code path as the current one.
 */

export const orderKey = (workoutId: string) => `session:${workoutId}:exercises`

export async function sessionExerciseIds(workout: Workout): Promise<string[]> {
  const [manual, sets] = await Promise.all([
    db.meta.get(orderKey(workout.id)).then((m) => (m?.value as string[] | undefined) ?? []),
    setsForWorkout(workout.id),
  ])

  const ordered: string[] = []
  for (const id of [...manual, ...sets.map((s) => s.exercise_id)]) {
    if (!ordered.includes(id)) ordered.push(id)
  }
  return ordered
}

/**
 * Create a session on any date.
 *
 * Nothing stops two sessions sharing a date - there is no unique constraint on
 * workouts.date and there should not be. A second session in a day is unusual
 * but legitimate, and forcing one per day would silently swallow the second.
 */
export async function createWorkout(
  date: string,
  opts: { exerciseIds?: string[]; name?: string | null } = {},
): Promise<Workout> {
  const created = await putRow(
    'workouts',
    newRow({
      date,
      // The column stays - dropping it needs a migration and it costs nothing -
      // but nothing writes a value any more. The routine tables it pointed at
      // were never writable; see the note on SYNC_TABLES.
      routine_day_id: null,
      // Repeating a session carries its name across: "Pull" repeated is still
      // Pull, and retyping it every time is exactly the friction that would
      // stop the names being there at all.
      name: opts.name?.trim() || null,
      notes: null,
      started_at: new Date().toISOString(),
      finished_at: null,
      source: 'app' as const,
      import_batch_id: null,
    }),
  )
  if (opts.exerciseIds?.length) {
    await db.meta.put({ key: orderKey(created.id), value: opts.exerciseIds })
  }
  scheduleFlush()
  return created
}

/** Every session on a date, oldest first, so "session 1 / 2" reads naturally. */
export async function workoutsOnDate(date: string): Promise<Workout[]> {
  return alive(await db.workouts.where('date').equals(date).toArray()).sort((a, b) =>
    (a.started_at ?? '') < (b.started_at ?? '') ? -1 : 1,
  )
}

export async function addExerciseToSession(workoutId: string, exerciseId: string) {
  const current = ((await db.meta.get(orderKey(workoutId)))?.value as string[]) ?? []
  if (current.includes(exerciseId)) return
  await db.meta.put({ key: orderKey(workoutId), value: [...current, exerciseId] })
}

/**
 * Write the whole order, making it authoritative.
 *
 * sessionExerciseIds merges the stored order with the exercises that have sets,
 * appending anything not already listed - so storing every id is what makes a
 * drag stick. Storing only the ones that were moved would leave the rest to be
 * appended in set order and the list would spring back.
 */
export async function reorderSessionExercises(workoutId: string, exerciseIds: string[]) {
  await db.meta.put({ key: orderKey(workoutId), value: exerciseIds })
}

export async function removeExerciseFromSession(workoutId: string, exerciseId: string) {
  const current = ((await db.meta.get(orderKey(workoutId)))?.value as string[]) ?? []
  await db.meta.put({ key: orderKey(workoutId), value: current.filter((x) => x !== exerciseId) })
}


/**
 * Which card should be open when a session is first rendered.
 *
 * The exercise you most recently logged against, falling back to the first in
 * the list. Reopening the app four lifts into a session and landing back on
 * lift one would be exactly wrong, and "most recently written" is the only
 * signal that survives a reload - nothing tracks what you were looking at.
 *
 * Editing an old set moves the open card to that exercise, which is not a bug:
 * you edited it, so it is the one you are looking at.
 */
export function defaultActiveExercise(
  inSessionIds: readonly string[],
  sets: readonly WorkoutSet[],
): string | null {
  if (inSessionIds.length === 0) return null
  let best: WorkoutSet | undefined
  for (const s of sets) {
    if (!inSessionIds.includes(s.exercise_id)) continue
    if (!best || s.updated_at > best.updated_at) best = s
  }
  return best?.exercise_id ?? inSessionIds[0]!
}


/**
 * Close a session, which is the only thing that gives it a duration.
 *
 * `finished_at` has existed since the initial schema and nothing had ever
 * written to it - every session in the database claims to still be running.
 * Pairing it with `started_at`, which is stamped at creation, is what turns
 * "15 working sets" into "15 working sets in 52 minutes".
 *
 * Reversible on purpose. Finishing is a thing you do on the way out of the
 * gym, so doing it one lift early is normal; reopening costs a tap and
 * re-finishing re-stamps.
 */
export async function finishWorkout(workoutId: string) {
  await patchRow<Workout>('workouts', workoutId, { finished_at: new Date().toISOString() })
  scheduleFlush()
}

export async function reopenWorkout(workoutId: string) {
  await patchRow<Workout>('workouts', workoutId, { finished_at: null })
  scheduleFlush()
}
