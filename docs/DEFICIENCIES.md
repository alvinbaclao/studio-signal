# Known deficiencies

Gaps, deferred work, and open questions found while building against
`docs/BUILD_PLAN.md`, kept here so they don't get lost between sessions.
Each entry names the task it surfaced in. Update this file as new gaps are
found or existing ones get resolved — move resolved items to the bottom
under "Resolved" with the task that fixed them, don't just delete them.

## Open

### 2. No Supabase Storage bucket exists yet
**Found in:** Task 4. **Confirmed still true in:** Task 18.
`supabase.storage.listBuckets()` returns empty on the real project — this
was re-checked live at the start of Task 18, its own dedicated task, and
still returns `[]`. This blocks profile photo upload (Task 4's
CompleteProfile shows a placeholder note instead of a working upload
control) and now confirms Task 18's own prediction: `MediaUploadComposer`
is a real, destination-scoped screen (same shared-composer pattern as
`BulletinComposer`) that explains this honestly rather than presenting a
picker/compression/upload pipeline with nowhere to actually upload to.
Everything else about Task 18 — the grouped grid, `processing_status`
handling, tap-to-open detail view, per-destination RLS scoping, and the
Director-only-for-Media-specifically gating rule — is real and verified
live against manually-seeded `media_item` rows. Needs a bucket created
and RLS storage policies written — not something this codebase can do
itself (creating storage policies is exactly the kind of RLS change
CLAUDE.md's four rules forbid); likely needs to happen in the Supabase
dashboard or via a migration-adjacent step outside this repo.

### 3. No dance styles exist in the studio yet
**Found in:** Task 4.
`dance_style` is empty for this studio. Every style-picker built so far
(CompleteProfile's dancer branch, the parent branch's add-dancer form)
correctly shows an empty state ("Your studio hasn't added any dance styles
yet") rather than a broken picker, but real studios can't tag dance styles
on anyone until Task 26 (Studio Settings → Dance styles) is built and a
Director populates the list. Not a bug — just a real sequencing
dependency worth remembering when Task 26 is skipped or delayed.

### 4. Duplicate-person detection not implemented in the confirm queue
**Found in:** Task 5.
`DirectorConfirmQueue.dc.html` shows a "Might match Noah W. already on
roster" warning chip on one pending dancer. No matching algorithm
(fuzzy name match? exact match + DOB?) was specified anywhere in
`BUILD_PLAN.md` or `PROJECT_KNOWLEDGE.md`, so it was left out entirely —
every dancer row in the real `ConfirmQueue` gets the same Confirm/Decline
treatment regardless of possible duplicates. Worth a real design decision
before building, not a guess.

### 5. `PersonDetail` still has no "Edit details" for a Director
**Found in:** Task 5. **Narrowed in:** Task 16.
`PersonDetail`'s action bar has Message and Deactivate/Reactivate, but no
"Edit details" — the artboard shows one, but there's no edit form to link
it to. Task 16 resolved the self-edit half of this: `DancerProfile` now
lets a dancer's guardian directly edit date of birth and height (real
`person` updates, verified live), and `ProfileAccount` covers a person's
own account facts. What's still missing is Director-editing-someone-
else's details after the fact (correcting a typo'd name, updating a
phone number for a person who isn't their own dancer) — not covered by
any task on the current plan.

### 6. Invite emails aren't sent automatically
**Found in:** Task 6.
`InviteSomeone` generates a raw invite link that the Director must copy
and send themselves (by design — `app.create_invite` just returns a
token, there's no email-sending integration anywhere in this app). The
artboard's "Personal note (optional, shown in the invite email)" field
was dropped entirely since there's no email to put it in and no column to
store it. If automated invite emails are ever added (a real mail
provider, a Supabase Edge Function, etc.), the note field should be
reconsidered alongside it.

### 7. Parent-facing confirm/decline visibility not verified end-to-end
**Found in:** Task 5.
`BUILD_PLAN.md`'s own Verify step for Task 5 asks to "reload as the
parent" and confirm a declined dancer stays invisible while a confirmed
one appears. That wasn't fully testable yet — there's no parent-facing
roster or dancer view built (Tasks 7/9/14/16 are what would show it) — so
it was checked at the database layer instead (correct status transitions
confirmed directly). Re-verify through the actual UI once a parent has
somewhere to see their own family's status.

### 14. "Call time" isn't offered in Add Event's type picker
**Found in:** Task 12.
`EventTypePicker.dc.html` lists "Call time — for a competition or
performance entry" alongside Class/Rehearsal, Studio time request and
Dancer meeting. A live probe of `event_owner_matches_type` confirmed
`call_time` events require `competition_entry_id` to be set, not just
`comp_team_id` — and Task 12's own `Touches` list doesn't include
`competition`/`competition_entry` at all. Rather than half-wire a picker
with nothing real to attach to, "Call time" was left out entirely, same
choice as every other schema-shaped gap in this project. Revisit once
competition/competition_entry management exists (Task 22+).

### 15. No `studio_space` rows exist yet
**Found in:** Task 12.
Same shape as Deficiency #3 (`dance_style`): `studio_space` is empty for
the real studio, so Add Event's Location picker correctly shows "Your
studio hasn't set up any spaces yet" and every event/booking request can
be saved with no location rather than being forced through a fake picker.
Studio Spaces management is Task 26 (Studio Settings) — not built yet.
The advisory Available/Pending/Busy picker itself (`--ok`/`--wait`/
`--busy`) was verified live with temporary test spaces and works
correctly; it just has nothing to show until Task 26 seeds real ones.

### 16. Recurring events aren't supported on the Director's direct-create path
**Found in:** Task 12.
`AddEvent.dc.html` shows a "Repeats weekly … through Nov 30" toggle, but
the `event` table has no `repeats` column and no end-date column at
all — only `booking_request` has a `repeats` enum (`once`/`weekly`/
`biweekly`), with no end-date column either. A Director creating a direct
event can therefore only create one occurrence at a time; the toggle is
wired up only on the instructor's `booking_request` path, where the
column genuinely exists (an approving Director decides in Task 13 how to
actually fulfill a "weekly" request). Building client-side multi-row
generation for the Director path was deliberately avoided — there's no
schema-backed way to later reference, edit or cancel "the whole series"
as a unit, which is exactly the kind of half-real feature this project
avoids. Worth a real design decision (a `repeats`/`series_id` column?) if
recurring Director-created events are needed later.

### 17. Add Event's "Notify" toggle is cosmetic only
**Found in:** Task 12.
`AddEvent.dc.html`'s "Push to {team} families" toggle has no backing —
there is no notification/push table or send mechanism anywhere in this
schema, same gap as Deficiency #6 (invite emails). The toggle renders and
is interactive but doesn't affect the saved event or booking request in
any way. Revisit alongside #6 if real notification delivery is ever
added.

### 20. No entry point yet for "Request a move" on an existing event
**Found in:** Task 13.
BUILD_PLAN's move path ("an instructor's date/time/space edits are
replaced with Request a move, opens Add Event pre-filled with
moves_event_id") needs a screen that shows an existing event and lets an
instructor act on it — no such screen (or artboard) exists anywhere in
the build yet, so there's nothing to click "Request a move" from. The
data-layer side is real and verified live: `AddEvent` accepts
`?movesEvent=<id>` and sets it on the resulting `booking_request`, and
`RequestReviewModal`'s approval path updates that same event row instead
of inserting a new one (confirmed via a direct DB check: same event id,
same `created_at`, only the changed fields updated). Revisit once an
event-detail/edit screen exists to link from.

### 21. "Propose a different time or room" is decline-with-a-note, not a real counter-proposal
**Found in:** Task 13.
`ProposeMoveSheet.dc.html`'s actual content (as opposed to BUILD_PLAN's
one-line gloss, which describes a different interaction entirely — see
above) shows the Director picking an open alternate slot and sending Jamie
"a proposal to accept or counter — it doesn't book anything until she
confirms." There's no schema support for this at all: `booking_status`
has no "countered"/"proposed" value, and `booking_request` has no columns
to store a counter-proposed time or space. Built the honest subset
instead: Decline carries an optional free-text note (the real
`decline_reason` column), pre-labelled as a place to suggest a better
time or room. This is real and persisted (the requester can already read
their own declined request via existing RLS), just not the formal
accept/counter loop the mockup depicts — that would need real schema
support to build honestly.

### 22. Unified Home's band, Highlights and Inbox are narrower than the artboard
**Found in:** Task 14.
`HomeUnified.dc.html`'s "Needs your attention" band mixes in "urgent
messages" and general "schedule changes" alongside booking requests —
only the booking-request half is real (there's no notification table for
the other two, and Messaging isn't built — see #1, #17). "Recent
highlights" and "Inbox" both query real tables (`media_item`,
`thread_participant`/`message_thread`) and render honest empty states,
but can't show real content until #2 (Storage bucket) and #1
(`message_thread` write path) are resolved — same root gaps as before,
just now visible on a second screen. "Next up" also doesn't surface
competition/call-time cards the way the artboard's Regional Classic
example does — there's no CompetitionOverview screen yet to link to
(Task 22+).

### 23. Bulletin/Media/Essentials tabs and composers are placeholders until Tasks 17–19
**Found in:** Task 15.
Every destination's Bulletin/Media/Essentials sub-nav tab, and the three
"Instructor tools" buttons (Post to Bulletin, Add to Essentials, Upload
Media), route to a real path today but land on a `<Placeholder>` — the
composer screens (`BulletinComposer.dc.html`, `EssentialsComposer.dc.html`,
`MediaUpload.dc.html`) and the feed/library/list screens themselves aren't
built until Tasks 17, 18 and 19 respectively. The Home preview sections for
each (most recent post, media gallery, essentials list) already query the
real tables live and render correctly — they're just honestly empty right
now, same shape as Deficiency #22 on the unified Home.

### 26. Notification preferences are collected client-side only
**Found in:** Task 16.
`ProfileAccount`'s three notification toggles (Important posts/New
messages/Schedule changes) are real, interactive, and persisted — to
`localStorage`, not the database, since there's no notification-
preference table anywhere in the schema (same root gap as #17/#22: no
push/notification delivery mechanism exists at all). Flipping a toggle
sticks across a reload on the same device, but nothing server-side reads
these values, and they don't sync across devices. Revisit if real
notification delivery is ever added — these three toggles are exactly
what a real preferences table would need to store per-person.

