import Dexie, { type EntityTable } from 'dexie'
import type {
  Bodyweight,
  CardioPreset,
  CardioSession,
  Exercise,
  Food,
  FoodLog,
  OutboxOp,
  Profile,
  Recipe,
  RecipeItem,
  Routine,
  RoutineDay,
  RoutineDayExercise,
  Workout,
  WorkoutExerciseNote,
  WorkoutSet,
} from './types'

/**
 * The local store. This is the source of truth the UI reads from - never the
 * network. Supabase is a replica we push to and pull from in the background.
 *
 * Indexes are only declared where something actually queries on them. Dexie
 * cannot index null, so `deleted_at` is filtered in JS rather than indexed;
 * at one user's data volume that costs nothing.
 */
export class LogBookDB extends Dexie {
  profile!: EntityTable<Profile, 'user_id'>
  exercises!: EntityTable<Exercise, 'id'>
  routines!: EntityTable<Routine, 'id'>
  routine_days!: EntityTable<RoutineDay, 'id'>
  routine_day_exercises!: EntityTable<RoutineDayExercise, 'id'>
  workouts!: EntityTable<Workout, 'id'>
  sets!: EntityTable<WorkoutSet, 'id'>
  workout_exercise_notes!: EntityTable<WorkoutExerciseNote, 'id'>
  bodyweight!: EntityTable<Bodyweight, 'id'>
  foods!: EntityTable<Food, 'id'>
  recipes!: EntityTable<Recipe, 'id'>
  recipe_items!: EntityTable<RecipeItem, 'id'>
  food_log!: EntityTable<FoodLog, 'id'>
  cardio_presets!: EntityTable<CardioPreset, 'id'>
  cardio_sessions!: EntityTable<CardioSession, 'id'>
  outbox!: EntityTable<OutboxOp, 'seq'>
  meta!: EntityTable<{ key: string; value: unknown }, 'key'>

  constructor() {
    super('log-book')
    this.version(1).stores({
      profile: 'user_id',
      exercises: 'id, name, muscle_group, archived',
      routines: 'id, is_active',
      routine_days: 'id, routine_id, day_index',
      routine_day_exercises: 'id, routine_day_id, exercise_id, position',
      workouts: 'id, date, routine_day_id',
      // [exercise_id+workout_id] serves "what did I do last time for X", which
      // is read on every render of the logging screen.
      sets: 'id, workout_id, exercise_id, [exercise_id+workout_id]',
      bodyweight: 'id, date',
      foods: 'id, name, is_favourite',
      recipes: 'id, name, is_favourite',
      recipe_items: 'id, recipe_id, food_id',
      food_log: 'id, date, [date+meal_slot]',
      // ++seq preserves submission order, which the flusher depends on.
      outbox: '++seq, table, row_id, next_attempt_at',
      meta: 'key',
    })

    // v2 adds the cardio tables. Declared as a second version rather than
    // edited into v1: Dexie upgrades an existing database by applying the
    // versions it has not seen, and rewriting v1 would leave anyone already on
    // v1 without the new stores.
    this.version(2).stores({
      cardio_presets: 'id, name',
      cardio_sessions: 'id, date',
    })

    // v3 adds per-exercise session notes. The compound index is the only read
    // there is - "the note for this exercise in this session" - and the plain
    // workout_id index backs rendering a whole session's worth at once.
    this.version(3).stores({
      workout_exercise_notes: 'id, workout_id, [workout_id+exercise_id]',
    })
  }
}

export const db = new LogBookDB()

/**
 * Ask the browser not to evict our IndexedDB.
 *
 * Without this, storage is "best effort": Android can clear it under storage
 * pressure. For an offline-first app that is not a cosmetic risk - the outbox
 * is the ONLY copy of a set logged in a basement until it syncs.
 *
 * Chrome grants this silently for installed PWAs and high-engagement sites, so
 * there is normally no prompt. A refusal is not an error worth surfacing:
 * nothing behaves differently, the data is just evictable. Settings →
 * Diagnostics reports the outcome as `storage.persisted`.
 */
export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return null
  }
}

/**
 * Wipes every local table. Used on sign-out: the next person to sign in on this
 * device must not inherit the previous account's cache.
 *
 * Deliberately refuses while the outbox is non-empty, since that would discard
 * writes that never reached the server.
 */
export async function clearLocal(opts: { force?: boolean } = {}): Promise<
  { cleared: true } | { cleared: false; pending: number }
> {
  const pending = await db.outbox.count()
  if (pending > 0 && !opts.force) return { cleared: false, pending }

  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
  })
  return { cleared: true }
}
