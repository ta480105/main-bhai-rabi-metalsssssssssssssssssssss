# Local setup

This project now uses Supabase only. Firebase is not required.

1. Create a Supabase project.
2. Run `supabase-schema.sql` in Supabase SQL Editor.
3. Copy `.env.example` to `.env`.
4. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`.
5. Start with `npm install` and `npm run dev`.

The server provisions the existing hard-coded Admin account (`admin` / `1234` by default) in Supabase Auth on first startup. Change the server environment password before production use if you want a different Admin password.
