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
  /**
   * The load COUNTERWEIGHTS you - an assisted pull-up or dip machine.
   *
   * More weight is less work, so the whole load axis runs backwards: taking
   * weight off is progression, a deload adds it back, the top set of a session
   * is the LIGHTEST one, weight x reps is the machine's contribution rather
   * than yours, and an Epley 1RM means nothing without bodyweight.
   *
   * A flag rather than a negative load_increment_kg, which would have carried
   * the direction and nothing else while every rule above still needed its own
   * special case.
   */
  load_is_assistance: boolean
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
  /**
   * A label - "Pull", "Push B". Null on most sessions and meant to stay that
   * way. Nothing keys off it except the exercise picker's ordering, which
   * treats it as a hint and falls back to what the session already contains.
   */
  name: string | null
  /** Free text about the whole day. Per-exercise notes are their own table. */
  notes: string | null
  started_at: string | null
  /**
   * Set by "Finish session", and the only thing that gives a session a
   * duration. Null while it is still open, which is most of the time.
   */
  finished_at: string | null
  source: 'app' | 'import'
  import_batch_id: string | null
}

/**
 * What kind of set a row is.
 *
 * `dropset` and `myorep` are CONTINUATIONS of the set logged immediately
 * before them, not sets in their own right. Modelling them that way is what
 * makes counting unambiguous without a grouping id, and it is why
 * `isWorkingSet` below is the one place that decides.
 *
 * `myorep_match` is NOT one of those, despite the name sitting next to
 * `myorep`. The two are different shapes:
 *
 *   myorep        an activation set, then mini-sets off the SAME set a few
 *                 breaths apart. Continuations.
 *   myorep_match  a full set at the same weight, taken to the same rep count
 *                 as the first set, resting inside the set as much as it takes
 *                 to get there. Three matched sets of 15kg x 8 is three
 *                 working sets, not one.
 *
 * Counting a match as a continuation would report three sets of work as one
 * and quietly drop two thirds of it off the weekly volume chart.
 */
export const SET_TYPES = ['normal', 'dropset', 'myorep', 'myorep_match'] as const
export type SetType = (typeof SET_TYPES)[number]

/**
 * The types that belong to the set logged before them.
 *
 * Listed rather than inferred, so adding a fifth type is a deliberate decision
 * about which side of the line it falls on rather than something that silently
 * defaults.
 */
export const CONTINUATION_SET_TYPES: readonly SetType[] = ['dropset', 'myorep']

export type WorkoutSet = SyncedRow & {
  workout_id: string
  exercise_id: string
  set_index: number
  weight_kg: number
  reps: number
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
 * A myorep MATCH is not a continuation and does count, for the reason set out
 * on SET_TYPES: it is a whole set that happens to be chasing the first set's
 * rep count.
 *
 * Lives here beside the row types rather than in queries.ts so that
 * analytics.ts can stay free of Dexie and keep testing without a database.
 */
export const isWorkingSet = (s: Pick<WorkoutSet, 'is_warmup' | 'set_type'>): boolean =>
  !s.is_warmup && !CONTINUATION_SET_TYPES.includes(setTypeOf(s))

/**
 * One note against one exercise within one session.
 *
 * Its own table because there is nowhere else to put it: which exercises are in
 * a session lives in the local-only `meta` table and never syncs, so there is
 * no membership row to hang a column off.
 *
 * Emptied by clearing `note`, not by tombstoning, so the row is reused when you
 * type into it again. That keeps the partial unique index on
 * (workout_id, exercise_id) from accumulating dead rows.
 */
export type WorkoutExerciseNote = SyncedRow & {
  workout_id: string
  exercise_id: string
  note: string | null
}

/**
 * The exercises whose load counterweights the lifter.
 *
 * Lives here beside the row types, so analytics.ts can filter on it without
 * pulling in Dexie - the same reason isWorkingSet does.
 */
export const assistedIds = (
  exercises: ReadonlyArray<Pick<Exercise, 'id' | 'load_is_assistance'>>,
): Set<string> => new Set(exercises.filter((e) => e.load_is_assistance).map((e) => e.id))

/**
 * How long a session took, in seconds, or null while it is still open.
 *
 * Guarded against a finish that lands before its start - a clock change, or a
 * row edited by hand - because a negative duration renders as nonsense rather
 * than as an error, which is the worst way for it to fail.
 */
export const sessionSeconds = (
  w: Pick<Workout, 'started_at' | 'finished_at'>,
): number | null => {
  if (!w.started_at || !w.finished_at) return null
  const from = Date.parse(w.started_at)
  const to = Date.parse(w.finished_at)
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null
  return Math.round((to - from) / 1000)
}

/**
 * Live sets, grouped by workout and ordered within each one.
 *
 * Pure, and here rather than in queries.ts so it can be tested without a
 * database - the grouping is the part that has to stay identical to what a
 * per-workout query returned, and that is worth pinning.
 *
 * Exists because the history and repeat screens ran ONE IndexedDB query per
 * workout. Measured over 312 sessions and 4,680 sets: 324ms that way against
 * 93ms reading the table once and grouping here, on a desktop. A phone is
 * several times slower again, and both screens are live queries that re-run
 * whenever anything syncs - so the cost was paid over and over, and grew with
 * every session logged.
 */
export function groupSetsByWorkout(sets: readonly WorkoutSet[]): Map<string, WorkoutSet[]> {
  const byWorkout = new Map<string, WorkoutSet[]>()
  for (const s of sets) {
    const list = byWorkout.get(s.workout_id)
    if (list) list.push(s)
    else byWorkout.set(s.workout_id, [s])
  }
  // Same order a per-workout read gave: set_index, ascending. The exercise
  // order on a session summary is derived from it.
  for (const list of byWorkout.values()) list.sort((a, b) => a.set_index - b.set_index)
  return byWorkout
}

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
/**
 * `sets.rir` is deliberately ABSENT from WorkoutSet.
 *
 * It existed from the initial schema as an optional "reps in reserve" and was
 * written as null on every set ever logged, read only by the CSV export, and
 * never surfaced anywhere. That is a column the code believes in and the data
 * never had - the same thing the routine tables were.
 *
 * The Postgres column is left alone: dropping it is destructive DDL for no
 * gain, it holds nothing, and rows pulled from the server may still carry it
 * locally, which is harmless. If it is ever wanted, it is one ALTER away.
 */

/**
 * Flush order. Children must follow their parents or the first push of a new
 * workout fails on a foreign key: a `set` referencing a `workout` that does not
 * exist server-side yet. Order is load-bearing, not cosmetic.
 *
 * `routines`, `routine_days` and `routine_day_exercises` are deliberately
 * ABSENT. They have existed since migration 0001 and no code path has ever
 * written to one, so they can only ever be empty - while still costing a push
 * scan and a pull request each, every sync. "Repeat a session" replaced the
 * routine editor on purpose: a saved template is a second copy of a plan that
 * goes stale the first time a lift is swapped, and what you actually did last
 * Push day cannot go stale.
 *
 * The Postgres tables are left in place. Dropping them is destructive, they
 * cost nothing sitting there, and the day a routine editor is wanted the schema
 * is already right.
 */
export const SYNC_TABLES = [
  'profile',
  'exercises',
  'workouts',
  'sets',
  'workout_exercise_notes',
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