### 27. Bulletin has no "Seen by X of Y" — no read-tracking table exists
**Found in:** Task 17.
Every Bulletin artboard shows a "Seen by 42 of 58 →" line per post — there
is no table anywhere in the schema that tracks who has viewed a `post`
(`thread_read_state` is Messaging-specific, for `message_thread`, not
`post`). Omitted entirely rather than faked. Revisit only if a real
post-read-tracking table is ever added — it would need its own migration,
which this codebase cannot write (see CLAUDE.md's four rules).

### 28. Bulletin media attachment is dropped — same Storage gap as before
**Found in:** Task 17.
`BulletinComposer`'s "Attach a photo or video" is a calm explanatory note,
not a working control, same treatment as Deficiency #2/#15/#23's root
cause (no Storage bucket exists for this studio). `BulletinFeed` still
renders inline media placeholders for any `post_media` a post has — real,
live-queried, just currently always empty since nothing can attach media
yet.

### 31. No drag-to-reorder on Essentials lists
**Found in:** Task 19.
`StudioEssentials.dc.html`'s own copy says items can be "drag to reorder,
same as the roster and Teams lists" — but no drag-and-drop exists
anywhere else in this codebase to reuse (Roster and TeamsIndex don't have
it either), and Task 19's own Verify step doesn't test reordering, only
archive visibility. `sort_order` is real and respected — the list renders
in that order, and new items append to the end (`max(sort_order) + 1` for
that scope/destination) — there's just no interactive way to change it
yet beyond editing the column directly. Revisit if manual reordering is
ever needed; would need a drag library or custom pointer-event handling,
neither of which exists in this codebase today.

### 33. No reachable UI for an instructor to propose a competition entry
**Found in:** Task 22.
`competition_entry.proposed_by`/`accepted_at` are real columns and
BUILD_PLAN's own text calls for them ("Instructor proposals... live here
too, Director accepts/declines"). `CompetitionWizard`'s Entries step
handles the Director-facing half correctly — a pending proposal renders
with Accept/Decline instead of a plain checkbox, verified live by seeding
a test row directly and confirming both actions work (Accept sets
`accepted_at`; Decline deletes the row). But there's no screen anywhere
in this build where a confirmed instructor could actually create one —
`/teams` (Teams & Competitions, where competitions live) has no nav path
for non-Directors at all (`Shell.tsx`'s `primaryNavItems` doesn't include
it), so the "propose" half of this feature has no entry point yet, same
shape as Deficiency #20's "no entry point for Request a move." Revisit
once there's a real screen for an instructor to reach a Comp Team they
choreograph and propose entering it somewhere.

### 34. Competition dates can render a day early (UTC-parse / local-render mismatch)
**Found in:** Task 22, on real data for the first time.
`TeamsIndex.tsx`'s existing `formatShortDate` (`src/lib/format.ts`,
already shipped since Task 8) does `new Date(iso).toLocaleDateString(...)`
on a plain date-only string like `"2027-09-09"` — that parses as UTC
midnight, then renders in the *device's* local timezone, so anyone west
of UTC sees the previous day. Confirmed live: entered "Sep 9, 2027" in
`CompetitionWizard`'s Details step, `starts_on` stored correctly as
`2027-09-09`, but `/teams`' competition row displayed "8 Sept." This bug
predates Task 22 — it's been sitting in already-shipped code since no
`competition` row existed to trigger it until now. The rest of this
codebase's date handling already has a real fix for exactly this class of
bug (`zonedDateKey`/`zonedMidnightUTC` in the same file, built for the
Schedule screens' studio-timezone rule) — `formatShortDate` itself just
never got the same treatment. Affects every screen that calls
`formatShortDate` on a date-only column, not just this one.

### 35. Moving a conflicting event lands back on Call Times' Entries step, not where you left off
**Found in:** Task 23.
`CompetitionWizard`'s step is local React state, not reflected in the
URL — `/competitions/new` and `/competition/:id/manage` both render the
same component at whatever step its own `useState` starts at (2, for an
existing competition). "Move that event" in the Call Times conflict panel
navigates away to `/add-event?movesEvent=<id>` (a real route change), and
`AddEvent`'s own submit calls `navigate(-1)` to return — which re-mounts
`CompetitionWizard` fresh rather than restoring in-memory state, so the
Director lands back on step 2 (Entries) instead of step 3 (Call Times)
where they were. Confirmed live: the underlying move itself works
correctly (verified the existing `event` row's `starts_at` actually
changed, no duplicate created) — this is purely a "which step is showing"
rough edge, not a data bug. Fix would mean syncing wizard step to the URL
(e.g. `?step=3`) rather than plain component state; not done here since
step state has worked file-locally throughout Tasks 22-23 and this is the
first place it's visibly cost something.

## Low priority / cosmetic

### 24. Comp Team Home has no "Level" in its subtitle
**Found in:** Task 15.
`CompHome.dc.html`'s header shows "Group comp team · Level 2 · 9
dancers," but `comp_team` has no `level` column at all (only `team`
does) — the artboard's "Level 2" has nothing real behind it. Built the
honest subset instead: `{comp_team_type} · {cast count} dancers`.

