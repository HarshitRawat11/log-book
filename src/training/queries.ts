import { db } from '../db/db'
import { alive, newRow, patchRow, putRow } from '../db/mutate'
import {
  assistedIds,
  groupSetsByWorkout,
  isWorkingSet,
  type Exercise,
  type Workout,
  type WorkoutExerciseNote,
  type WorkoutSet,
} from '../db/types'
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

/**
 * Every session, newest first, for the history screen.
 *
 * Three reads total, whatever the history holds. This used to query `sets` once
 * PER WORKOUT, which at 312 sessions and 4,680 sets measured 324ms against
 * 93ms for a single grouped read - and it is a live query, so it paid that on
 * every sync, growing with every session logged.
 */
export async function listWorkoutSummaries(): Promise<WorkoutSummary[]> {
  const [allWorkouts, allSets, assisted] = await Promise.all([
    db.workouts.toArray(),
    db.sets.toArray(),
    assistedExerciseIds(),
  ])
  const workouts = alive(allWorkouts).sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  )
  const byWorkout = groupSetsByWorkout(alive(allSets))

  return workouts.map((w) => {
    const sets = byWorkout.get(w.id) ?? []
    const exercise_ids: string[] = []
    for (const s of sets) if (!exercise_ids.includes(s.exercise_id)) exercise_ids.push(s.exercise_id)
    return {
      workout: w,
      exercise_ids,
      working_sets: sets.filter(isWorkingSet).length,
      tonnage_kg: tonnage(sets, assisted),
    }
  })
}

export type SessionSummary = {
  workout_id: string
  date: string
  /** Carried through a repeat: "Pull" repeated is still Pull. */
  name: string | null
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
  opts: { limit?: number; excludeDate?: string; excludeWorkoutId?: string } = {},
): Promise<SessionSummary[]> {
  const { limit = 5, excludeDate, excludeWorkoutId } = opts

  const [allWorkouts, allSets] = await Promise.all([db.workouts.toArray(), db.sets.toArray()])
  const workouts = alive(allWorkouts)
    .filter((w) => w.date !== excludeDate && w.id !== excludeWorkoutId)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  // Two reads, not one per workout scanned. This walks from the newest until
  // it has `limit` non-empty sessions, so with a run of abandoned ones at the
  // top it could previously query a long way back, one round trip at a time.
  const byWorkout = groupSetsByWorkout(alive(allSets))

  const summaries: SessionSummary[] = []
  for (const w of workouts) {
    // Take the newest `limit` sessions that HAVE something in them.
    //
    // This used to slice to `limit` first and drop the empties afterwards, so
    // abandoned sessions ate the slots: with a couple of empty ones at the top
    // the list collapsed to a single option, which is not a choice. Counting
    // after the filter is what makes it one.
    if (summaries.length >= limit) break
    const sets = byWorkout.get(w.id) ?? []
    if (sets.length === 0) continue // an abandoned session is not worth repeating

    const exercise_ids: string[] = []
    for (const s of sets) if (!exercise_ids.includes(s.exercise_id)) exercise_ids.push(s.exercise_id)

    summaries.push({
      workout_id: w.id,
      date: w.date,
      name: w.name ?? null,
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
 *
 * @param assisted Exercises whose load counterweights the lifter. Their sets
 *   are skipped: that weight is the machine's contribution, so including it
 *   would credit you with work you did not do, and would credit you MORE on
 *   the sessions where you needed the most help.
 */
export function tonnage(sets: WorkoutSet[], assisted: ReadonlySet<string> = new Set()): number {
  return sets
    .filter((s) => !s.is_warmup && !assisted.has(s.exercise_id))
    .reduce((t, s) => t + s.weight_kg * s.reps, 0)
}

/** The assisted-exercise ids in the local library, for the tonnage filters. */
export async function assistedExerciseIds(): Promise<Set<string>> {
  return assistedIds(await db.exercises.toArray())
}

/** Next free set index for an exercise within a workout. */
export function nextSetIndex(sets: WorkoutSet[], exerciseId: string): number {
  const mine = sets.filter((s) => s.exercise_id === exerciseId)
  return mine.length === 0 ? 0 : Math.max(...mine.map((s) => s.set_index)) + 1
}


/* ------------------------------------------------- per-exercise notes -- */

/**
 * Every per-exercise note in one session, keyed by exercise.
 *
 * One read per session rather than one per card: the logging screen renders
 * five or six cards and a live query each would re-run all of them on every
 * set logged.
 */
export async function notesForWorkout(workoutId: string): Promise<Map<string, WorkoutExerciseNote>> {
  const rows = alive(await db.workout_exercise_notes.where('workout_id').equals(workoutId).toArray())
  return new Map(rows.map((r) => [r.exercise_id, r]))
}

/**
 * Write the note for one exercise in one session, creating the row if needed.
 *
 * Emptying a note clears its text rather than tombstoning the row, so typing
 * into it again reuses the row. Tombstoning would work too, but it would leave
 * a dead row behind every time a note was cleared, and the partial unique
 * index exists precisely so that is never necessary.
 */
export async function saveExerciseNote(
  workoutId: string,
  exerciseId: string,
  note: string,
): Promise<void> {
  const text = note.trim() || null
  const existing = (
    await db.workout_exercise_notes.where('[workout_id+exercise_id]').equals([workoutId, exerciseId]).toArray()
  ).find((r) => !r.deleted_at)

  if (existing) {
    if (existing.note === text) return // nothing changed; do not queue a push
    await patchRow<WorkoutExerciseNote>('workout_exercise_notes', existing.id, { note: text })
    return
  }
  // Nothing typed and nothing stored - do not create an empty row.
  if (!text) return

  await putRow(
    'workout_exercise_notes',
    newRow({ workout_id: workoutId, exercise_id: exerciseId, note: text }),
  )
}

/**
 * The most recent note for each exercise from BEFORE this session.
 *
 * Without this the notes are write-only. "Shoulder felt tight on the second
 * set, ease into it next time" is visible while it is being typed and then
 * only if you deliberately reopen that session from History - and the one
 * moment it is worth reading is standing at the machine a week later.
 *
 * One read for the whole screen rather than one per card, and dated rather
 * than bare: a note from Tuesday and a note from March mean different things
 * and only the date says which you are looking at.
 *
 * @param beforeDate The session's own date. Notes are taken from on or before
 *   it, excluding this session itself, so opening a session from six weeks ago
 *   shows what was true THEN rather than what has been written since.
 */
export async function previousExerciseNotes(
  workoutId: string,
  beforeDate: string,
): Promise<Map<string, { note: string; date: string }>> {
  const rows = alive(await db.workout_exercise_notes.toArray()).filter(
    (r) => r.note && r.workout_id !== workoutId,
  )
  if (rows.length === 0) return new Map()

  const ids = [...new Set(rows.map((r) => r.workout_id))]
  const workouts = alive(
    await db.workouts.bulkGet(ids).then((w) => w.filter(Boolean) as Workout[]),
  )
  const dateOf = new Map(workouts.map((w) => [w.id, w.date]))

  const latest = new Map<string, { note: string; date: string }>()
  for (const r of rows) {
    const date = dateOf.get(r.workout_id)
    if (!date || date > beforeDate) continue // tombstoned, or written later
    const held = latest.get(r.exercise_id)
    if (!held || date > held.date) latest.set(r.exercise_id, { note: r.note!, date })
  }
  return latest
}
