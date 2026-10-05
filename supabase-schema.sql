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


create or replace function public.is_month_open(p_month text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_month is null or p_month = '' then false
    else coalesce(
      (
        select (data->>'status') = 'OPEN'
          and coalesce((data->>'isClosed')::boolean, false) = false
        from public."monthStatuses"
        where id = p_month
        limit 1
      ),
      p_month = to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM')
    )
  end;
$$;

grant execute on function public.is_month_open(text) to authenticated;

-- Called by every live client when it starts. It makes the month rollover
-- authoritative in PostgreSQL and therefore visible to all clients through Realtime.
create or replace function public.ensure_month_statuses()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_month text := to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM');
  previous_month text := to_char((date_trunc('month', now() at time zone 'Asia/Kolkata') - interval '1 month'), 'YYYY-MM');
  current_created boolean := false;
  previous_locked boolean := false;
begin
  if not public.is_active_user() then
    raise exception 'Authentication required';
  end if;

  insert into public."monthStatuses" (id, data, updated_at)
  values (
    current_month,
    jsonb_build_object('month', current_month, 'status', 'OPEN', 'isClosed', false),
    now()
  )
  on conflict (id) do nothing;
  current_created := found;

  insert into public."monthStatuses" (id, data, updated_at)
  values (
    previous_month,
    jsonb_build_object('month', previous_month, 'status', 'LOCKED', 'isClosed', false, 'autoLockedAt', now()::text),
    now()
  )
  on conflict (id) do nothing;
  previous_locked := found;

  update public."monthStatuses"
  set data = data || jsonb_build_object('month', previous_month, 'status', 'LOCKED', 'isClosed', false, 'autoLockedAt', now()::text),
      updated_at = now()
  where id = previous_month
    and coalesce(data->>'status', '') = 'OPEN'
    and coalesce((data->>'isClosed')::boolean, false) = false
    and not (data ? 'unlockedAt');

  return jsonb_build_object(
    'currentMonth', current_month,
    'previousMonth', previous_month,
    'currentCreated', current_created,
    'previousCreated', previous_locked
  );
end;
$$;

grant execute on function public.ensure_month_statuses() to authenticated;


-- Prevent duplicate worker/date/piece-size entries even when two clients submit at once.
create unique index if not exists production_records_worker_date_piece_unique
on public."productionRecords" ((data->>'workerId'), (data->>'date'), (data->>'pieceSizeId'));

-- Server/database authority for identity and financial fields.
create or replace function public.enforce_record_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_username text;
  profile_role public.user_role;
  rate_value numeric;
  worker_status text;
begin
  if auth.uid() is not null then
    select username, role into profile_username, profile_role
    from public.profiles where id = auth.uid() and active = true;
    if profile_username is null then raise exception 'Active profile required'; end if;
  end if;

  if tg_table_name = 'auditLogs' then
    if auth.uid() is not null then
      new.data := new.data || jsonb_build_object('user', profile_username, 'role', profile_role::text);
    end if;
    return new;
  end if;

  if tg_table_name = 'productionRecords' then
    if new.data->>'month' is null or new.data->>'date' is null then raise exception 'Production date and month are required'; end if;
    if substring(new.data->>'date' from 1 for 7) <> new.data->>'month' then raise exception 'Production date does not match month'; end if;
    if coalesce((new.data->>'quantity')::numeric, -1) < 0 then raise exception 'Quantity cannot be negative'; end if;

    select coalesce(data->>'status', 'deleted') into worker_status
    from public.workers where id = new.data->>'workerId';
    if worker_status <> 'active' then raise exception 'Only active workers can receive production entries'; end if;

    select coalesce((data->'rates'->>(new.data->>'pieceSizeId'))::numeric, 0) into rate_value
    from public."monthlyRates" where id = new.data->>'month' or data->>'month' = new.data->>'month'
    order by id desc limit 1;
    new.data := new.data || jsonb_build_object('applicableRate', coalesce(rate_value, 0));
    if auth.uid() is not null then
      new.data := new.data || jsonb_build_object('enteredBy', case when profile_role = 'ADMIN' then 'Admin' else 'Supervisor' end);
    end if;
  end if;

  return new;
end;
$$;

DROP TRIGGER IF EXISTS audit_log_integrity_trigger ON public."auditLogs";
CREATE TRIGGER audit_log_integrity_trigger
BEFORE INSERT OR UPDATE ON public."auditLogs"
FOR EACH ROW EXECUTE FUNCTION public.enforce_record_integrity();

DROP TRIGGER IF EXISTS production_record_integrity_trigger ON public."productionRecords";
CREATE TRIGGER production_record_integrity_trigger
BEFORE INSERT OR UPDATE ON public."productionRecords"
FOR EACH ROW EXECUTE FUNCTION public.enforce_record_integrity();

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


-- Month locks are database-enforced for production and rates, regardless of UI/client state.
drop policy if exists "admin insert" on public."productionRecords";
drop policy if exists "admin update" on public."productionRecords";
drop policy if exists "admin delete" on public."productionRecords";
create policy "admin insert" on public."productionRecords" for insert to authenticated with check (public.is_admin() and public.is_month_open(data->>'month'));
create policy "admin update" on public."productionRecords" for update to authenticated using (public.is_admin() and public.is_month_open(data->>'month')) with check (public.is_admin() and public.is_month_open(data->>'month'));
create policy "admin delete" on public."productionRecords" for delete to authenticated using (public.is_admin() and public.is_month_open(data->>'month'));

drop policy if exists "admin insert" on public."monthlyRates";
drop policy if exists "admin update" on public."monthlyRates";
create policy "admin insert" on public."monthlyRates" for insert to authenticated with check (public.is_admin() and public.is_month_open(data->>'month'));
create policy "admin update" on public."monthlyRates" for update to authenticated using (public.is_admin() and public.is_month_open(data->>'month')) with check (public.is_admin() and public.is_month_open(data->>'month'));

-- Supervisors may create production records and audit records only.
drop policy if exists "supervisor production insert" on public."productionRecords";
create policy "supervisor production insert" on public."productionRecords"
for insert to authenticated
with check (public.is_active_user() and public.is_month_open(data->>'month'));

drop policy if exists "supervisor audit insert" on public."auditLogs";
create policy "supervisor audit insert" on public."auditLogs"
for insert to authenticated
with check (public.is_active_user());


-- Supervisors have full operational access to the Monthly Calendar while active.
drop policy if exists "supervisor production update" on public."productionRecords";
create policy "supervisor production update" on public."productionRecords"
for update to authenticated
using (public.is_active_user() and public.is_month_open(data->>'month'))
with check (public.is_active_user() and public.is_month_open(data->>'month'));

drop policy if exists "supervisor production delete" on public."productionRecords";
create policy "supervisor production delete" on public."productionRecords"
for delete to authenticated
using (public.is_active_user() and public.is_month_open(data->>'month'));

drop policy if exists "supervisor monthly rate update" on public."monthlyRates";
create policy "supervisor monthly rate update" on public."monthlyRates"
for update to authenticated
using (public.is_active_user() and public.is_month_open(data->>'month'))
with check (public.is_active_user() and public.is_month_open(data->>'month'));

drop policy if exists "supervisor monthly rate insert" on public."monthlyRates";
create policy "supervisor monthly rate insert" on public."monthlyRates"
for insert to authenticated
with check (public.is_active_user() and public.is_month_open(data->>'month'));

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
