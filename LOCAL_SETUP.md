# Local setup

This project now uses Supabase only. Firebase is not required.

1. Create a Supabase project.
2. Run `supabase-schema.sql` in Supabase SQL Editor.
3. Copy `.env.example` to `.env`.
4. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`.
5. Start with `npm install` and `npm run dev`.

The server provisions the Admin account only when `SUPABASE_ADMIN_USERNAME` and a strong `SUPABASE_ADMIN_PASSWORD` are configured. No default password is embedded in the app.