### 25. TeamHome's roster preview has no "Needs a spot" state
**Found in:** Task 15.
`TeamHome.dc.html` shows one roster row with a "Needs a spot" pill —
there's no real signal for this in `team_member` (no status/pending
column on membership itself; a person's own `status` already gates
whether they're confirmed at all before they'd ever appear on a roster).
Every roster row renders the same way for now. Revisit if a real
"unplaced dancer" concept is ever added.

### 29. Bulletin reactions are one fixed kind, not a picker
**Found in:** Task 17.
The reference artboards show different emoji on different posts (👍 on
one, ❤️ on another), but no artboard shows an actual picker UI — no tap
target for choosing which emoji, just a static rendered pill per post.
Read that as illustrative mockup variety, not a spec, and built the
literal "single-tap upsert/delete" BUILD_PLAN.md Task 17 describes: one
fixed reaction kind (👍), tap to add your own, tap again to remove it.
Revisit if a real multi-reaction picker is ever specified concretely.

### 9. No multi-select filter sheet on the global Schedule
**Found in:** Task 11.
`Schedule.dc.html` shows a "Filter" chip ("6 of 8") opening a sheet to
narrow the global Schedule down to specific Teams/Comp Teams — there's a
whole `FilterSheet.dc.html` artboard for it. `BUILD_PLAN.md`'s Task 11
text only describes the two query shapes (global vs per-destination) and
doesn't mention filtering, so it was left out entirely — the global
Schedule always shows everything `event_read`'s RLS policy returns, no
narrowing. Worth building if a real account ever has enough going on that
the unfiltered agenda gets noisy.

