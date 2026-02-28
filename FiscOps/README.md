# FiscOps (phase test) — GitHub ➜ Vercel + Supabase

## Déploiement Supabase (gratuit)
1) Crée un projet Supabase
2) Dans **SQL Editor**, exécute dans l’ordre :
- `supabase/migrations/001_init.sql`
- `supabase/migrations/002_rls_test.sql`
- `supabase/seed/001_seed_owendo.sql`

3) Supabase → Authentication → Providers → **Email ON**
- (Test) désactive la confirmation email si tu veux une connexion immédiate.

## Déploiement Vercel
1) Push ce repo sur GitHub
2) Vercel → New Project → Import Git Repo
3) Vercel → Settings → Environment Variables :
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

4) Deploy

## Utilisation (test)
- Ouvre l’URL Vercel
- Crée un compte email (IFU1..IFU5) puis connecte-toi
- Les données sont centralisées dans Supabase.
- Tous les comptes sont rattachés au centre OWENDO via trigger (phase test).

## Endpoints utiles
- `/api/health` → santé service
- `/env` → injecte les variables env dans le frontend
