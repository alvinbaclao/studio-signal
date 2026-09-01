# Setup — Claude Code, Supabase, and Vercel

Everything below is a one-time setup per machine/project. The scaffold in this
repo (this `frontend/` folder) already has the parts that don't depend on your
own accounts — a working Vite + React + TypeScript app, the design tokens
extracted, a Supabase client, an auth/person-loading hook, and a route
skeleton. It builds cleanly right now (`npm run build`) against placeholder
types; what's left is wiring it to a real Supabase project and a place to
deploy it.

---

## 0. What you need before starting

- **Node.js 20+** and npm. Check with `node --version`.
- **Git**, and a place to host the repo — GitHub is assumed below since it's
  what Vercel connects to most directly, but any git host Vercel supports
  works.
- **A Supabase account** (supabase.com) — free tier is fine for the pilot.
- **A Vercel account** (vercel.com) — free tier is fine.
- **Claude Code** installed and available from a terminal (`claude` command),
  or this repo opened in an environment that already has it (like this one).

---

## 1. The Supabase project and backend — do this first, unchanged from before

This part has nothing to do with which frontend tool you use — it's exactly
the process `backend/README.md` and the old `START_HERE.md` already
documented, repeated here for completeness:

1. **supabase.com → New project.** Save the database password somewhere
   real.
2. **SQL Editor → run the four migrations in order**, checking each succeeds
   before the next:
   `backend/migrations/0001_schema.sql` → `0002_rls.sql` → `0003_invites.sql`
   → `0004_join_codes.sql`. Do **not** run `backend/local/00_supabase_shim.sql`
   — that's the local-Postgres test-only shim; real Supabase already provides
   everything in it.
3. **Check it landed** — run the verification queries in `backend/README.md`
   ("Check it landed"): expect 28 tables, 76 policies, zero tables without
   RLS, 19 functions in the `app` schema.
4. **Project Settings → API → Data API → Exposed schemas** → add `app`, so
   the list reads `public, app`. Without this every `app.*` call returns
   `PGRST202 — function not found`, which reads exactly like a missing
   function and is the single most expensive false trail in this build.
5. **Authentication → Users → Add user** — create your own login (tick
   **Auto Confirm User**).