### 10. No per-event role indicator on Schedule rows
**Found in:** Task 11.
The reference artboards color-code each row with a dot showing whether an
event is "yours to teach" (instructor) vs "your kid's" (parent) —
`role-dot instr` / `role-dot parent`. Building that requires knowing, per
event, whether the viewer teaches/choreographs its team or comp_team, or
has a guardian_link to someone in it — real work not covered by Task 11's
text. Every row currently uses ScheduleRow's plain neutral dot instead.

### 11. Offline detection on Schedule screens is unverified
**Found in:** Task 11.
`ScheduleView` shows "Can't load this week — you're offline" when its
`fetchEvents` promise rejects, and "Nothing scheduled this week" when it
resolves with zero rows — but the offline branch was only exercised by
reading the code, not by actually cutting network access mid-session and
confirming the message appears (hard to simulate reliably in this
environment). The empty-vs-offline distinction the code implements is
correct in principle; the offline path itself hasn't been proven live the
way everything else in this task was.

### 32. "Seen by X of Y" doesn't count the sender's own send until reload
**Found in:** Task 21, live-verified after Deficiency #1's fix.
`MessagingThread`'s own last-sent-message line computes "Seen by" from
`thread_read_state` rows fetched once at page load. `send()` calls
`markAsRead()` right after inserting, which correctly upserts the
sender's own `last_read_at`, but the component's local `lastReadAtByPerson`
map isn't updated to match — so a message you just sent shows "Seen by 0
of 2" instead of "Seen by 1 of 2" until the page reloads. Confirmed live:
sent a direct message, saw "0 of 2" render immediately. Cosmetic only —
the underlying read-state write is correct, just not reflected until a
fresh load re-fetches it. Fix is a few lines in `MessagingThread.tsx`
(update the local map after `markAsRead()` succeeds instead of only
writing to the database) — not fixed here since it wasn't part of the
scope of Deficiency #1's fix.

