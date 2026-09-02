# Dance Studio Messenger V2 — project knowledge

Read this in full once, at the start of building this app, and re-read the
relevant section before touching anything unfamiliar. `CLAUDE.md` at the repo
root carries the four highest-stakes rules as a short reminder every session
sees automatically; this file is the detail behind them.

## What this is
Replaces the mix of Facebook, WhatsApp and email that dance studios use to
tell dancers and parents when and where to be. One responsive React web app:
a Director console at 1440px and phone screens at 390px, same codebase, real
breakpoints — not two layouts. Later wrapped as a native app (Despia) — so it
must work as a plain web app first, and must not depend on anything a browser
cannot do.

Its one job: a parent in a theatre car park at 6:40am, on one bar of signal,
gets the call time in under two seconds. Every design decision serves that.

This is the **V2 rebuild**, on its own fresh Supabase project (`../backend/`
in this repo, or wherever you cloned it). V1 (built earlier via Lovable) is a
separate, still-live app and database — nothing here touches it. V2 adds
self-serve registration (join codes, not just Director invites), a
whole-studio destination alongside Teams and Comp Teams, a Bulletin/Essentials
feed system, and a corrected competition data model.

## THE DATABASE IS FIXED BY DEFAULT
Supabase already holds a complete schema with RLS on every table, smoke-tested
end to end against a real Postgres. It was designed from a written spec
before any UI existed.

**Default to never creating, altering or dropping a table or column, and
never writing, changing or disabling an RLS policy.** If a feature seems to
need a schema change, first stop and say so instead of jumping to a
migration — the answer is almost always that the data already exists under
a different name. When a change is genuinely needed, see CLAUDE.md's Rule 1:
write it as a versioned migration under `supabase/migrations/`, show the
complete SQL, and get explicit confirmation for that specific change before
running `supabase db push`.

**Never implement a permission check as the actual safety boundary in this
codebase.** Every rule is already enforced by Row-Level Security in the
database. Client-side checks are for hiding UI only, never for safety, and
must never be the reason something is allowed — the database refuses it
regardless of what the UI shows.

Existing tables: `studio`, `season`, `person`, `person_role_assignment`,
`guardian_link`, `studio_space`, `dance_style`, `person_dance_style`, `team`,
`team_member`, `comp_team`, `comp_team_cast`, `comp_team_source_team`,
`competition`, `competition_entry`, `event`, `booking_request`, `media_item`,
`post`, `post_media`, `reaction`, `essentials_item`, `message_thread`,
`thread_participant`, `message`, `thread_read_state`, `person_invite`,
`studio_join_code`.