6. **SQL Editor → run `backend/bootstrap_director.sql`**, after editing the
   five values at the top (studio name, timezone, your name, your email, your
   first season's name/dates). This creates your studio, your first season,
   and makes you Director — the one place anyone ever writes `auth_user_id`
   by hand.
7. **Settings → API** — copy your **Project URL** and **anon public key**.
   You'll need these in step 3 below. (The anon key is safe to put in client
   code and in Vercel's public env vars — every table has RLS forced, so the
   key alone grants nothing; see `backend/README.md` if that's surprising.)

---

## 2. Get this repo under git and open it with Claude Code

If you haven't already:

```bash
cd frontend        # this directory
git init
git add -A
git commit -m "Initial V2 frontend scaffold"
```

Create an empty repo on GitHub (no README/gitignore — this repo already has
both) and push:

```bash
git remote add origin git@github.com:<you>/dance-studio-messenger-v2.git
git branch -M main
git push -u origin main
```

Then open a Claude Code session with this directory as the working directory
— either `claude` from a terminal in `frontend/`, or (if you're continuing
from this same Cowork session with a linked computer) point a session at this
folder. **`CLAUDE.md` at the repo root is read automatically** — you don't
need to paste anything into a chat window the way Lovable's Project Knowledge
required. If you want the fuller spec loaded too, tell Claude Code to read
`docs/PROJECT_KNOWLEDGE.md` at the start of the first session — it's written
to be read in full once, not re-pasted per prompt.

---

## 3. Wire up your Supabase project

```bash
cp .env.example .env.local
```

Edit `.env.local` and fill in the URL and anon key from step 1.7:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

`.env.local` is already in `.gitignore` — never commit it.

### Generate real types from your schema

The scaffold ships with `src/lib/database.types.ts` as a placeholder (`type
Database = any`) so the build works before you've connected anything. Once
your Supabase project has all four migrations applied, generate the real
types:

```bash
npx supabase login          # one-time, opens a browser
npx supabase gen types typescript --project-id <your-project-ref> \
  --schema public,app > src/lib/database.types.ts
```

Find `<your-project-ref>` in your Supabase project's URL or Settings → General.
Re-run this command any time you're unsure the types are current — though the
schema itself should never change (see `docs/PROJECT_KNOWLEDGE.md`, "THE
DATABASE IS FIXED"), so in practice this is a run-once step.

### Run it locally

```bash
npm install   # if you haven't already
npm run dev
```

Open the printed local URL, sign in with the login you created in step 1.5.
You should land — once Prompt 1 in `docs/BUILD_PLAN.md` is built — as the
Director.

---

## 4. Deploy to Vercel

Vercel auto-detects Vite; no config file needed for a standard setup.

1. **vercel.com → Add New → Project → import your GitHub repo.**
2. Vercel should detect **Framework Preset: Vite** automatically. Build
   command `npm run build`, output directory `dist` — these are Vite's
   defaults and Vercel picks them up on its own; confirm them if asked.
3. **Environment Variables** — add the same two from `.env.local`:
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Set them for
   Production, Preview, and Development so preview deploys work too.
4. **Deploy.** Vercel gives you a `*.vercel.app` URL immediately, and a new
   preview deploy on every pushed branch/PR from here on — useful for
   checking a screen on a real phone before merging, which
   `docs/BUILD_PLAN.md` asks you to do at the end of nearly every prompt.
5. Add a custom domain later from the same project's Settings → Domains, if
   you want one — not required to keep building.

From here, the normal loop is: Claude Code builds/edits locally → you review
the diff and run `npm run build` → commit → push → Vercel deploys
automatically. No separate "publish" step to remember.

---

## 5. Why this stack, briefly

**Vite + React SPA, not Next.js.** This app is entirely client-side and
RLS-driven — every read and write goes through the Supabase client with the
signed-in person's own credentials, so there's no meaningful server-rendering
job to do, and a plain static SPA is by far the simplest thing that can be
correct here. It also matters later: the eventual Despia wrap (turning this
web app into iOS/Android binaries) needs the **assets bundled locally in the
binary**, not fetched on every launch — a static Vite build is about as
easy as that gets to bundle. A Next.js app with server rendering would add
real complexity to that step for no benefit this app needs.

**One web codebase, not React Native**, per your own call and the reasoning
already on file: the 73 design-canvas artboards are real HTML/CSS, and the
"Stage, warmed" tokens in `src/styles/tokens.css` port into ordinary CSS
custom properties almost literally. React Native has no CSS grid, a different
flexbox/shadow model, and no `position: sticky` — the same tokens would need
re-expressing and would drift from this file over time. If a native-feel
wrap is wanted later, that's what Despia (or its fallback, Capacitor) is for
— see `stack-revision-2026-08-25.md` if you have access to the Claude
project, or ask a future session to pull it up.

**Vercel over Netlify/Cloudflare Pages** — no strong technical reason over
the alternatives for a project this size; picked for the zero-config Vite
detection and the preview-deploy-per-branch workflow, which pairs well with
Claude Code's per-feature commits. Any of the three would work.

---

## 6. What's already in this scaffold vs. what `docs/BUILD_PLAN.md` builds

Already here and working: the Vite/TS/React setup, `src/lib/supabase.ts`
(client + the `callApp()` RPC helper), `src/lib/AuthProvider.tsx` (session +
current-person loading, following the exact `auth_user_id` rule from
`CLAUDE.md`), `src/styles/tokens.css` (every design token), a route skeleton
in `src/App.tsx` with a pending/not-linked/signed-out gate already wired.

Everything else — actually redeeming an invite or join code, the responsive
shell and nav, every real screen — is `docs/BUILD_PLAN.md`, starting at
Prompt 1.