## Resolved

### 1. `message_thread` has no write path from the client
**Found in:** Task 9. **Found and fixed for real in:** the messaging
backend-fix session following Task 21.
Originally diagnosed (Tasks 9, 10, 20, 21) as "no RLS policy exists at
all" for `message_thread`/`message`/`thread_participant`/
`thread_read_state` — every insert attempt this whole build returned
Postgres `42501`, and the anon key can't read `pg_catalog`, so there was
no way to see the real policies to know otherwise. **That diagnosis was
wrong.** Once this session got real Postgres access via the Supabase CLI
(`supabase link` + `supabase db query`), the live policies turned out to
already be correct and complete: `thread_insert`, `thread_read`,
`message_insert`, `message_read`, `message_update`, `message_delete`,
`thread_participant_read/write`, `read_state_rw`, all referencing real,
correctly-written `app.*` helper functions (`is_director`,
`teams_i_teach`, `comp_teams_i_choreograph`, `threads_i_can_see`, etc.).

The real root cause of every `42501` seen this whole build: PostgREST's
`.insert({...}).select()` pattern (`Prefer: return=representation`)
requires the SELECT policy to also pass for the newly-inserted row within
the *same* statement. `thread_read`'s policy scans `message_thread`
itself (via `threads_i_can_see()`), and Postgres's RLS evaluation for a
policy that scans its own table doesn't see a row inserted earlier in
that same statement — so `.insert({...}).select()` against
`message_thread` fails, even though a bare `.insert({...})` (no
`.select()`) followed by a *separate* later `.select()` succeeds.
Verified live both ways, through the real app's own `supabase-js` client,
not just raw SQL. `message` doesn't have this problem — `message_read`'s
policy doesn't scan `message` itself, so `.insert().select()` against it
works fine and needed no change.

