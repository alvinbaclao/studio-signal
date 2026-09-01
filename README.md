# Dance Studio Messenger V2 — frontend

A responsive React web app for a dance studio's day-to-day: schedules, call
times, messaging, and now self-serve registration, Bulletin/Media/Essentials,
and a corrected Team/Comp Team/Dance Competition data model. Backed by a
Supabase project whose schema and RLS are already built and tested — see
`../backend/` (sibling directory).

**Start here:** `docs/SETUP.md` — environment setup, Supabase connection,
running locally, deploying to Vercel. Then `docs/PROJECT_KNOWLEDGE.md` for the
full spec, and `docs/BUILD_PLAN.md` for the ordered build sequence. `CLAUDE.md`
at the repo root is the short version Claude Code reads automatically.

## Quick start (once `docs/SETUP.md`'s one-time setup is done)

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project's URL + anon key
npm run dev
```

## Stack

Vite + React + TypeScript, react-router-dom, `@supabase/supabase-js`. Deploys
to Vercel as a static SPA (chosen specifically so it's trivial for Despia to
bundle locally later — see `stack-revision-2026-08-25.md` in the Claude
project if you have access to it, or `docs/SETUP.md`'s note on why).
