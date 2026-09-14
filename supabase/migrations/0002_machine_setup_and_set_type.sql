-- Machine settings on exercises, and a type on sets.
--
-- Additive only: three columns/constraints added, nothing dropped, nothing
-- rewritten. Existing rows take the defaults and keep their current meaning.

-- ---------------------------------------------------------------------------
-- exercises.machine_setup
--
-- The seat/pin/notch numbers that make a machine repeatable week to week.
--
-- Its own column rather than part of the name, deliberately. Written into the
-- name ("Pec deck fly w 1 seat and 3 pin"), the first time a seat position
-- changes the exercise forks in two, and the progression engine and the 1RM
-- chart both silently lose the thread - they key on the exercise row.
-- ---------------------------------------------------------------------------
alter table exercises add column if not exists machine_setup text;

-- ---------------------------------------------------------------------------
-- sets.set_type
--
--   normal   a working set in its own right
--   dropset  the drop portion, belonging to the set logged immediately before
--   myorep   a myorep mini-set, belonging to the activation set before it
--
-- dropset and myorep are CONTINUATIONS of the preceding set, not sets in their
-- own right. Modelling them that way is what makes counting unambiguous
-- without a grouping id: a working set is simply a `normal` row.
--
-- The consequences, applied in queries.ts and analytics.ts:
--   - weekly working-set counts see one set, not four
--   - tonnage still counts them, because the work was genuinely done
--   - progression and estimated 1RM ignore them: a drop to 5kg is not a top
--     set, and feeding it in would drag both downwards
-- ---------------------------------------------------------------------------
alter table sets add column if not exists set_type text not null default 'normal';

alter table sets drop constraint if exists set_type_known;
alter table sets add constraint set_type_known
  check (set_type in ('normal', 'dropset', 'myorep'));

-- A warm-up cannot also be a drop or a myorep. The UI models these as one
-- exclusive choice; this stops anything else writing an incoherent row.
alter table sets drop constraint if exists warmup_is_normal;
alter table sets add constraint warmup_is_normal
  check (not (is_warmup and set_type <> 'normal'));

-- No RLS changes. Both tables already have RLS enabled and forced, with a
-- single FOR ALL policy granted TO authenticated and gated on
-- auth.uid() = user_id. New columns inherit it; there is nothing per-column to
-- grant, and adding a column cannot widen access.
