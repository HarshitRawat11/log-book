-- Session names, assisted-machine loading, and per-exercise session notes.
--
-- Additive only: two columns and one table. Nothing is dropped, nothing is
-- rewritten, and every existing row keeps exactly the meaning it has today.

-- ---------------------------------------------------------------------------
-- workouts.name
--
-- A session is currently identified by its date alone, which is enough to find
-- it and useless for recognising it. "Pull" or "Push B" is the thing you
-- actually scan for in a list of thirty sessions.
--
-- Nullable, and expected to stay null most of the time. It is a label, not a
-- classification: nothing keys off it except the exercise picker's ordering,
-- which treats it as a hint and falls back to what is already in the session.
-- ---------------------------------------------------------------------------
alter table workouts add column if not exists name text;

-- ---------------------------------------------------------------------------
-- exercises.load_is_assistance
--
-- On an assisted pull-up or dip machine the stack COUNTERWEIGHTS you. More
-- weight is less work, so the whole load axis runs backwards:
--
--   * progression means taking weight OFF, not putting it on
--   * a deload means adding assistance back
--   * the "top set" of a session is the one at the LOWEST weight
--   * weight x reps is the machine's contribution, not yours, so it cannot be
--     added to tonnage
--   * an Epley 1RM is meaningless without bodyweight, so the chart does not
--     compute one
--
-- A flag rather than a signed increment: a negative load_increment_kg would
-- have expressed the direction and nothing else, and every one of the rules
-- above would still have had to be special-cased somewhere.
--
-- min_weight_kg keeps working as the floor, and means the right thing on its
-- own terms: the least assistance the stack offers. There is deliberately no
-- ceiling column - a deload can in principle propose more assistance than the
-- machine has plates, which is a practical problem and not a data one.
-- ---------------------------------------------------------------------------
alter table exercises
  add column if not exists load_is_assistance boolean not null default false;

-- ---------------------------------------------------------------------------
-- workout_exercise_notes
--
-- One note per exercise per session: "left elbow complained on set 3", "bench
-- was taken, used the smith". `workouts.notes` stays for the things that are
-- true of the whole day - slept badly, short on time - because those are not
-- attached to any one lift.
--
-- Its own table rather than a column, because there is nowhere else to put it:
-- session membership lives in the local-only `meta` table and never syncs, so
-- there is no workout_exercises row to hang it off.
--
-- The note is emptied by clearing its text, not by tombstoning the row, so the
-- row is reused if you type into it again. deleted_at is present anyway - the
-- sync layer requires it on every table and the schema contract test enforces
-- that - and the unique index is partial so a tombstoned note does not block a
-- replacement.
-- ---------------------------------------------------------------------------
create table workout_exercise_notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid()
                references auth.users(id) on delete cascade,
  workout_id  uuid not null references workouts(id)  on delete cascade,
  exercise_id uuid not null references exercises(id) on delete cascade,
  note        text,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create unique index workout_exercise_notes_uq
  on workout_exercise_notes (workout_id, exercise_id)
  where deleted_at is null;

-- The read is always "the notes for this session", to render the cards.
create index workout_exercise_notes_workout_idx
  on workout_exercise_notes (workout_id)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- RLS: same loop, same policy, no exceptions.
--
--   FORCE            - applies even to the table owner.
--   TO authenticated - anon matches no policy at all, so a signed-out read
--                      returns zero rows rather than an error.
--
-- The two ALTERs above need nothing here. Both tables already have RLS enabled
-- and forced with a single FOR ALL policy gated on auth.uid() = user_id; a new
-- column inherits it, and adding one cannot widen access.
-- ---------------------------------------------------------------------------
do $rls$
declare t text;
begin
  foreach t in array array['workout_exercise_notes'] loop
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