One genuine, structural gap survived that correction: a freshly-created
`direct`-scope thread is invisible to everyone, including its own
creator, until a `thread_participant` row exists for it — but creating
that row requires the thread to already be visible
(`thread_participant_write`'s check also goes through
`threads_i_can_see()`). A raw client can never resolve this chicken-and-
egg problem on its own; verified live (created a bare direct-scope
thread, then couldn't find it again via any client-side query).

**The actual fix**, applied via `supabase/migrations/`
(`20260902153111_start_direct_thread_and_realtime.sql`) and pushed with
`supabase db push`: a single new SECURITY DEFINER RPC,
`app.start_direct_thread(p_other_person_id uuid) returns uuid`, which
validates both people are confirmed members of the same studio, rejects
self-threading, is idempotent (a second call for the same pair returns
the existing thread rather than duplicating it — verified live, two
calls, same id returned), and creates the thread plus both
`thread_participant` rows atomically, bypassing RLS internally. No
existing policy was touched, dropped, or replaced. The same migration
also ran BUILD_PLAN Task 21's `alter publication supabase_realtime add
table message;` (confirmed via `pg_publication_tables` that it wasn't
already enabled).

`src/pages/NewMessage.tsx`'s `startDirect()` was updated to call
`callApp('start_direct_thread', { p_other_person_id: otherId })` instead
of its original two raw `.insert()` calls. `src/lib/database.types.ts`
was regenerated for real via the now-linked Supabase CLI (also fixed its
UTF-16 encoding as a side effect of using a different generation
command). Verified live end-to-end through the actual UI (Playwright): a
Director tapped a person in "New message," landed on a real thread with a
real id, sent a message through the real composer, saw it render with a
correct timestamp, and the Inbox correctly showed the new thread with its
last-message preview — the exact flow that was always empty/blocked
before. All test data (thread, participant rows, message, read state, the
temporarily-confirmed test account) was cleaned up afterward.

An earlier, much larger migration attempt (rewriting all four tables'
SELECT/INSERT policies from scratch, plus redefining
`app.threads_i_can_see()`) was drafted and pushed first, based on the
original wrong diagnosis — it failed on a return-type mismatch
(`threads_i_can_see()` actually returns `SETOF uuid`, not the `uuid[]`
guessed) before anything committed (transactional rollback), which is
what surfaced the real policies and the real root cause. That migration
file was deleted rather than fixed and reapplied, since applying it would
have replaced working, better-designed policies with worse
reimplementations for no benefit. See Deficiency #32 for one small
cosmetic gap ("Seen by" staleness right after sending) found during this
same live-verification pass.

This also required setting up a real path for schema changes in this
repo at all: `CLAUDE.md`'s Rule 1 was updated to allow a migration under
`supabase/migrations/`, shown in full and confirmed for that specific
change, before running `supabase db push` — see `CLAUDE.md` and
`docs/PROJECT_KNOWLEDGE.md`'s "THE DATABASE IS FIXED BY DEFAULT" section
for the current wording.

**Team/Comp Team/Studio threads, fixed in a follow-up pass the same day**
(`supabase/migrations/20260902163425_team_comp_team_studio_threads.sql`):
nothing in this codebase ever created a `team`/`comp_team`/`studio`-scope
`message_thread` row — `thread_insert`'s policy already allowed a
Director (any scope) or the relevant instructor/choreographer (team/
comp_team scope) to create one, but nothing called it. Added triggers on
`team`/`comp_team`/`studio` INSERT (matching this schema's existing
choreographer-auto-confirm-trigger convention exactly) plus a one-time,
`NOT EXISTS`-guarded backfill for rows that predate the triggers —
verified live: the real "Jazz II," "Junior Comp Team," and "Task 6 Test
Team" rows, plus the one real studio, all got a thread immediately.

That alone wasn't enough: confirmed live that the Director — who has zero
`team_member`/`comp_team_cast` rows anywhere, same underlying fact as
Deficiency #18 — would not have seen any of these new threads in their
own Inbox, because `app.threads_i_can_see()`'s team/comp_team branches
gate on `teams_i_can_see()`/`comp_teams_i_can_see()`, which are personal-
involvement-only. This is the exact Deficiency #18/#19 pattern
resurfacing inside a live database function this time, not frontend code.
Fixed with a precise, minimal `CREATE OR REPLACE FUNCTION
app.threads_i_can_see()` — same `SETOF uuid` signature (confirmed via
`pg_get_functiondef` before writing it, so this was a clean replace, no
`DROP`, no risk to the four policies that reference it), only adding `OR
app.is_director(mt.studio_id)` to the team/comp_team branches — the exact
same clause `thread_insert`'s own policy already used for thread
*creation*, just missing from thread *visibility*. Verified live:
`threads_i_can_see()` went from `[]` to all four real thread ids for the
Director immediately after.

Also fixed while touching this: `MessagingThread.tsx`'s "N people"
subtitle and "Seen by X of Y" denominator, which sourced audience size
from `thread_participant` — correct for `direct` scope (where it's the
only source of truth) but always zero for team/comp_team/studio scope,
since that table is deliberately never populated for those three scopes
(see above). Now computed from a real `team_member`/`comp_team_cast`
count query, or a confirmed-studio-member count for studio scope.
Verified live: the studio thread's "Seen by" went from the old, always-
wrong "0 of 0" to a real "1 of 1" after sending and marking read.

Verified live end-to-end through the actual UI: Inbox now shows all four
real threads (three Team, one Studio) instead of "No conversations yet";
opened Jazz II's Team chat as Director, composer and Urgent/Pin toggles
present, sent an urgent message, it rendered with the IMPORTANT tag. All
test messages/read-state cleaned up afterward.

### 12. Comp Team choreographer picker excluded pending instructors
**Found and fixed in:** Task 10.
`NewCompTeamWizard`'s choreographer `<select>` initially filtered
instructor candidates to `status = 'confirmed'` only, which made the
wizard's own explicit test case ("if the choreographer was a pending
instructor, confirm the auto-confirm trigger fired") unreachable through
the UI — a pending instructor could never be selected in the first place.
Fixed by including `pending` alongside `confirmed` (still excluding
`declined`). Caught during this task's own live verification, before it
shipped.

### 13. `CastEntryBuilder` called a hook after an early return
**Found and fixed in:** Task 10.
`groupedBySource`'s `useMemo` was declared after the component's
`if (!compTeam || !person) return null;` guard — a genuine Rules-of-Hooks
violation (React threw "Rendered more hooks than during the previous
render" the first time the component re-rendered with data). The same
class of bug as the one fixed in `ConfirmQueue` during Task 7. Fixed by
moving the hook above the early return, alongside the other `useMemo` in
the same component. Caught live before it shipped, but worth remembering
as a recurring mistake pattern — check hook placement relative to early
returns on every new page component, not just once per file.

### 18. `teams_i_can_see()`/`comp_teams_i_can_see()` are empty for a Director
**Found and fixed in:** Task 12.
Assumed (by analogy with `TeamsAndDances`, which uses these RPCs without
special-casing Director) that they'd return every team/comp_team in the
studio for a Director. Live-probed and confirmed otherwise: both RPCs are
scoped to "teams/comp_teams this person is personally a member of," which
is empty for a Director (they're not a `team_member`/`comp_team_cast`
row anywhere) — Director visibility comes from plain table RLS instead,
which already grants full access. `AddEvent`'s destination loader now
branches on `isDirector`: a Director queries `team`/`comp_team` directly;
everyone else still goes through the RPCs. Worth remembering for any
future screen that lists teams/comp_teams and must work correctly for a
Director too — `TeamsAndDances` itself has never been exercised as a
Director (it's not reachable from Director nav), so this had gone
unnoticed until now.

### 19. `TeamSchedulePage`/`CompTeamSchedulePage` hid "+" from the Director
**Found and fixed in:** Task 12.
Both pages gated their Task-11-built `addEvent` prop on `teaches`/
`choreographs` alone (a `team_member`/`comp_team_cast` lookup for the
current person), never OR'd with `isDirector` — unlike
`StudioSchedulePage`, which correctly used `isDirector` alone. A Director
who doesn't personally teach a Team could reach that Team's Schedule tab
but never see the "+" button, even though "Director always writes
directly" everywhere else in the app. Fixed by OR'ing both pages' gate
with `isDirector`, matching `StudioSchedulePage`'s existing pattern. Predates
Task 12 (introduced in Task 11, before Add Event existed to make the gap
visible) — caught during this task's own live verification.

### 30. `TeamsAndDances` under-showed real visibility for everyone, not just Director
**Found and fixed in:** Task 17.
Deficiency #18 documented `teams_i_can_see()`/`comp_teams_i_can_see()`
returning empty for a Director; Task 17's own Verify step ("confirm you
can see the Comp Team exists in TeamsAndDances" even when you can't see
its posts) forced a closer look and found the same narrowness holds for
*everyone*, not just Director — both RPCs are scoped to "destinations
this person is personally involved with," while real `comp_team`/`team`
row-level RLS grants any confirmed studio member visibility into every
destination in their studio (confirmed live: an instructor with zero
relation to a Team/Comp Team could still `SELECT` it directly even
though the RPC omitted it from its list). `TeamsAndDances` now queries
`team`/`comp_team` directly, scoped to the studio, and uses
`teams_i_teach()`/`comp_teams_i_choreograph()` only to decide the role
chip — a destination the viewer has no real role on now renders no chip
at all instead of guessing "Parent"/"Dancer," which also resolves the
old Director-chip cosmetic gap this file used to track separately.
