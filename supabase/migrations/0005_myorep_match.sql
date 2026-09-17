-- A fourth set type: myorep match.
--
-- Additive: one CHECK constraint widened. No column added, no data rewritten,
-- and every existing row stays exactly as valid as it was.

-- ---------------------------------------------------------------------------
-- sets.set_type gains 'myorep_match'
--
-- Not a variant of 'myorep', despite the name. The two are different shapes:
--
--   myorep        an activation set followed by mini-sets off the SAME set,
--                 a few breaths apart. The mini-sets are CONTINUATIONS - they
--                 belong to the set above and do not count as sets of their
--                 own.
--
--   myorep_match  a full set in its own right, at the same weight, taken to
--                 the same rep count as the first set - resting inside the set
--                 as much as it takes to get there. Three matched sets of
--                 15 kg x 8 is three working sets, not one.
--
-- That difference is the whole reason it needs its own value rather than being
-- logged as 'myorep': counting it as a continuation would report three sets of
-- work as one, and the weekly volume chart would quietly lose two thirds of it.
--
-- So, for everything that counts:
--
--   normal        working set    counts    tonnage
--   myorep_match  working set    counts    tonnage
--   dropset       continuation   does not  tonnage
--   myorep        continuation   does not  tonnage
--   warm-up       neither        does not  no tonnage
-- ---------------------------------------------------------------------------
alter table sets drop constraint if exists set_type_known;
alter table sets add constraint set_type_known
  check (set_type in ('normal', 'dropset', 'myorep', 'myorep_match'));

-- `warmup_is_normal` is deliberately left as it is. A warm-up still cannot
-- carry any non-normal type, and a warm-up myorep match is no more a thing
-- than a warm-up drop set.

-- No RLS changes. `sets` already has RLS enabled and forced with a single
-- FOR ALL policy granted TO authenticated and gated on auth.uid() = user_id.
-- Widening a CHECK cannot widen access.
