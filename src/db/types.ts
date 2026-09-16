/**
 * Entity types.
 *
 * Field names are snake_case, matching the Postgres columns exactly, and they
 * stay that way all the way through the UI. That is deliberate and worth the
 * mild ugliness: an outbox record IS a row, so the payload we queue locally is
 * upserted to Supabase verbatim. A camelCase/snake_case mapping layer would sit
 * on the one path where a silently dropped field means a lost set.
 */

/** Columns every synced table carries. */
export type SyncedRow = {
  id: string
  user_id: string
  updated_at: string
  /** Soft delete. Nothing is ever hard-deleted - see README, sync model. */
  deleted_at: string | null
}

export const MUSCLE_GROUPS = [
  'chest',
  'back',
  'quads',
  'hamstrings',
  'glutes',
  'shoulders',
  'biceps',
  'triceps',
  'calves',
  'core',
  'forearms',
  'other',
] as const
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]

export const EQUIPMENT = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'bodyweight',
  'kettlebell',
  'band',
  'other',
] as const
export type Equipment = (typeof EQUIPMENT)[number]

export type Exercise = SyncedRow & {
  name: string
  muscle_group: MuscleGroup
  equipment: Equipment
  target_rep_min: number
  target_rep_max: number
  load_increment_kg: number
  /** Floor for the deload branch: bar weight, or the lightest machine pin. */
  min_weight_kg: number
  /**
   * Seat, pin and notch numbers - whatever makes the machine repeatable.
   *
   * Its own field rather than part of the name. Written into the name, the
   * first time a seat position changes the exercise forks in two and both the
   * progression engine and the 1RM chart lose the thread.
   */
  machine_setup: string | null
  archived: boolean
}

export type Routine = SyncedRow & {
  name: string
  is_active: boolean
}

export type RoutineDay = SyncedRow & {
  routine_id: string
  name: string
  day_index: number
}

export type RoutineDayExercise = SyncedRow & {
  routine_day_id: string
  exercise_id: string
  position: number
  target_sets: number | null
}

export type Workout = SyncedRow & {
  /** ISO date, yyyy-mm-dd. Local calendar date, not UTC - see dates.ts. */
  date: string
  routine_day_id: string | null
  notes: string | null
  started_at: string | null
  finished_at: string | null
  source: 'app' | 'import'
  import_batch_id: string | null
}

/**
 * What kind of set a row is.
 *
 * `dropset` and `myorep` are CONTINUATIONS of the set logged immediately
 * before them, not sets in their own right. Modelling them that way is what
 * makes counting unambiguous without a grouping id - a working set is simply a
 * `normal` row - and it is why `isWorkingSet` in queries.ts is the one place
 * that decides.
 */
export const SET_TYPES = ['normal', 'dropset', 'myorep'] as const
export type SetType = (typeof SET_TYPES)[number]

export type WorkoutSet = SyncedRow & {
  workout_id: string
  exercise_id: string
  set_index: number
  weight_kg: number
  reps: number
  /** Reps in reserve, 0-5. Optional. */
  rir: number | null
  is_warmup: boolean
  /**
   * Rows written before this column existed have no value at all locally, so
   * every read goes through `setTypeOf()` rather than touching this directly.
   */
  set_type: SetType
  source: 'app' | 'import'
  import_batch_id: string | null
}

/** Tolerates rows written before `set_type` existed, which have no value. */
export const setTypeOf = (s: Pick<WorkoutSet, 'set_type'>): SetType => s.set_type ?? 'normal'

/**
 * A working set: not a warm-up, and not a continuation of the set before it.
 *
 * The single definition everything counts through, so "how many sets was that"
 * has one answer across the session header, the weekly volume chart and the
 * progression engine.
 *
 * A drop or a myorep mini-set is part of the set it hangs off, so three drops
 * off one top set is one working set and not four. Their TONNAGE still counts
 * - the reps were genuinely performed - which is why tonnage() filters on
 * warm-ups alone and not on this.
 *
 * Lives here beside the row types rather than in queries.ts so that
 * analytics.ts can stay free of Dexie and keep testing without a database.
 */