Views (use these, don't recompute them in application code):
`person_with_login` (adds `has_own_login`), `booking_request_age` (adds `age`
and `is_escalated` for the pending-3-days rule), `person_invite_status`
(derives pending/accepted/revoked/expired).

Helper functions you may call, all security-checked server-side:
`app.is_director(studio_id)`, `app.is_instructor(studio_id)`,
`app.teams_i_teach()`, `app.comp_teams_i_choreograph()`,
`app.teams_i_can_see()`, `app.comp_teams_i_can_see()`, `app.my_person_ids()`,
`app.my_confirmed_person_ids()`, `app.visible_person_ids()`,
`app.threads_i_can_see()`. Call every one of these through
`callApp()` in `src/lib/supabase.ts`, never a bare `.schema('app').rpc(...)`
inline.

**`my_person_ids()` / `visible_person_ids()` vs. `my_confirmed_person_ids()`
— not interchangeable, and picking the wrong one is a real security bug, not
a style choice.** The first two are *identity* — any status, including
pending — because a pending person still needs to see their own record and
their own "waiting for approval" state. `my_confirmed_person_ids()` is
*permission* — confirmed only — and is what every capability check
(`is_director`, `is_instructor`, `teams_i_teach`, `comp_teams_i_choreograph`)
is built on. If you're writing a query that decides whether someone may DO
something (post, message, manage, cast), it should trace back to
`my_confirmed_person_ids()`. If it decides what someone may SEE of their own
account, `my_person_ids()`/`visible_person_ids()` is correct as-is.

## Auth and registration — TWO mechanisms, use the functions, don't reinvent

A `person` row can arrive one of two ways. Both are already built, tested,
and must never be reinvented or merged into one flow.

**1. Director-first invite** — for one known contact the Director already has
an email for.
- Director invites: `callApp('create_invite', { p_person_id, p_email })` →
  returns a raw token ONCE.
- Invitee signs up via Supabase Auth, then the app calls
  `callApp('redeem_invite', { p_token: token })`.
- **`app.redeem_invite` is the only thing that may ever set
  `person.auth_user_id` via this path.** Never write to that column from the
  client. Never match a user to a person by email.
- Before creating a person this way, call
  `callApp('find_person_by_email', { p_studio_id, p_email })`. If it returns
  someone (any status), add a role to that person — never create a second
  person row. It also returns `status`, so you can tell "already pending from
  a join code" apart from "already confirmed."
- A person created this way defaults to `status = 'confirmed'` — a Director
  invite is itself the vetting.

**2. Self-serve join code** — the general "post a code, community joins
itself" case, and the actual fix for the Director-bottleneck problem V2
exists to solve.
- A Director rotates a code per role scope:
  `callApp('rotate_join_code', { p_studio_id, p_scope, p_expires_at,
  p_max_uses })` where `p_scope` is `'parent_dancer'` or `'instructor'` —
  **never interchangeable.** Returns the plain code string to display/share
  (QR or short code). Rotating replaces the old code in place immediately.
- A brand-new person signs up via Supabase Auth, then the app calls
  `callApp('redeem_join_code', { p_code, p_scope, p_self_role, p_registrant
  })` where `p_self_role` is `'parent'`/`'dancer'` for the `parent_dancer`
  scope, or `'instructor'` for the `instructor` scope. This is the only
  other thing that may ever set `person.auth_user_id` — for the caller's own
  row, always.
- **The row this creates always has `status = 'pending'`** — invisible to
  every role's roster/team/thread queries except the Director's own and the
  row's own owner, already enforced by RLS. Don't re-filter it in
  application code, and don't assume a query returning fewer rows than
  expected means the data is missing.
- A parent then adds their dancer(s) with **no code, no separate login**:
  `callApp('register_dancer', { p_parent_person_id, p_dancer })`. This is
  the ONLY thing that may create a dancer sub-record; it never sets
  `auth_user_id` on the dancer's row (dancers under 18 have no login, ever)
  and creates the `guardian_link` with `can_edit = true` in the same call.
  Never build a two-step "create person, then link guardian" flow — see
  `docs/BUILD_PLAN.md`'s roster prompt for why that fails silently.
- **Director confirmation is per-person, not per-family.** A Director can
  confirm a recognized parent and two of three listed dancers while
  declining the third. Confirm is a plain
  `supabase.from('person').update({ status: 'confirmed' }).eq('id', id)` —
  RLS already restricts this to a Director. Decline calls
  `callApp('decline_pending_person', { p_person_id, p_reason })`.
- **Instructors: assignment IS the confirmation, no separate approve
  click.** An instructor who redeems the instructor code is `pending` with
  zero visibility — same as anyone else. The moment a Director assigns them
  to a `team` (insert into `team_member` with role `instructor`) or casts
  them on a `comp_team` (insert into `comp_team_cast` with role
  `choreographer`), a database trigger flips their status to `confirmed`
  automatically. Don't build a separate confirm button for instructors — the
  existing assignment action already does it.

**Dancers under 18 have no login.** Whether they arrive via Director invite
(never invited directly — the parent is) or self-serve (`register_dancer`,
never `redeem_join_code`), the rule is the same and it is enforced by the
database, not a UI nicety.

## Roles
One `person` can hold several roles: director, instructor, dancer, parent. A
dual-role person (a parent who also instructs) gets **one unified Home and
Schedule, not a role switcher** — every destination row carries a role chip
so it's clear whether an item is "your kid's" or "your class." Action
buttons (post, broadcast) appear only on destinations where the role held
there grants them.

- **Director** — everything, studio-wide.
- **Instructor** — manages only Teams they teach and Comp Teams they
  choreograph. Cannot create Teams, Comp Teams, competitions or their
  entries. Cannot create events; they submit a `booking_request` instead
  (folded into the Add-event flow's Event Type picker, not a separate
  screen). Can propose competition entries.
- **Dancer** — own schedule only.
- **Parent** — the same, via their children (`guardian_link`).

## The three-entity model — Team / Comp Team / Dance Competition

Do not conflate these; the schema and the UI both keep them separate:

1. **Team** — an ongoing class/level placement ("Jazz II", "Senior Team").
   The level a dancer trains in day to day. `team` / `team_member`.
2. **Comp Team** — a persistent performing unit: its own name, level,
   choreographer, roster (which may pull dancers from more than one Team),
   its own destination with Home/Schedule/Bulletin/Media/Essentials. Exists
   whether or not it is currently entered in a competition. `comp_team` /
   `comp_team_cast` / `comp_team_source_team`. Casting from a Team records
   the source (`comp_team_source_team`) — never derive it from the current
   cast list, since that breaks the moment a dancer leaves the source Team.
3. **Dance Competition** — the actual event (name, venue, date) that one or
   more existing Comp Teams get entered into over a season, sometimes more
   than once. `competition` / `competition_entry`. Call times live here, on
   the entry, and are optional at publish time — a competition can publish
   with entries reading "Not set yet," since hosts often haven't sent a real
   schedule yet.

Team assignment and competition casting are always two separate Director
actions — not everyone on a Team dances in every number, and a Comp Team's
roster often spans levels.

## Navigation architecture — two-tier

- **Primary nav (global):** Home / Schedule / Messaging / Profile.
- **Per-destination sub-nav**, inside every Team, Comp Team, or **Studio**
  (Studio is a full peer destination, not folded into the global Home tab):
  Home / Schedule / Bulletin / Media / Essentials.

Home aggregates the personal view (needs-you, next up, this week) across
everything a person belongs to. Studio is where whole-studio posts, media
and essentials live as their own browsable surface. Studio is pinned as the
first row atop the Teams & Comp Teams list — same discoverability as any
Team, no separate nav element.

## Bulletin, Media, Essentials — same scoping shape everywhere

Each of Studio, a Team, or a Comp Team has its own Bulletin, Media and
Essentials tab. All three use the same `content_scope` enum (`studio` /
`team` / `comp_team`) plus a nullable typed FK (`team_id` or `comp_team_id`,
exactly one set per scope, enforced by a check constraint) — the same
pattern `event` already used.

- **Bulletin (`post` / `post_media` / `reaction`).** Director/Instructor-
  authored only — students and parents never create posts. Reactions are
  lightweight, single-tap, **per-person visible** (not an aggregate count) —
  that's what makes "who hasn't acknowledged this" answerable. A post's
  `important` flag pushes to everyone in scope, reusing the same
  urgent-push pattern messaging already has; an ordinary post badges only.
  **Read scope for a `comp_team` post is cast members and the assigned
  choreographer (plus the Director) — NOT every confirmed studio member** —
  the same narrower visibility `comp_team_read` itself doesn't have to
  match. This is a real, easy-to-assume-wrong gap: verify it with more than
  one test account.
- **Media (`media_item`).** Director/Instructor uploads populate the
  library, scoped the same way. A post can attach an existing library item
  without duplicating the file; a post's own video attachment does **not**
  get added to the library. `media_item.processing_status` exists so the
  feed can show "still processing" instead of a broken thumbnail while
  client-side compression runs — video is compressed client-side before
  upload for v1, not server-transcoded. Thumbnail-first, tap-to-play, never
  autoplay.
- **Essentials (`essentials_item`).** A structured item list, not freeform
  notes: title, details, optional file-or-link, `item_type`
  (document/link/audio/note), Director/Instructor-ordered via `sort_order`.
  Deactivate-only (`archived_at`), same as Studio Spaces and dance styles —
  never hard-deleted, since past rosters/events still reference them; the
  Director sees archived items too.

## Season
`season` exists in the schema and every Team, Comp Team, post and
essentials item carries a `season_id`. The pilot only needs one current
season (`season.is_current`) — the Director-facing bulk copy-forward action
for rolling a studio into a new season is **out of scope for now.** Do not
build a rollover UI.

## The scheduling rule
Approval keys on whether an action changes studio space-time usage, not on
who acts. Director always writes directly. An instructor may edit an
event's title/notes and may cancel it, but changing date, time or space
raises a database error — that path must create a `booking_request`
instead. The Add-event button therefore reads **Create** for a Director and
**Send request** for an instructor changing schedule. Requesting studio
time is folded into Add Event's Event Type picker, not a separate screen.

## DESIGN SYSTEM — "Stage, warmed"

Already in `src/styles/tokens.css`, loaded globally — use the CSS custom
properties from there, never a hard-coded hex value or an invented colour.
Every pair was verified for WCAG AA; the lowest ratio in the system is
4.86:1.

Type: **Bricolage Grotesque** for times, countdowns, titles and tracked-caps
section labels (the `.font-display` utility class); **Instrument Sans**
(default body font) for row titles, body and meta. Two families, no
monospace. Times are set large — 26–52px — because time is the payload.

### Five rules
1. **Hierarchy is contrast and scale, never hue.** Sections are told apart
   by icon and label. Nothing gets its own colour.
2. **One saturated (amber) surface per zone, maximum** — at most one inside
   the dark band, at most one on paper.
3. **Amber has three forms, not interchangeable.** `--signal` on dark or as
   a fill only; `--signal-ink` is the ONLY text colour on an amber fill;
   `--signal-deep` for amber text or dots on any light surface. **White on
   amber is forbidden** (1.63:1).
4. **The dark band holds what needs a person.** Needs-you sits inside it,
   above Next up. Below the band is quiet paper. Nothing pressing ⇒ no band
   at all — build a `<Band>` component that renders `null` with no
   children, and use it everywhere rather than a styled-but-empty div.
5. **Schedules are hairline-separated rows with the time large on the
   left**, never a stack of cards. Build a `<ScheduleRow>` component once
   and reuse it everywhere: the global Schedule tab, every destination's own
   Schedule tab, both home screens' "This week", the Director's Today & this
   week.

### Components to build once, in `src/components/`, and reuse everywhere
- `Avatar` — `--sand` with `--ink-2` initials, or a photo. No per-person
  colour. Inside the band: `--band-card` with `--band-ink`.
- `Chip` — rest `--sand`/`--ink-2`; selected `--ink`/`--paper`.
- Unread badge/dot: `--signal-deep` on light, `--signal` on dark. Never bare
  `--signal` on white.
- Category/presence dot: `--ink-3`. Category comes from the label, not the
  dot.
- `PrimaryButton` (`--signal` + `--signal-ink`) — this IS the screen's one
  fill. `SecondaryButton` (`--sand` + `--ink`).
- Conflict/error: `--busy` text or a 3px rail on `--busy-tint`.
- Space picker (Add event, and Studio calendar review): the
  Available/Pending/Busy triad using `--ok`/`--wait`/`--busy`, each
  labelled in text. This is the one deliberate exception to rule 1. Do not
  use these colours elsewhere.
- `ReactionBar` — a row of small tap targets (single emoji/ack), each
  showing who reacted on tap/hover, used on every Bulletin post.

**On the 🔑/👤 banners, if you're looking at the design canvas
artboards for reference:** those gold/tan banners are a canvas-only
convention for a human scanning 73 mockups at once — they mark which shared
artboard carries admin-only controls. **Do not build them into this app.**
The real requirement they stand in for is ordinary role-conditional
rendering (`app.is_director()`, `teamsITeach`, `compTeamsIChoreograph`) —
see `src/styles/tokens.css`'s comment on this too.

## Empty and loading states
- An empty state names the reason and the next step. Never a bare "No
  data".
- Never show someone an action they cannot perform. A dancer with no team
  is not told to create one; they are told the studio will add them.
- **Empty must never look like offline.** A week with nothing scheduled
  says "Nothing scheduled this week". A week that could not load says
  "Can't load this week — you're offline". These must never be the same
  screen.
- Render cached content immediately and reconcile quietly. A stale time
  with an "as of" stamp beats a spinner. Do not gate a whole screen behind
  a loading spinner.
- A pending self-registration gets its own calm waiting state (already
  built — `src/pages/Waiting.tsx`), not an error and not a blank screen.

## Terminology — use these words in the UI
- **Team / Level** — a group that trains together (e.g. "Junior Comp
  Team").
- **Comp Team** — a competition performing unit: solo, duo, trio, small
  group, large group, production. **Never say "Group Dance"** — retired
  V1 terminology.
- **Dance Competition** (or just "competition" in running copy) — the
  actual event a Comp Team is entered into.
- **Studio Space** — a named room ("Studio A", "The Loft").
- **Call time** — when a dancer must arrive at a competition venue. The
  most important single value in the product.
- **Booking request** — an instructor asking for studio time. Not a
  "booking".
- **Bulletin / Essentials** — the two feed surfaces on Studio, Team and
  Comp Team.
- **Join code** — the self-serve registration mechanism. Never call it an
  "invite code" — that term is reserved for the Director-first, single-use
  invite chain.
- Say **dancer**, not "student". Say **Director**, not "admin" or "owner".

## Conventions
- Mobile-first CSS; the console is a genuine responsive layout, not one
  layout stretched.
- All times stored UTC, displayed in the studio's timezone
  (`studio.timezone`). Never use the device timezone.
- Dates as "Thursday 27 Aug"; times as "4:30p" / "8:15a" with the meridiem
  smaller.
- No emoji in the UI.

## Standing rules for every prompt
- Default to not creating, altering or dropping any table, column, policy
  or function. If something seems missing, stop and say what you think is
  missing first. A genuinely needed change goes through CLAUDE.md's Rule 1
  workflow (a versioned migration under `supabase/migrations/`, shown in
  full, confirmed for that specific change before `supabase db push`) —
  never applied silently.
- Every INSERT must set `studio_id` explicitly. There is no default and no
  trigger that fills it in.
- Every INSERT into `team`, `comp_team`, `post` or `essentials_item` must
  set `season_id` explicitly, to the studio's current season.
- `app`-schema functions are called via `callApp()` in `src/lib/supabase.ts`
  — never a bare `.schema('app').rpc(...)` inline.
- A query returning zero rows is usually RLS, not an empty table. RLS
  denials are SILENT for select/update/delete and only raise on insert.
  Never "fix" an empty screen by widening a query — say so instead. This is
  doubly true for anything involving `person.status = 'pending'`.
- Reuse the shared components already built. Never create a second
  `ScheduleRow`, a second Bulletin composer, a second space picker.
