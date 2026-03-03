# Lobster Agenda

Studio planning app for Roman & Lobster. Standalone frontend that shares the OPÉRA Supabase backend.

## Setup

### 1. Create users in Supabase Auth

Go to **Supabase Dashboard → Authentication → Users** and create 2 users:
- `roman@yourmail.com` / password
- `lobster@yourmail.com` / password

### 2. Apply migration (if not done via OPÉRA)

Run `supabase/migrations/0010_studio.sql` in Supabase SQL Editor.

### 3. Configure environment

```bash
cp .env.example .env.local
# Edit with your Supabase credentials (same as OPÉRA)
```

### 4. Install & run

```bash
npm install
npm run dev
```

Open http://localhost:3000, login with Roman or Lobster credentials.

## Deploy

Deploy to Vercel:

```bash
npx vercel
```

Set environment variables in Vercel dashboard.

## Features

- Weekly board with drag & drop
- MIX (10:00-16:00), SESSION (16:00-22:00), NIGHT (20:00-02:00)
- Fairness validation (prime rotation, MIX guarantees, night limits)
- Auto-seed 8 weeks
- Swap request system (coming soon)

## Shared Backend

Uses same Supabase project as OPÉRA:
- Tables: `studio_slots`, `studio_swap_requests`, `studio_ruleset`, `studio_members`
- Auth: Supabase Auth (separate from OPÉRA master key)
