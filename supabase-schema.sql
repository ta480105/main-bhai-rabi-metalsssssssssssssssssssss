-- Production Management -> Supabase schema
-- Run this once in Supabase SQL Editor.

create extension if not exists pgcrypto;

do $$ begin
  create type public.user_role as enum ('ADMIN', 'SUPERVISOR');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text not null,
  role public.user_role not null,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.workers (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public."pieceSizes" (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public."monthlyRates" (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public."productionRecords" (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public."monthStatuses" (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public."auditLogs" (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.settings (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public."zeroAudits" (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Compatibility alias used by the connection check.
create table if not exists public.app_settings (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'ADMIN' and p.active = true
  );
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active = true
  );
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active_user() to authenticated;

alter table public.profiles enable row level security;

-- Realtime is used to enforce Admin session controls on already-open Supervisor browsers.
alter table public.profiles replica identity full;
create policy "profiles own read" on public.profiles for select to authenticated using (id = auth.uid());

-- All authenticated active users can read the operational register.
-- Admin-only writes protect workers, rates, locks, settings and destructive logs.

do $$ declare t text; begin
  foreach t in array array['workers','pieceSizes','monthlyRates','productionRecords','monthStatuses','auditLogs','settings','zeroAudits','app_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "active read" on public.%I', t);
    execute format('create policy "active read" on public.%I for select to authenticated using (public.is_active_user())', t);
  end loop;
end $$;

-- Admin can fully manage all operational tables.
do $$ declare t text; begin
  foreach t in array array['workers','pieceSizes','monthlyRates','productionRecords','monthStatuses','auditLogs','settings','zeroAudits','app_settings'] loop
    execute format('drop policy if exists "admin insert" on public.%I', t);
    execute format('drop policy if exists "admin update" on public.%I', t);
    execute format('drop policy if exists "admin delete" on public.%I', t);
    execute format('create policy "admin insert" on public.%I for insert to authenticated with check (public.is_admin())', t);
    execute format('create policy "admin update" on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('create policy "admin delete" on public.%I for delete to authenticated using (public.is_admin())', t);
  end loop;
end $$;

-- Supervisors may create production records and audit records only.
drop policy if exists "supervisor production insert" on public."productionRecords";
create policy "supervisor production insert" on public."productionRecords"
for insert to authenticated
with check (public.is_active_user());

drop policy if exists "supervisor audit insert" on public."auditLogs";
create policy "supervisor audit insert" on public."auditLogs"
for insert to authenticated
with check (public.is_active_user());


-- Supervisors have full operational access to the Monthly Calendar while active.
drop policy if exists "supervisor production update" on public."productionRecords";
create policy "supervisor production update" on public."productionRecords"
for update to authenticated
using (public.is_active_user())
with check (public.is_active_user());

drop policy if exists "supervisor production delete" on public."productionRecords";
create policy "supervisor production delete" on public."productionRecords"
for delete to authenticated
using (public.is_active_user());

drop policy if exists "supervisor monthly rate update" on public."monthlyRates";
create policy "supervisor monthly rate update" on public."monthlyRates"
for update to authenticated
using (public.is_active_user())
with check (public.is_active_user());

drop policy if exists "supervisor monthly rate insert" on public."monthlyRates";
create policy "supervisor monthly rate insert" on public."monthlyRates"
for insert to authenticated
with check (public.is_active_user());

-- Supabase Realtime publication (idempotent).
do $$
declare
  t text;
  tables text[] := array['profiles','workers','pieceSizes','monthlyRates','productionRecords','monthStatuses','auditLogs','settings','zeroAudits'];
begin
  foreach t in array tables loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then
      null;
    end;
  end loop;
end $$;
