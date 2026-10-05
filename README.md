# Production Management

Production register with the existing React UI, Supabase PostgreSQL, Supabase Auth, and Supabase Realtime.

## Main behavior

- Admin uses the existing hard-coded username/password login.
- Admin creates and manages Supervisor accounts.
- Supervisor login uses username + password only; no Gmail is required.
- Supabase Auth persists sessions in the browser.
- Admin can enable/disable supervisors, change passwords, and force logout all sessions.
- Production data is stored in Supabase and synchronizes through Supabase Realtime.
- Firebase has been removed from the application.

## Setup

See `SUPABASE_SETUP.md` and run `supabase-schema.sql` in the Supabase SQL Editor.

Then create `.env` from `.env.example` and set the Supabase URL, public key, and server-only service-role key.

## Development

```bash
npm install
npm run dev
```

The app runs on port 3000.
