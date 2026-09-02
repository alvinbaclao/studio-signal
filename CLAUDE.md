# Dance Studio Messenger V2 — frontend

A responsive React web app (Vite + TypeScript + react-router-dom), backed by a
Supabase project whose schema, RLS and business logic are already finished and
tested. This file is what every Claude Code session in this repo reads first —
keep it short; put detail in `docs/`.

## Read before doing anything else

- **`docs/PROJECT_KNOWLEDGE.md`** — the full spec: tables, RPC functions, the
  design system, terminology, and every standing rule below explained in
  depth. Read this in full at the start of a new session, and re-read the
  relevant section before touching anything unfamiliar (registration, the
  scheduling rule, Bulletin scoping).
- **`docs/BUILD_PLAN.md`** — the ordered build sequence, one task per
  screen-group, each naming the exact artboard reference, tables/functions it
  touches, and how to verify it before moving to the next. Work through it in
  order; don't skip ahead into a later step's tables/functions.
- **`../backend/README.md`** (sibling directory, same repo root if you cloned
  both, otherwise wherever the backend lives) — why the schema is shaped the
  way it is, if you need the reasoning rather than just the rule.

## The four rules that must never be broken

1. **The database schema is fixed by default.** Before proposing a
   migration, an `ALTER TABLE`, a new RLS policy, or any schema change,
   stop and say what you think is missing — the answer is almost always
   that the data already exists under a different name. See
   `docs/PROJECT_KNOWLEDGE.md` for the full table list. When a change is
   genuinely needed: this repo is linked to the live Supabase project via
   the Supabase CLI (`supabase/` — `npx supabase link` already run, see
   `supabase/config.toml`); write it as a versioned migration file under
   `supabase/migrations/`, show the complete SQL, and get an explicit
   go-ahead **for that specific change** before running `supabase db push`
   (or any other command that applies it to the live database). Never
   apply a schema change without that confirmation, even if a similar one
   was approved earlier in the same session.
2. **Never implement a permission check in application code as the actual
   safety boundary.** Every rule is enforced by Postgres RLS already. Hiding
   a button for someone who couldn't do the action anyway is fine and
   expected; relying on that hidden button as the only thing stopping them is
   not — the database must refuse it too, and already does.
3. **`person.auth_user_id` is written by exactly two functions, both in the
   database, never by this codebase**: `app.redeem_invite` and
   `app.redeem_join_code`. Never write to that column from a client. Never
   look up a person by matching an email address to the auth user's email.
4. **`app.my_confirmed_person_ids()` vs. `app.my_person_ids()` /
   `app.visible_person_ids()` is a security-relevant distinction, not a style
   choice.** Anything deciding whether someone may DO something traces to the
   confirmed-only helper; anything deciding what someone may SEE of their own
   account uses the any-status ones. Get this backwards and either a pending
   instructor gets real access, or a pending parent can't see their own
   registration. See `docs/PROJECT_KNOWLEDGE.md`'s "Auth and registration"
   section before writing any code that touches `person.status`.

## Conventions this codebase already follows — extend them, don't replace them

- Supabase client and the `app.*` RPC helper: `src/lib/supabase.ts` — use
  `callApp('function_name', { p_arg: value })` for every `app` schema call,
  never a raw `.schema('app').rpc(...)` inline, so argument-name typos (the
  single most common failure mode against this backend) surface in one place.
- Auth/session/current-person state: `src/lib/AuthProvider.tsx` — use
  `useAuth()`, don't build a second session listener.
- Design tokens: `src/styles/tokens.css`, loaded globally. Every colour used
  anywhere in this app must be one of these custom properties — never a
  hard-coded hex value, and never a new colour invented for a new screen.
- Types: `src/lib/database.types.ts` is **generated**, never hand-edited —
  see the comment at the top of that file for the regeneration command. If it
  still says PLACEHOLDER, generate it for real before writing screens that do
  anything nontrivial with query results.
- Every `INSERT` into `team`, `comp_team`, `post`, or `essentials_item` must
  set `season_id` explicitly (the studio's current season) — there is no
  database default.
- A query returning fewer rows than expected is almost always RLS working
  correctly, not a bug — see `docs/PROJECT_KNOWLEDGE.md`'s standing rules
  before "fixing" a query by widening it.

## Workflow

- One feature/screen per commit, matching `docs/BUILD_PLAN.md`'s prompts.
  Small, reviewable commits are this project's equivalent of Lovable's
  "revert, don't patch" discipline — if something's wrong, `git revert` or
  fix forward with a real diff, don't regenerate the file from scratch.
- Run `npm run build` (TypeScript check + Vite build) before considering a
  prompt done — treat a type error the same as a failing test.
- Check the real screen, not just a component in isolation — run `npm run
  dev` and load it, or use a browser tool if one is available in this
  session, especially for anything involving the responsive breakpoints
  (390px phone / 1440px Director console) or the empty/offline distinction on
  Schedule.
- Test as more than one role. Half the bugs in this product are invisible
  from the Director account alone — see `docs/BUILD_PLAN.md`'s cross-account
  audit step, and don't wait until then to start doing this informally.