export const isWorkingSet = (s: Pick<WorkoutSet, 'is_warmup' | 'set_type'>): boolean =>
  !s.is_warmup && setTypeOf(s) === 'normal'

export type Bodyweight = SyncedRow & {
  date: string
  weight_kg: number
}

export type Profile = {
  user_id: string
  kcal_target: number | null
  protein_g_target: number | null
  carbs_g_target: number | null
  fat_g_target: number | null
  height_cm: number | null
  birth_date: string | null
  sex: 'male' | 'female' | null
  updated_at: string
  deleted_at: string | null
}

/* ----- diet, Phase 3. Declared now so the Dexie schema and the sync table
   order are defined once rather than bumped mid-project. ----- */

export type Food = SyncedRow & {
  name: string
  brand: string | null
  kcal_100g: number
  protein_100g: number
  carbs_100g: number
  fat_100g: number
  fibre_100g: number
  source: string
  source_ref: string | null
  fetched_at: string | null
  is_favourite: boolean
}

export type Recipe = SyncedRow & {
  name: string
  cooked_yield_g: number
  kcal_100g: number | null
  protein_100g: number | null
  carbs_100g: number | null
  fat_100g: number | null
  fibre_100g: number | null
  is_favourite: boolean
}

export type RecipeItem = SyncedRow & {
  recipe_id: string
  food_id: string
  grams: number
  position: number
}

export type FoodLog = SyncedRow & {
  date: string
  meal_slot: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  food_id: string | null
  recipe_id: string | null
  grams: number
  name_snapshot: string
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fibre_g: number
}

/* ----- cardio, phase 5 ----- */

export type CardioPreset = SyncedRow & {
  name: string
  /** Free text: the list grows (bag work, skipping) and a CHECK would not. */
  activity: string
  work_seconds: number
  break_seconds: number
  rounds: number
}

export type CardioSession = SyncedRow & {
  /** Local calendar date, as workouts.date - not the UTC date of started_at. */
  date: string
  started_at: string
  ended_at: string | null
  activity: string
  /**
   * The configuration actually used, SNAPSHOT onto the row. There is
   * deliberately no preset_id: editing the kickboxing preset in December must
   * not rewrite what October's sessions claim to have been.
   */
  preset_name: string | null
  work_seconds: number
  break_seconds: number
  rounds_planned: number
  rounds_completed: number
  completed: boolean
  /** Both added afterwards, gloves off. Both genuinely optional. */
  notes: string | null
  rpe: number | null
}

/**
 * Flush order. Children must follow their parents or the first push of a new
 * workout fails on a foreign key: a `set` referencing a `workout` that does not
 * exist server-side yet. Order is load-bearing, not cosmetic.
 */
export const SYNC_TABLES = [
  'profile',
  'exercises',
  'routines',
  'routine_days',
  'routine_day_exercises',
  'workouts',
  'sets',
  'bodyweight',
  'foods',
  'recipes',
  'recipe_items',
  'food_log',
  'cardio_presets',
  'cardio_sessions',
] as const

export type SyncTable = (typeof SYNC_TABLES)[number]

/**
 * The primary key column for a table.
 *
 * `profile` is keyed by user_id and has no `id` column at all; everything else
 * is keyed by `id`. This lives here rather than in the sync layer because the
 * WRITE path needs it too - the outbox has to know what identifies a row in
 * order to compact queued ops for it.
 */
export const pkOf = (table: SyncTable): 'id' | 'user_id' =>
  table === 'profile' ? 'user_id' : 'id'

/** One queued write. The payload is the whole row, never a delta. */
export type OutboxOp = {
  seq?: number
  table: SyncTable
  row_id: string
  /** Full row state. Replaying it twice is identical to replaying it once. */
  payload: Record<string, unknown>
  attempts: number
  next_attempt_at: number
  last_error: string | null
  created_at: number
}
