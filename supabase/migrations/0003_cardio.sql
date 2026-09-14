-- Cardio: reusable interval presets, and a row per session performed.
--
-- Additive only. Two new tables, nothing existing is touched.

-- ---------------------------------------------------------------------------
-- cardio_presets
--
-- Named, reusable interval configurations - a kickboxing one, a HIIT one, and
-- whatever gets added later.
--
-- `activity` is free text rather than a CHECK: the list will grow (bag work,
-- skipping) and a constraint would mean a migration every time.
-- ---------------------------------------------------------------------------
create table cardio_presets (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid()
                  references auth.users(id) on delete cascade,
  name          text not null,
  activity      text not null,
  work_seconds  int  not null,
  break_seconds int  not null,
  rounds        int  not null,
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  constraint preset_work_sane   check (work_seconds  > 0),
  constraint preset_break_sane  check (break_seconds >= 0),
  constraint preset_rounds_sane check (rounds > 0)
);
-- Same case-insensitive uniqueness as exercises: two presets called "Kickboxing"
-- would be indistinguishable in the picker.
create unique index cardio_presets_user_name_uq
  on cardio_presets (user_id, lower(name));

-- ---------------------------------------------------------------------------
-- cardio_sessions
--
-- The interval configuration is SNAPSHOT onto each row - work_seconds,
-- break_seconds, rounds_planned, preset_name - and there is deliberately no
-- foreign key to cardio_presets. Same rule as food_log: editing the kickboxing
-- preset in December must not silently rewrite what October's sessions claim
-- to have been. History is a record, not a view.
--
-- A session abandoned at round 3 of 6 is still logged, with completed = false
-- and rounds_completed = 3. Twenty minutes of work vanishing because it was cut
-- short would be a bug, not tidiness.
-- ---------------------------------------------------------------------------
create table cardio_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid()
                     references auth.users(id) on delete cascade,
  -- Local calendar date, matching workouts.date - not derived from started_at
  -- in UTC, or a late session lands on tomorrow.
  date             date not null,
  started_at       timestamptz not null,
  ended_at         timestamptz,
  activity         text not null,

  -- snapshot of the configuration actually used
  preset_name      text,
  work_seconds     int not null,
  break_seconds    int not null,
  rounds_planned   int not null,

  rounds_completed int  not null default 0,
  completed        boolean not null default false,

  -- Both filled in afterwards, gloves off, and both genuinely optional.
  notes            text,
  rpe              smallint,

  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  constraint session_work_sane      check (work_seconds  > 0),
  constraint session_break_sane     check (break_seconds >= 0),
  constraint session_rounds_sane    check (rounds_planned > 0),
  constraint session_completed_sane check (rounds_completed >= 0),
  constraint session_rpe_sane       check (rpe is null or rpe between 1 and 10)
);
create index cardio_sessions_user_date_idx on cardio_sessions (user_id, date desc);
-- Drives the "you did not rate this one" prompt.
create index cardio_sessions_unrated_idx on cardio_sessions (user_id)
  where rpe is null and deleted_at is null;

-- ---------------------------------------------------------------------------
-- RLS: same loop, same policy, no exceptions.
--
--   FORCE            - applies even to the table owner.
--   TO authenticated - anon matches no policy at all, so a signed-out read
--                      returns zero rows rather than an error.
-- ---------------------------------------------------------------------------
do $rls$
declare t text;
begin
  foreach t in array array['cardio_presets', 'cardio_sessions'] loop
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
