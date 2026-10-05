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
- `BREVO_API_KEY` = Brevo API key for security OTP email
- `SECURITY_OTP_EMAIL` = Admin/security email that receives password-change OTPs (for this setup: `ta480105@gmail.com`)
- `OTP_FROM_EMAIL` = verified Brevo sender email (for this setup: `ta480105@gmail.com`)
- `OTP_FROM_NAME` = sender name shown in OTP email
- `VITE_SUPABASE_ANON_KEY` = Supabase publishable/anon key
- `SUPABASE_URL` = same project URL (server only)
- `SUPABASE_SERVICE_ROLE_KEY` = Supabase service-role key (server only; never use a VITE_ prefix)
- `SUPABASE_ADMIN_USERNAME` = desired Admin username (defaults to `admin` for bootstrap only)
- `SUPABASE_ADMIN_PASSWORD` = initial Admin password (minimum 8 characters; no hard-coded default)

The server creates the Admin Supabase Auth user on first start only when the server-side Admin username/password variables are configured.

## 4. Start

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Authentication behavior

- Admin login stays username/password based; credentials are no longer hard-coded in the frontend.
- Supervisors are created by the Admin.
- Supervisor credentials use username/password only. Security email OTP is used only when the Admin changes the Supervisor password.
- Supabase Auth persists the session in the browser, so closing/reopening the website does not require another login.
- Only one Supervisor account can exist. Admin can enable/disable it and force logout all sessions. Supervisor password changes require email OTP verification.
- Disabling or changing a supervisor password forces their existing sessions out.

## Realtime behavior

Operational tables are subscribed through Supabase Realtime. A supervisor saving a production entry causes the Admin dashboard to receive the database change without a manual refresh.


## Required server environment
The Node server needs these variables (the client only needs the VITE_ variables):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server only; never expose this in frontend code)
- `SUPABASE_ADMIN_USERNAME` (optional; defaults to `admin`)
- `SUPABASE_ADMIN_PASSWORD` (required for first-time Admin bootstrap; minimum 8 characters)

The browser needs:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Run `supabase-schema.sql` once in the Supabase SQL Editor. Realtime must include `profiles` plus the operational tables listed in the SQL.

Firebase is not used by this project.


## Brevo OTP sender setup

For this setup, security OTPs are configured to be sent **from and to `ta480105@gmail.com`**.
Before deploying, verify `ta480105@gmail.com` as a sender in Brevo. Keep `BREVO_API_KEY` server-only and never put it in a `VITE_` variable or frontend source.

The API key is intentionally not included in this ZIP. Add your own Brevo API key to the server environment as `BREVO_API_KEY`.
