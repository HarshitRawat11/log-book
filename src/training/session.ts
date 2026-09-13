import { db } from '../db/db'
import { alive, newRow, putRow } from '../db/mutate'
import { scheduleFlush } from '../db/sync'
import type { Workout } from '../db/types'
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
  const [manual, sets, routineLinks] = await Promise.all([
    db.meta.get(orderKey(workout.id)).then((m) => (m?.value as string[] | undefined) ?? []),
    setsForWorkout(workout.id),
    workout.routine_day_id
      ? db.routine_day_exercises
          .where('routine_day_id')
          .equals(workout.routine_day_id)
          .toArray()
          .then((r) => alive(r).sort((a, b) => a.position - b.position))
      : Promise.resolve([]),
  ])

  const ordered: string[] = []
  for (const id of [
    ...routineLinks.map((r) => r.exercise_id),
    ...manual,
    ...sets.map((s) => s.exercise_id),
  ]) {
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
  opts: { routineDayId?: string | null; exerciseIds?: string[] } = {},
): Promise<Workout> {
  const created = await putRow(
    'workouts',
    newRow({
      date,
      routine_day_id: opts.routineDayId ?? null,
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

export async function removeExerciseFromSession(workoutId: string, exerciseId: string) {
  const current = ((await db.meta.get(orderKey(workoutId)))?.value as string[]) ?? []
  await db.meta.put({ key: orderKey(workoutId), value: current.filter((x) => x !== exerciseId) })
}
