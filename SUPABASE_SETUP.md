# Supabase setup

This version removes Firebase and uses Supabase only.

## 1. Create a Supabase project

Create a project at https://supabase.com/ and open its SQL Editor.

## 2. Run the database schema

Run the complete `supabase-schema.sql` file.

It creates:
- username/password profiles
- workers, piece sizes, rates, production records, month statuses
- audit logs, settings and zero audits
- Row Level Security
- Supabase Realtime publication

## 3. Environment variables

Copy `.env.example` to `.env` and set:

- `VITE_SUPABASE_URL` = Supabase Project URL
- `VITE_SUPABASE_ANON_KEY` = Supabase publishable/anon key
- `SUPABASE_URL` = same project URL (server only)
- `SUPABASE_SERVICE_ROLE_KEY` = Supabase service-role key (server only; never use a VITE_ prefix)
- `SUPABASE_ADMIN_USERNAME` = `admin` by default
- `SUPABASE_ADMIN_PASSWORD` = existing Admin password (`1234` in the supplied project)

The server automatically creates the Admin Supabase Auth user on first start if it does not already exist.

## 4. Start

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Authentication behavior

- Admin login stays username/password based and keeps the supplied hard-coded Admin credentials.
- Supervisors are created by the Admin.
- Supervisor credentials use username/password only; no Gmail is required.
- Supabase Auth persists the session in the browser, so closing/reopening the website does not require another login.
- Admin can enable/disable supervisors, change passwords, and force logout all sessions.
- Disabling or changing a supervisor password forces their existing sessions out.

## Realtime behavior

Operational tables are subscribed through Supabase Realtime. A supervisor saving a production entry causes the Admin dashboard to receive the database change without a manual refresh.


## Required server environment
The Node server needs these variables (the client only needs the VITE_ variables):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server only; never expose this in frontend code)
- `SUPABASE_ADMIN_USERNAME` (optional; defaults to `admin`)
- `SUPABASE_ADMIN_PASSWORD` (optional; defaults to the existing hard-coded `1234`)

The browser needs:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Run `supabase-schema.sql` once in the Supabase SQL Editor. Realtime must include `profiles` plus the operational tables listed in the SQL.

Firebase is not used by this project.
