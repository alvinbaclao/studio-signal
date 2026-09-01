# Build plan — the full V2 app, in order

One task per screen-group, in dependency order, each naming which
`design-reference/*.dc.html` artboard to port, which tables/functions it
touches, and how to verify it before moving to the next. This is the same
build sequence originally written for Lovable (`BUILD_PROMPTS_V2.md`, if you
have it), restructured for Claude Code: no chat-paste boxes, no
credit-conservation pacing — the guardrails that survive are the ones that
were never about the tool (never touch the schema, the RLS gotchas, the
timezone trap), not the ones that were (one screen per prompt to avoid
burning credits on a bad generation).

**Read `CLAUDE.md` and `docs/PROJECT_KNOWLEDGE.md` in full before starting
Task 1.** Everything below assumes you already know the standing rules —
they aren't repeated per task here.

## Conventions for this build

- Route-level screens: `src/pages/`. Shared, reused-everywhere components:
  `src/components/`. Anything domain-specific but used by more than one page
  (a Comp Team's cast editor, say): `src/features/<domain>/`. Don't
  over-organize ahead of need — start flat in `src/pages/` and `src/components/`
  and split into `features/` only once something is genuinely shared.
- One task below ≈ one commit (or a short small stack of commits if a task
  naturally splits). Small, reviewable diffs are this project's version of
  the old "revert, don't patch" discipline.
- `npm run build` clean (TypeScript + Vite) is the bar for "done" on every
  task, same as a passing test suite. Run it before moving to the next task.
- A task's **Verify** step is the same bar `testing-notes` held V1 to: don't
  mark a task done from reading the code, actually run the app and check it
  as the stated account(s).
- Still open across this whole plan, deliberately, same as the schema's own
  README says: the full pgTAP-equivalent frontend test suite, per-person
  notification preferences beyond the UI shell, CSV/bulk roster import,
  season rollover. None of these block shipping the pilot.

---

# STEP 1 — Registration completion and the Director's confirm queue

## Task 1 — Redeem both registration paths, and the auth gate

**Depends on:** the scaffold (already done — `src/lib/supabase.ts`,
`src/lib/AuthProvider.tsx`, `src/App.tsx`'s `Gate`). **Reference:** none (no
artboard covers this — it's the routing/data logic behind
`RegisterDancers.dc.html`/`InstructorProfile.dc.html`'s entry, and behind the
already-built `Waiting.tsx`/`NotLinked.tsx`).

**Touches:** `person`, `app.redeem_invite`, `app.redeem_join_code`.

Fill in the `TODO (Prompt 1)` comment already left in `src/App.tsx`'s `Gate`:

- **Director invite** — if the URL has `?invite=<token>`, call
  `callApp('redeem_invite', { p_token: token })` right after a session
  exists (don't wait for a button click). On success it returns the
  person's id — call `refreshPerson()` from `useAuth()` so the rest of the
  app picks up the new row. On error, show the message exactly as returned
  and a "Contact the studio" link — don't retry, don't fall back to any
  other lookup.
- **Join code** — a `/join` route reading `?code=<code>&scope=parent_dancer`
  or `?code=<code>&scope=instructor`. Show two entry tiles first if the URL
  has no scope — "I'm a parent registering my dancer(s)" / "I'm an adult
  dancer or instructor registering myself" — matching
  `RegisterDancers.dc.html` / `InstructorProfile.dc.html`'s framing. After
  sign-up, collect `{ full_name, email }` and call `callApp('redeem_join_code',
  { p_code, p_scope, p_self_role, p_registrant })` where `p_self_role` is
  `'parent'`/`'dancer'` for the `parent_dancer` scope or `'instructor'` for
  the `instructor` scope. Same rule: show the raw error, no fallback lookup.
- **The token/code must travel through the email confirmation redirect, not
  component state.** Supabase's email confirmation can open in a different
  tab or device, so pass it via
  `signUp({ ..., options: { emailRedirectTo: \`${origin}/invite?invite=${token}\` } })`
  (or the `/join?code=...&scope=...` equivalent) — never rely on it still
  being in memory when the user comes back. This also needs the exact
  redirect URL pattern added to Supabase's Authentication → URL
  Configuration → Redirect URLs allow list (a wildcard like
  `https://your-domain/**` covers both routes), or Supabase silently falls
  back to the bare Site URL and the token is gone.
- `src/pages/Waiting.tsx` and `src/pages/NotLinked.tsx` already exist and are
  already wired into `Gate` — no changes needed there unless the copy needs
  studio-specific text (pull `studio.name` once you have a person row, or
  the studio the join code belongs to before one exists).

**Verify:** redeem an invite link in a private window as a brand-new
account; try the same link twice and confirm the second attempt shows the
invalid-invitation message. Redeem each join-code scope once and confirm
both land on the `Waiting` screen with `status = 'pending'` (check directly
in the Supabase table editor, don't infer it from the UI alone).

## Task 2 — The responsive shell and shared components

**Depends on:** Task 1. **Reference:** `design-reference/Tokens.dc.html` for
the token reference (already in `src/styles/tokens.css` — this is for the
component anatomy), plus any Home/Team screen for how the shell wraps
content.

**Touches:** no new tables.

Build the real shell that replaces `App.tsx`'s placeholder `<Shell>`:
two-tier nav per `docs/PROJECT_KNOWLEDGE.md` — primary nav (Home / Schedule
/ Messages / Profile) as a phone bottom nav at 390px, a dark left rail at
1440px for a Director (plus a fifth rail item for the Director console);
each destination (a Team, a Comp Team, or the pinned Studio entry) opens
into its own sub-nav (Home / Schedule / Bulletin / Media / Essentials).

Build these in `src/components/` now, since nearly everything downstream
uses them:
- `ScheduleRow` — hairline row, time large on the left (`.font-display`),
  title/location stacked right, `--ink-3` dot at the end.
- `Avatar`, `Chip`, `Band` (renders `null` with no children — literally
  `return children ? <div className="band">{children}</div> : null;`),
  `PrimaryButton`, `SecondaryButton`, `ReactionBar`.

Show only the nav items the signed-in person's confirmed roles allow — a
`status = 'pending'` person never reaches this shell at all (handled by
`Gate` already).

**Verify:** resize the browser (or use device emulation) across 390px and
1440px and confirm the nav switches shape, not just position.

## Task 3 — Director home and join code management

**Depends on:** Task 2. **Reference:** `design-reference/DirectorHome.dc.html`,
`design-reference/JoinCodeManagement.dc.html`.

**Touches:** `app.rotate_join_code`, `app.revoke_join_code`, `studio`,
`team`, `comp_team`, `competition`.

Port `DirectorHome.dc.html`: the dark band as a "Needs a decision"
aggregator (empty studio → a setup checklist instead — "Rotate your first
join codes", "Create your first Team", "Add your first dancers", each
striking through as it completes; disappears once cleared, doesn't come
back as a checklist). Studio at a glance with real zeros, not a blank panel.

Port `JoinCodeManagement.dc.html`: one panel per scope (Parent/Dancer,
Instructor), current code or "No code yet", **Rotate code** (calls
`rotate_join_code`) and **Revoke**. Show the code as plain text and a QR
code (a small QR library is fine to add — `qrcode.react` or similar; check
`package.json` doesn't already have a preferred one before adding a new
dependency). Rotating confirms the old code stops working immediately.

**Verify:** rotate a code, copy it, confirm the same code redeemed a second
time after rotation fails (the old string is dead).

## Task 4 — Complete your profile, both branches

**Depends on:** Task 3. **Reference:** `design-reference/RegisterDancers.dc.html`,
`design-reference/InstructorProfile.dc.html`.

**Touches:** `person`, `guardian_link`, `person_dance_style`, `dance_style`,
`app.register_dancer`.

Branch by role, not by which door they came through (invite vs. join code):

- **Adult branch** (director/instructor/adult dancer): one step — name
  (pre-filled), phone, photo; instructors add a title
  (`person.title`: lead/assistant/choreographer/guest) and bio; dancers pick
  styles into `person_dance_style`. Updates the existing `person` row, never
  inserts.
- **Parent branch**: two steps. Step 1 ("About you") updates the parent's
  own row. Step 2 ("Your dancers") is the self-serve add-a-dancer flow —
  **one call**, `callApp('register_dancer', { p_parent_person_id,
  p_dancer })`, never split into "create person" then "create link" as two
  separate calls (see `docs/PROJECT_KNOWLEDGE.md` for why that fails
  silently). Existing dancers show a completeness state (Ready/Incomplete
  by whether `date_of_birth` is set), editable inline.

Route after finishing: `status = 'pending'` → `Waiting`; `status =
'confirmed'` → their home screen (built in Task 8).

**Verify:** as a fresh self-serve parent account, add two dancers. Check
directly in the Supabase table editor (not just the UI) that both dancer
rows have `auth_user_id is null` and a `guardian_link` row with
`can_edit = true` exists for each.

## Task 5 — The Director's confirm queue and the person record

**Depends on:** Task 4. **Reference:** `design-reference/DirectorConfirmQueue.dc.html`,
`design-reference/PersonDetail.dc.html`.

**Touches:** `person`, `guardian_link`, `team`, `comp_team`,
`app.decline_pending_person`.

Confirm queue: select `person` where `status = 'pending'` (RLS already
studio-scopes this), group by family via `guardian_link`. **Per-person
confirm**, not per-family — a Director can confirm a recognized parent and
decline one of their listed dancers independently. Confirm is a plain
update; Decline calls `callApp('decline_pending_person', { p_person_id,
p_reason })`. A pending instructor gets a note instead of a Confirm button:
*"Becomes active automatically once assigned to a Team or cast in a Comp
Team"* — there's no direct status-flip path for them by design.

Person record (`PersonDetail.dc.html`): header + actions, Profile card, a
Contact & account card that derives how they joined (`person_invite` row
exists → "Invited by ..."; otherwise → "Joined via [scope] join code"),
Guardian/dancers card, Teams & Comp Teams card, Deactivate-not-delete
explainer.

**Verify:** confirm one dancer from a two-dancer family and decline the
other; reload as the parent and confirm the declined one stays invisible
everywhere while the confirmed one appears.

## Task 6 — Invite someone (Director-first path)

**Depends on:** Task 5. **Reference:** `design-reference/InviteSomeone.dc.html`.

**Touches:** `person`, `person_role_assignment`, `person_invite`, view
`person_invite_status`, `app.find_person_by_email`, `app.create_invite`.

Email + role picker (Instructor/Parent/Adult dancer — never bare "Dancer").
Duplicate check via `find_person_by_email` first, branching three ways on
its `status`: nothing found → create; `confirmed` → offer "Add role
instead"; `pending` → point at the confirm queue rather than creating a
competing invite. Optional instructor pre-assign to a Team inline. Token
shown once, never persisted past the confirmation view. Pending invites
panel reads `person_invite_status`.

**Verify:** invite + pre-assign an instructor in one flow; confirm their
status lands `confirmed` immediately (Director-invited, not self-serve).

---

# STEP 2 — Roster

## Task 7 — Roster and directory

**Depends on:** Task 6. **Reference:** `design-reference/DirectorRoster.dc.html`,
`design-reference/DirectorRosterLookup.dc.html`.

**Touches:** `person_with_login`, `person_role_assignment`, `guardian_link`.

Search + role filter pills (All/Directors/Instructors/Parents/Dancers), each
row showing actual memberships rather than a bare role label. Tapping opens
`PersonDetail` (Task 5). Mobile counterpart is the same query, condensed
list, no edit controls.

**Verify:** as a test instructor account, confirm the roster is visible with
every edit control absent and no confirm-queue access.

---

# STEP 3 — Teams, Comp Teams, Dance Competitions (the three-entity model)

Don't conflate these — see `docs/PROJECT_KNOWLEDGE.md`'s "three-entity
model" section if the distinction isn't already clear.

## Task 8 — The Teams & Competitions index

**Depends on:** Task 7. **Reference:** `design-reference/DirectorTeamsIndex.dc.html`.

**Touches:** `team`, `comp_team`, `competition`, `season`.

Three sections, three separate create actions — a lightweight inline create
for Teams, the wizard (Task 10) for Comp Teams, the wizard (Task 16) for
Dance Competitions. Every `team` insert sets `season_id` explicitly (the
studio's current season — fetch once via `season` where `is_current`, don't
re-query per insert).

## Task 9 — Team roster management, and the shared destination index

**Depends on:** Task 8. **Reference:** `design-reference/TeamRosterManager.dc.html`,
`design-reference/TeamsAndDances.dc.html`.

**Touches:** `team_member`, `message_thread`, `app.teams_i_can_see`,
`app.teams_i_teach`.

A dancer holds exactly one ongoing Team at a time (database-enforced) — a
dancer already on another Team reads as **"Move in"**, a level move, not an
addition; the copy should say there's no separate remove step. Instructor
assignment has no such limit — two lists, not one role dropdown.

`TeamsAndDances.dc.html`: **Studio pinned first**, always, for everyone —
then Teams, then Comp Teams, scoped via `teams_i_can_see`/
`comp_teams_i_can_see`/`teams_i_teach`/`comp_teams_i_choreograph` over RPC.

**Verify:** move a dancer between Teams via "Move in", confirm the old
membership row is gone, not duplicated.

## Task 10 — The New Comp Team wizard and cast management

**Depends on:** Task 9. **Reference:** `design-reference/CompGroupWizardDetails.dc.html`
→ `CompGroupWizardRoster.dc.html` → `CompGroupWizardReview.dc.html`,
`design-reference/CastEntryBuilder.dc.html`.

**Touches:** `comp_team`, `comp_team_cast`, `comp_team_source_team`,
`message_thread`.

3-step wizard — Details asks nothing about a competition, on purpose (a
Comp Team exists independent of any competition entry). Roster step casts
dancers/choreographer into `comp_team_cast`; casting from a Team also
inserts that Team into `comp_team_source_team` — **never derive the source
from the current cast list.** Review step creates `comp_team` +
`comp_team_cast` rows + `comp_team_source_team` rows + one `message_thread`
(scope `comp_team`) all together, not staggered across steps.

`CastEntryBuilder.dc.html` reuses the same add/remove pattern standalone,
for managing an existing Comp Team's roster.

**Verify:** create a Comp Team casting from two Teams; confirm
`comp_team_source_team` has two rows. If the choreographer was a pending
instructor, confirm the auto-confirm trigger fired.

---

# STEP 4 — Events and Schedule

## Task 11 — Schedule: personal, and per-destination

**Depends on:** Tasks 8–10. **Reference:** `design-reference/Schedule.dc.html`,
`design-reference/ScheduleMonth.dc.html`, `design-reference/TeamSchedule.dc.html`,
`design-reference/CompSchedule.dc.html`, `design-reference/StudioSchedule.dc.html`.

**Touches:** `event`, `studio_space`, `team`, `comp_team`,
`competition_entry`, `competition`, `booking_request`, `studio.timezone`.

Two distinct queries, don't conflate them: the **global Schedule** tab is
the signed-in person's own week/month across everything they belong to
(select `event`, `cancelled_at is null`, **no scoping filter of your own** —
`event_read`'s policy already returns exactly the right rows); each
**destination's own Schedule tab** filters to that destination's
`team_id`/`comp_team_id`, or for Studio, `event.studio_wide = true` — never
a merged feed of every Team's classes.

All times stored UTC, displayed in `studio.timezone` — load it once, never
use the device timezone. Empty vs. offline are different screens, always
("Nothing scheduled this week" vs. "Can't load this week — you're
offline").

**Verify:** confirm `StudioSchedule` shows only `studio_wide` events, never
a Team's ordinary class.

## Task 12 — Add event, folding in the booking-request path

**Depends on:** Task 11. **Reference:** `design-reference/AddEvent.dc.html`,
`design-reference/EventScopePicker.dc.html`, `design-reference/EventTypePicker.dc.html`,
`design-reference/LocationPicker.dc.html`.

**Touches:** `event`, `booking_request`, `studio_space`, `team`,
`comp_team`.

One screen covers both a direct event and a booking request — there is no
separate "Request studio time" screen. The event type decides which owner
column is set (database-enforced via `event_owner_matches_type` — catch the
constraint error rather than working around it). Button label follows the
rule, not the person: Director → **Create**, instructor changing schedule →
**Send request**. Space picker is advisory (`--ok`/`--wait`/`--busy`);
double-booking is refused by `event_no_double_booking`, caught and shown as
a friendly message, never disabled client-side alone.

**Verify:** as an instructor, try to move an existing class's time and
confirm you get **Send request**, not **Create**.

## Task 13 — Studio calendar review, and the move path

**Depends on:** Task 12. **Reference:** `design-reference/StudioCalendarReview.dc.html`,
`design-reference/RequestReviewModal.dc.html`, `design-reference/ProposeMoveSheet.dc.html`.

Week grid, spaces down the left, confirmed events as blocks, pending
requests in `--wait`, conflicts in `--busy` — every block labelled in text.
Approve does the event insert/update + request update in one transaction;
if the event insert hits the double-booking constraint, the whole approval
fails as a unit. Move path: an instructor's date/time/space edits are
replaced with **Request a move** (`ProposeMoveSheet.dc.html`, opens Add
event pre-filled with `moves_event_id`); a Director edits directly.
Approving a move updates the existing event, not a new one.

**Verify:** submit → approve a request end to end; request a move on an
existing event and confirm approving it updates the same event.

---

# STEP 5 — Home, unified, and Profile

## Task 14 — The unified Home

**Depends on:** Task 13. **Reference:** `design-reference/HomeUnified.dc.html`,
`design-reference/HomeUnifiedVisual.dc.html`.

**One Home for every non-Director role** — no separate dancer/parent home
and instructor home. Every destination row carries a role chip so a
dual-role person (parent who also instructs) can tell which hat an item
belongs to; action buttons appear only where the role held on that
destination grants them. Band aggregates across every role this person
holds (urgent messages, schedule changes, their own pending
`booking_request` rows if they instruct) — renders nothing at all if empty.

**Verify:** as a dual-role test account, confirm role chips and action
buttons are correct per-row, not per-account.

## Task 15 — Destination homes: Team, Comp Team, Studio

**Depends on:** Task 14. **Reference:** `design-reference/TeamHome.dc.html`,
`design-reference/CompHome.dc.html`, `design-reference/StudioHome.dc.html`.

All three share a skeleton and now all three carry the same
Director/Instructor tools section (Post to Bulletin / Add to Essentials /
Upload Media), gated per-destination exactly as `docs/PROJECT_KNOWLEDGE.md`
specifies (Team → that Team's instructors; Comp Team → its choreographer;
Studio → Bulletin/Essentials open to any confirmed instructor, Media
Director-only). Comp Team's competition hero stays absent (`"No competition
booked yet"`) until Task 24 activates it.

## Task 16 — Profile tab and the parent-facing dancer profile

**Depends on:** Task 15. **Reference:** `design-reference/ProfileAccount.dc.html`,
`design-reference/DancerProfile.dc.html`.

Profile is a new primary nav item: account info, "Your roles at [Studio]",
linked dancers, notification-preference UI (collected, not yet read
server-side — say so in a code comment), sign-out. Tapping a dancer opens
`DancerProfile` — the parent-facing counterpart to `PersonDetail`, with
media consent directly editable (the guardian sets it) and no Deactivate
control.

**Verify:** toggle media consent from `DancerProfile`, confirm it's the same
`media_consent` value `PersonDetail` shows the Director.

---

# STEP 6 — Bulletin, Media, Essentials

Every scope (Studio, Team, Comp Team) gets the same three tabs from the same
three shared composers — build each composer once.

## Task 17 — Bulletin: the feed, the composer, and reactions

**Depends on:** Task 15. **Reference:** `design-reference/StudioBulletin.dc.html`,
`design-reference/TeamBulletin.dc.html`, `design-reference/CompBulletin.dc.html`,
`design-reference/BulletinComposer.dc.html`.

**Touches:** `post`, `post_media`, `reaction`, `media_item`.

Feed selects `post` for that destination's scope, newest first,
`deleted_at is null` — **do not add a scoping filter beyond the
scope/team_id/comp_team_id you're already selecting on.** `post_read`'s
policy already restricts a Comp Team's posts to cast + choreographer (+
Director), narrower than directory visibility — don't assume it matches
`comp_team_read`'s own broader visibility, and verify this with a second
account rather than trusting the assumption. Composer is one shared
component, pre-scoped, dual-purpose attachment (lands on the Bulletin card
AND in Media). Reactions are single-tap upsert/delete into `reaction`,
per-person visible on tap/hover of the count, not an aggregate-only number.

**Verify:** as a confirmed studio member NOT cast on a given Comp Team,
confirm you cannot see that Comp Team's Bulletin posts even though you can
see the Comp Team exists in `TeamsAndDances`.

## Task 18 — Media library and upload

**Depends on:** Task 17. **Reference:** `design-reference/StudioMedia.dc.html`,
`design-reference/TeamMedia.dc.html`, `design-reference/CompMedia.dc.html`,
`design-reference/MediaUpload.dc.html`.

**Touches:** `media_item`, `post_media`.

Grouped grid, scoped via `media_read`. Every video tile respects
`media_item.processing_status` — a "Still processing" placeholder while not
`'ready'`, never a broken thumbnail. Client-side compression + a
duration/size cap before upload begins (no server transcode pipeline for
v1). Thumbnail-first, tap-to-play, never autoplay. A post's video
attachment never lands in this library; a post can pull an existing library
item in.

## Task 19 — Essentials

**Depends on:** Task 18. **Reference:** `design-reference/StudioEssentials.dc.html`,
`design-reference/TeamEssentials.dc.html`, `design-reference/CompEssentials.dc.html`,
`design-reference/EssentialsComposer.dc.html`.

**Touches:** `essentials_item`.

Structured, ordered list (`sort_order`), not freeform notes. Archived
(`archived_at`) hidden from everyone but the Director, who sees them
separately — never hard-deleted. Composer: item type picker
(document/link/audio/note), title, details, attachment-or-link matching the
type.

**Verify:** archive an item as Director, confirm it disappears for
instructor/parent but stays visible (marked archived) for the Director.

---

# STEP 7 — Messaging

## Task 20 — The inbox and starting a new message

**Depends on:** Task 19. **Reference:** `design-reference/MessagingInbox.dc.html`,
`design-reference/NewMessage.dc.html`.

**Touches:** `message_thread`, `message`, `thread_read_state`,
`thread_participant`, `app.threads_i_can_see`.

Threads from `threads_i_can_see()`'s own scoping, no extra filter. Unread is
computed (newest message vs. `thread_read_state.last_read_at`), never a
stored column. `NewMessage.dc.html` is deliberately one-to-one only — Team/
Comp Team/Studio threads already exist in the list.

## Task 21 — The thread, broadcast rules, and Realtime

**Depends on:** Task 20. **Reference:** `design-reference/MessagingThread.dc.html`.

Who may post differs by channel (studio-wide: Director only; Team/Comp
Team: anyone who can see it; direct: participants) — hide the composer
accordingly, the database refuses regardless. Pin/urgent restricted further
(Director or that channel's assigned instructor/choreographer),
trigger-enforced. Mark-as-read on mount + on new message while
foregrounded. **Enable Realtime on `message`** — add it to the
`supabase_realtime` publication (`alter publication supabase_realtime add
table message;`) or the subscription connects and silently delivers
nothing.

**Verify:** as a dancer, confirm the studio-wide composer is gone and a Team
composer is present. Flag a message urgent in a Team you don't teach (as an
instructor) and confirm the error surfaces.

---

> ## ⏸ Ship here.
>
> Steps 1–7 are a working product. Put it in front of the studio before
> building competitions and the mobile Director set — a month of real use
> answers the open questions (notification preferences, pilot loading)
> better than more building.

---

# STEP 8 — Competitions

## Task 22 — Competition wizard, steps 1–2

**Depends on:** step 7 shipped. **Reference:** `design-reference/CompetitionWizardDetails.dc.html`
→ `CompetitionWizardEntries.dc.html`.

**Touches:** `competition`, `competition_entry`, `comp_team`.

Details step inserts `competition` with `published_at` left null. Entries
step is a **checklist of existing Comp Teams**, not a cast picker — casting
already happened in Task 10. Instructor proposals (`proposed_by` set,
`accepted_at` null) live here too, Director accepts/declines.

## Task 23 — Call times

**Depends on:** Task 22. **Reference:** `design-reference/CompetitionWizardCallTimes.dc.html`.

Optional at this step — the wizard must publish with entries reading "Not
set yet." Bulk-first ("Fill all N"), then fine-tune. Conflict detection
against existing `event` rows for that Comp Team's cast, full-sentence
panel with Move/Ignore. Preview renders in the real Comp Team hero
treatment, affected-people count computed from cast, not hard-coded.

## Task 24 — Publish, the Comp Team hero, and the Competition Overview

**Depends on:** Task 23. **Reference:** `design-reference/CompetitionWizardPublish.dc.html`,
`design-reference/CompetitionOverview.dc.html`.

Publish in one transaction: `published_at = now()`; one `call_time` event
**per entry that has a call time** (an entry still "Not set yet" gets no
event until one is set); post a message into each affected Comp Team's
channel. Activates the hero built absent in Task 15. Changing a call time
post-publish updates both `competition_entry.call_time` and the matching
event's `starts_at` together.

`CompetitionOverview.dc.html`: one scrolling page, no sub-nav, read-only for
a Parent, Add/Upload controls for Director/entered-Comp-Team's-choreographer
— same shared-artboard role-gating as everywhere else.

**Verify:** as a parent whose dancer is in a published entry, confirm the
call time matches across Next up, Schedule, the Comp Team hero, and
`CompetitionOverview`; change it as Director and confirm all four move.
Publish with one entry left "Not set yet" and confirm no event was created
for that entry.

---

# STEP 9 — The Director's mobile set, Settings, and the wrap

## Task 25 — Condensed mobile Director set

**Depends on:** step 8. **Reference:** `design-reference/DirectorHomeMobile.dc.html`,
`design-reference/DirectorRosterLookup.dc.html`, `design-reference/DirectorBroadcastComposer.dc.html`,
`design-reference/DirectorTeamsMobile.dc.html`.

Deliberately not a full mobile port of every desktop Director screen — see
`docs/PROJECT_KNOWLEDGE.md`. `DirectorTeamsMobile` is studio-wide (Director
isn't enrolled in any Team), tapping a row opens that destination's existing
mobile Home/Bulletin — nothing rebuilt, purely a new entry point.

## Task 26 — Studio Settings

**Depends on:** Task 3 (`JoinCodeManagement`). **Reference:** `design-reference/DirectorSettings.dc.html`.

Studio profile, Studio Spaces, Dance styles — deactivate-only, never
hard-deleted. Shares a tab bar with `JoinCodeManagement`.

## Task 27 — The cross-account audit

Not a build task — a real pass with five accounts (Director, instructor,
adult dancer, parent, and a deliberately-still-`pending` self-serve
account). See `BUILD_PROMPTS_V2.md`'s original Prompt 27 (or
`docs/PROJECT_KNOWLEDGE.md`) for the full checklist — the two V2-specific
things most likely to leak are Comp Team Bulletin scope (cast/choreographer
only, not studio-wide) and a still-pending instructor's zero-visibility
state.

## Task 28 — Despia and push

Do this only once the web app is genuinely usable. Same as the original
plan: Despia wraps the deployed build (bundled-assets mode, not remote
hydration — see `docs/SETUP.md`'s note on why a static Vite build matters
here), OneSignal delivers with `person.id` as the external user id (no
device tokens stored in Supabase), a Supabase database webhook fires an Edge
Function on **seven** triggers now (the original six plus a Bulletin post
marked Important), resolving audience through the same
`teams_i_can_see()`/`comp_teams_i_can_see()` semantics as everything else —
remember the Comp Team case is narrower than studio-wide.
