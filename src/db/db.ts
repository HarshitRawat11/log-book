import Dexie, { type EntityTable } from 'dexie'
import type {
  Bodyweight,
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
  bodyweight!: EntityTable<Bodyweight, 'id'>
  foods!: EntityTable<Food, 'id'>
  recipes!: EntityTable<Recipe, 'id'>
  recipe_items!: EntityTable<RecipeItem, 'id'>
  food_log!: EntityTable<FoodLog, 'id'>
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
  }
}

export const db = new LogBookDB()

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
