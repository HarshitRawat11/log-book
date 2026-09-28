-- The minimum Supabase surface the migrations depend on, so they can be applied
-- to a stock Postgres and checked for real.
--
-- This is a TEST fixture. It is never applied to the real project - Supabase
-- provides all of this already. It exists so `npm run verify:migrations` can
-- run the migration files unmodified rather than a doctored copy of them, which
-- would verify the copy and not the thing that ships.

create extension if not exists pgcrypto;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

-- Supabase derives auth.uid() from the request JWT. Here it reads a session
-- GUC instead, which is the same contract from the policies' point of view and
-- lets the harness switch identity mid-session - the only way to prove that one
-- user's rows are invisible to another without two real accounts.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

grant usage on schema public, auth to anon, authenticated;
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
