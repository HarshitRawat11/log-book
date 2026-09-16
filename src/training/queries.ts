import { db } from '../db/db'
import { alive } from '../db/mutate'
import { isWorkingSet, type Exercise, type Workout, type WorkoutSet } from '../db/types'
import type { SessionPerformance } from './progression'

// Defined in db/types so analytics.ts can use it without pulling in Dexie,
// re-exported here because this is where callers expect set predicates to live.
export { isWorkingSet }

/**
 * Derived reads over the local store.
 *
 * All of these hit IndexedDB only. Nothing here touches the network, so every
 * screen renders identically on the gym floor with no signal.
 */

/**
 * EVERY exercise, including archived and tombstoned ones.
 *
 * For resolving names in history, never for a picker. Historical views looked
 * exercises up in the filtered list and dropped whatever they could not find,
 * so archiving a lift removed it - and its sets - from past sessions that
 * genuinely contained it. The sets were still in the database, just invisible.
 *
 * Archiving means stop offering it today. It cannot mean rewrite last month.
 */
export async function listAllExercises(): Promise<Exercise[]> {
  return (await db.exercises.toArray()).sort((a, b) => a.name.localeCompare(b.name))
}

/** Exercises to OFFER: alive, and archived only when asked for. */
export async function listExercises(includeArchived = false): Promise<Exercise[]> {
  const rows = alive(await db.exercises.toArray())
  return rows
    .filter((e) => includeArchived || !e.archived)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function getWorkoutByDate(date: string): Promise<Workout | undefined> {
  const rows = alive(await db.workouts.where('date').equals(date).toArray())
  return rows[0]
}

export async function setsForWorkout(workoutId: string): Promise<WorkoutSet[]> {
  const rows = alive(await db.sets.where('workout_id').equals(workoutId).toArray())
  return rows.sort((a, b) => a.set_index - b.set_index)
}

/**
 * Recent sessions for one exercise, most recent first, WORKING SETS ONLY.
 *
 * This is what the progression engine and the 1RM chart consume, so the filter
 * lives here rather than being everyone's responsibility to remember.
 *
 * Drops and myorep mini-sets are excluded along with warm-ups: a drop to 18kg
 * is not a top set, and letting one in would drag both the suggestion and the
 * estimated 1RM down after a session that was actually harder than usual.
 */
export async function recentSessions(
  exerciseId: string,
  opts: { limit?: number; excludeWorkoutId?: string } = {},
): Promise<SessionPerformance[]> {
  const { limit = 5, excludeWorkoutId } = opts

  const sets = alive(await db.sets.where('exercise_id').equals(exerciseId).toArray()).filter(
    (s) => isWorkingSet(s) && s.workout_id !== excludeWorkoutId,
  )
  if (sets.length === 0) return []

  const workoutIds = [...new Set(sets.map((s) => s.workout_id))]
  const workouts = alive(await db.workouts.bulkGet(workoutIds).then((w) => w.filter(Boolean) as Workout[]))
  const dateOf = new Map(workouts.map((w) => [w.id, w.date]))

  const byWorkout = new Map<string, WorkoutSet[]>()
  for (const s of sets) {
    if (!dateOf.has(s.workout_id)) continue // workout tombstoned
    const list = byWorkout.get(s.workout_id) ?? []
    list.push(s)
    byWorkout.set(s.workout_id, list)
  }

  return [...byWorkout.entries()]
    .map(([workout_id, ss]) => ({
      workout_id,
      date: dateOf.get(workout_id)!,
      sets: ss.sort((a, b) => a.set_index - b.set_index),
    }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, limit)
}

export type WorkoutSummary = {
  workout: Workout
  exercise_ids: string[]
  working_sets: number
  tonnage_kg: number
}

/** Every session, newest first, for the history screen. */
export async function listWorkoutSummaries(): Promise<WorkoutSummary[]> {
  const workouts = alive(await db.workouts.toArray()).sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  )

  const out: WorkoutSummary[] = []
  for (const w of workouts) {
    const sets = await setsForWorkout(w.id)
    const exercise_ids: string[] = []
    for (const s of sets) if (!exercise_ids.includes(s.exercise_id)) exercise_ids.push(s.exercise_id)
    out.push({
      workout: w,
      exercise_ids,
      working_sets: sets.filter(isWorkingSet).length,
      tonnage_kg: tonnage(sets),
    })
  }
  return out
}

export type SessionSummary = {
  workout_id: string
  date: string
  routine_day_id: string | null
  /** Exercises in the order they were first worked that day. */
  exercise_ids: string[]
  set_count: number
}

/**
 * Recent sessions, newest first, for the "repeat a session" shortcut.
 *
 * This replaces a routine editor. A saved template is a second copy of a plan
 * that already exists in the lifter's head, and it goes stale silently the
 * first time a lift is swapped. What you actually did last Push day cannot go
 * stale - it is the record itself.
 */
export async function recentSessionSummaries(
  opts: { limit?: number; excludeDate?: string } = {},
): Promise<SessionSummary[]> {
  const { limit = 5, excludeDate } = opts

  const workouts = alive(await db.workouts.toArray())
    .filter((w) => w.date !== excludeDate)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, limit)
  if (workouts.length === 0) return []

  const summaries: SessionSummary[] = []
  for (const w of workouts) {
    const sets = await setsForWorkout(w.id)
    if (sets.length === 0) continue // an abandoned session is not worth repeating

    const exercise_ids: string[] = []
    for (const s of sets) if (!exercise_ids.includes(s.exercise_id)) exercise_ids.push(s.exercise_id)

    summaries.push({
      workout_id: w.id,
      date: w.date,
      routine_day_id: w.routine_day_id,
      exercise_ids,
      set_count: sets.filter(isWorkingSet).length,
    })
  }
  return summaries
}

/**
 * Session tonnage: sum of weight x reps across every non-warm-up set.
 *
 * Deliberately NOT isWorkingSet. Drops and myorep mini-sets are excluded from
 * set COUNTS because they are continuations rather than separate sets, but the
 * reps were still performed and the load still moved, so they belong in the
 * tonnage total.
 */
export function tonnage(sets: WorkoutSet[]): number {
  return sets.filter((s) => !s.is_warmup).reduce((t, s) => t + s.weight_kg * s.reps, 0)
}

/** Next free set index for an exercise within a workout. */
export function nextSetIndex(sets: WorkoutSet[], exerciseId: string): number {
  const mine = sets.filter((s) => s.exercise_id === exerciseId)
  return mine.length === 0 ? 0 : Math.max(...mine.map((s) => s.set_index)) + 1
}
