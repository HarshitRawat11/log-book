-- ============================================================================
-- log-book - initial schema
-- ============================================================================
-- Units: kilograms and grams throughout. No unit switcher (brief 6).
-- Every table carries: user_id, updated_at, deleted_at (tombstone), and RLS.
--
-- Soft deletes are load-bearing, not a nicety. A hard DELETE cannot be
-- replicated to other clients through the outbox: the row simply reappears
-- on the next pull. Everything is deleted by setting deleted_at.
-- ============================================================================

create extension if not exists pgcrypto;

create or replace function touch_updated_at() returns trigger
language plpgsql as $fn$
begin
  new.updated_at = now();
  return new;
end $fn$;

-- ---------------------------------------------------------------- profile --

create table profile (
  user_id          uuid primary key default auth.uid()
                     references auth.users(id) on delete cascade,
  -- diet targets, set manually (brief 7.4)
  kcal_target      numeric(6,1),
  protein_g_target numeric(6,1),
  carbs_g_target   numeric(6,1),
  fat_g_target     numeric(6,1),
  -- optional, only for the Mifflin-St Jeor calculator (brief 7.4)
  height_cm        numeric(5,1),
  birth_date       date,
  sex              text check (sex in ('male','female')),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

-- --------------------------------------------------------------- training --

create table exercises (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid()
                      references auth.users(id) on delete cascade,
  name              text not null,
  -- text + CHECK rather than an enum: enum values cannot be removed without a
  -- table rewrite, and this list will change as the exercise library grows.
  muscle_group      text not null,
  equipment         text not null,
  -- double progression inputs (brief 7.2)
  target_rep_min    int not null,
  target_rep_max    int not null,
  load_increment_kg numeric(5,2) not null default 2.5,
  -- Floor for the deload branch: stops a 0.9x suggestion proposing 15kg on a
  -- 20kg barbell, or below the lightest pin on a machine.
  min_weight_kg     numeric(6,2) not null default 0,
  archived          boolean not null default false,
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint rep_range_sane check (target_rep_min > 0
                                   and target_rep_max >= target_rep_min),
  constraint muscle_group_known check (muscle_group in (
    'chest','back','quads','hamstrings','glutes','shoulders',
    'biceps','triceps','calves','core','forearms','other')),
  constraint equipment_known check (equipment in (
    'barbell','dumbbell','machine','cable','bodyweight','kettlebell','band','other'))
);
create unique index exercises_user_name_uq on exercises (user_id, lower(name))
  where deleted_at is null;

create table routines (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  is_active  boolean not null default false,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table routine_days (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  routine_id uuid not null references routines(id) on delete cascade,
  name       text not null,
  day_index  int not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table routine_day_exercises (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  routine_day_id uuid not null references routine_days(id) on delete cascade,
  exercise_id    uuid not null references exercises(id) on delete cascade,
  position       int not null,
  target_sets    int,
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create table workouts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date           date not null,
  routine_day_id uuid references routine_days(id) on delete set null,  -- optional
  notes          text,
  started_at     timestamptz,
  finished_at    timestamptz,
  -- Historical import provenance. Pre-installed so the one-time ETL needs no
  -- migration, and so the whole import can be removed with one statement.
  source          text not null default 'app' check (source in ('app','import')),
  import_batch_id uuid,
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create index workouts_user_date_idx on workouts (user_id, date desc);
create index workouts_batch_idx on workouts (import_batch_id)
  where import_batch_id is not null;

create table sets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workout_id  uuid not null references workouts(id) on delete cascade,
  exercise_id uuid not null references exercises(id) on delete cascade,
  -- Ordering only; deliberately NOT unique, so deleting set 2 of 4 needs no
  -- reindex cascade across the remaining rows.
  set_index   int not null,
  weight_kg   numeric(6,2) not null,
  reps        int not null,
  rir         smallint check (rir between 0 and 5),   -- optional
  is_warmup   boolean not null default false,
  source          text not null default 'app' check (source in ('app','import')),
  import_batch_id uuid,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint reps_sane   check (reps > 0),
  constraint weight_sane check (weight_kg >= 0)
);
-- Drives "last session for this exercise" - the hottest read in the app.
create index sets_user_exercise_idx on sets (user_id, exercise_id)
  where deleted_at is null;
create index sets_workout_idx on sets (workout_id);
create index sets_batch_idx on sets (import_batch_id)
  where import_batch_id is not null;

create table bodyweight (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date       date not null,
  weight_kg  numeric(5,2) not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index bodyweight_user_date_uq on bodyweight (user_id, date)
  where deleted_at is null;                          -- one entry per date

-- ------------------------------------------------------------------- diet --

create table foods (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name         text not null,
  brand        text,
  -- macros per 100g (brief 6)
  kcal_100g    numeric(7,2) not null,
  protein_100g numeric(7,2) not null,
  carbs_100g   numeric(7,2) not null,
  fat_100g     numeric(7,2) not null,
  fibre_100g   numeric(7,2) not null default 0,
  source       text not null default 'manual',  -- manual|ifct2017|openfoodfacts
  source_ref   text,                            -- provider id / barcode / IFCT code
  fetched_at   timestamptz,
  is_favourite boolean not null default false,
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  constraint macros_non_negative check (
    kcal_100g >= 0 and protein_100g >= 0 and carbs_100g >= 0
    and fat_100g >= 0 and fibre_100g >= 0)
);
create index foods_user_name_idx on foods (user_id, lower(name));
create unique index foods_source_ref_uq on foods (user_id, source, source_ref)
  where source_ref is not null and deleted_at is null;   -- cache once per item

create table recipes (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name           text not null,
  cooked_yield_g numeric(8,1) not null,     -- weigh the finished dish
  -- Derived from items / yield, cached for display only. Recomputed whenever
  -- items or yield change. NEVER read by food_log - that snapshots instead.
  kcal_100g      numeric(7,2),
  protein_100g   numeric(7,2),
  carbs_100g     numeric(7,2),
  fat_100g       numeric(7,2),
  fibre_100g     numeric(7,2),
  is_favourite   boolean not null default false,
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  constraint yield_positive check (cooked_yield_g > 0)
);

create table recipe_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  recipe_id  uuid not null references recipes(id) on delete cascade,
  food_id    uuid not null references foods(id) on delete restrict,
  grams      numeric(8,1) not null check (grams > 0),
  position   int not null default 0,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table food_log (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date      date not null,
  meal_slot text not null check (meal_slot in ('breakfast','lunch','dinner','snack')),
  food_id   uuid references foods(id)   on delete set null,
  recipe_id uuid references recipes(id) on delete set null,
  grams     numeric(8,1) not null check (grams > 0),

  -- SNAPSHOT (brief 6, critical rule). Computed at the moment of logging and
  -- never recomputed. Correcting a food's macros in November must not silently
  -- rewrite August. History is a record, not a view.
  -- NOT NULL precisely so a bug cannot quietly produce a recomputed row.
  name_snapshot text         not null,
  kcal          numeric(8,2) not null,
  protein_g     numeric(8,2) not null,
  carbs_g       numeric(8,2) not null,
  fat_g         numeric(8,2) not null,
  fibre_g       numeric(8,2) not null,

  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint exactly_one_source check (
    (food_id is not null and recipe_id is null) or
    (food_id is null and recipe_id is not null))
);
create index food_log_user_date_idx on food_log (user_id, date desc);

-- ------------------------------------------- RLS: every table, no exceptions

-- Applied in a loop so a table cannot be forgotten (brief 5).
--   FORCE            - the policy applies even to the table owner.
--   TO authenticated - the anon role matches no policy at all, which is what
--                      makes a signed-out read return zero rows rather than
--                      an error.
--   FOR ALL with USING + WITH CHECK covers select/update/delete (USING) and
--                      insert/update (WITH CHECK): all four operations.

do $rls$
declare t text;
begin
  foreach t in array array[
    'profile','exercises','routines','routine_days','routine_day_exercises',
    'workouts','sets','bodyweight','foods','recipes','recipe_items','food_log'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force  row level security', t);
    execute format(
      'create policy own_rows_only on %I
         for all to authenticated
         using (auth.uid() = user_id)
         with check (auth.uid() = user_id)', t);
    execute format(
      'create trigger %I_touch before update on %I
         for each row execute function touch_updated_at()', t, t);
  end loop;
end $rls$;
