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

### 4. Duplicate-person detection not implemented in the confirm queue
**Found in:** Task 5.
`DirectorConfirmQueue.dc.html` shows a "Might match Noah W. already on
roster" warning chip on one pending dancer. No matching algorithm
(fuzzy name match? exact match + DOB?) was specified anywhere in
`BUILD_PLAN.md` or `PROJECT_KNOWLEDGE.md`, so it was left out entirely —
every dancer row in the real `ConfirmQueue` gets the same Confirm/Decline
treatment regardless of possible duplicates. Worth a real design decision
before building, not a guess.

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

### 22. Unified Home's band and Highlights are narrower than the artboard
**Found in:** Task 14. **Narrowed in:** the deficiencies-backlog pass
following Task 27 — Inbox is fixed (see #43, Resolved); this entry now
covers what's left.
`HomeUnified.dc.html`'s "Needs your attention" band mixes in "urgent
messages" and general "schedule changes" alongside booking requests —
only the booking-request half is real (there's no notification table for
the other two — see #17/#26). "Recent highlights" queries `media_item`
live and renders an honest empty state, but can't show real content until
#2 (Storage bucket) is resolved. "Next up" also doesn't surface
competition/call-time cards the way the artboard's Regional Classic
example does — there's no CompetitionOverview screen yet to link to from
here (the screen itself now exists, from Task 24 — this is specifically
about `HomeUnified`'s own "Next up" card not linking to it).

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

### 36. CompetitionOverview drops the "Updates" feed and event-scoped Media
**Found in:** Task 24.
`CompetitionOverview.dc.html` shows two sections with no real schema
behind them: a read-only "Updates" feed of posts scoped to the
competition itself, and a "Photos, video & documents" gallery, also
competition-scoped. Checked directly against the live schema: `post` has
no `competition_id` column at all (only `team_id`/`comp_team_id`), and
neither does `media_item` — plus no Storage bucket exists for this
studio anyway (Deficiency #2). Both sections are dropped entirely rather
than faked, same as every other schema-shaped gap in this build.
Consequence: BUILD_PLAN's "Add/Upload controls for Director/entered-
Comp-Team's-choreographer" have nothing left to add or upload to, so the
page is read-only for everyone — no role-gating needed. Revisit only if
`post`/`media_item` ever gain a real competition scope (a schema change,
so out of this codebase's own reach regardless).

### 37. Call-time events use a fixed 30-minute placeholder duration
**Found in:** Task 24.
`competition_entry.call_time` is a single instant (when to arrive), and
the schema has no separate performance-duration field — the real
`call_time` event this creates (`app._sync_call_time_event`) needs a
NOT NULL `ends_at`, so it uses `starts_at + 30 minutes` as a documented,
arbitrary default. Real call times are rarely exactly 30 minutes;
revisit if a real duration signal is ever added to the schema (e.g. on
`competition_entry` itself).

### 39. `DirectorTeamsMobile` drops the "new posts"/"all read" marker
**Found in:** Task 25.
`DirectorTeamsMobile.dc.html` shows a "4 new"/"All read" badge per
destination row, meant to reuse "DirectorHome's Messaging oversight
data" per the artboard's own copy — but that section is itself a
hardcoded "No conversations yet." placeholder (confirmed while checking,
same root issue as Deficiency #38), and there's no Bulletin
read-tracking table either (Deficiency #27). No real data exists for
this marker from either angle, so it's dropped entirely rather than
faked — rows show real name/instructor-or-choreographer/dancer-count
captions only. Revisit once #27 (Bulletin read-tracking) exists.

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

### 41. Pending/declined people can browse catalog names (Team, Comp Team, Dance Style, Studio Space, Season, Studio) studio-wide
**Found in:** Task 27's cross-account audit, while investigating the
content-leak fix below (Resolved, this same task).
`team_read`, `comp_team_read`, `style_read`, `space_read`, `season_read`,
and `studio_read` all gate on `app.my_studio_ids()`, which filters only on
`person.is_active` — not `status`. A person who redeemed a join code but
is still `pending` (or even `declined`) can `SELECT` every Team/Comp
Team's name and level/type, every Dance Style name, every Studio Space
name, and the studio's own profile fields (name, address, phone, email,
timezone), confirmed live via raw `supabase-js` queries as the deliberately-
pending test account. Lower severity than the content leak fixed this same
task — no message/post/essentials/media CONTENT is exposed this way, only
catalog names/structure — and it may be a deliberate onboarding choice
(so a not-yet-confirmed person can see roughly what they're joining).
Deliberately left unfixed: scoped out of this task's fix by the user's own
choice (only the four content-bearing tables — `post`, `message`/
`message_thread`, `essentials_item`, `media_item` — were approved for a
fix). If this should also be tightened, the same pattern applies: swap
`app.my_studio_ids()` for `app.my_confirmed_studio_ids()` (added this
task) in each of these six policies.

## Resolved

### 35. Moving a conflicting event lands back on Call Times' Entries step, not where you left off
**Found in:** Task 23. **Fixed in:** the deficiencies-backlog pass
following Task 27 (Group 2).
`CompetitionWizard`'s step lived only in local React state, not the URL —
"Move that event" round-trips through `/add-event` and back via
`navigate(-1)`, which remounts the component fresh, always resetting to
step 2. Fixed by syncing step to `?step=` — wrapped the state setter so
every `setStep()` call also updates the URL (`replace: true`, no extra
history entries), and the initial step now reads from the URL first,
falling back to the old `routeId ? 2 : 1` default. One real bug caught
while building this: the one call site that changes *both* the pathname
(new competition → `/competition/:id/manage`) and the step in the same
tick raced — `navigate()` and `setSearchParams()` (which the wrapped
`setStep` calls) both act on location, and `setSearchParams` reads the
*current*, pre-navigate location, so it won since it ran second, leaving
the URL on `/competitions/new?step=2` instead of the new competition's
own URL. Fixed by folding the step into that one `navigate()` call
directly instead of composing two separate navigations. Verified live:
created a real competition, advanced to step 3, navigated to `/add-event`
and back (simulating the "Move that event" round trip) — landed back on
step 3, not step 2.

### 5. `PersonDetail` now has "Edit details" for a Director
**Found in:** Task 5. **Narrowed in:** Task 16. **Fixed in:** the
deficiencies-backlog pass following Task 27 (Group 2).
Added a Director-only "Edit details" button to the action bar (hidden
when viewing your own record — that already goes through
`ProfileAccount`), toggling the existing Profile card into an edit form:
full name, phone always; date of birth/height for a dancer; title/bio for
an instructor — mirroring exactly which fields that card already displays
per role. No RLS/schema change needed: `person_update`'s policy already
granted a Director full write access to any person row in their studio
(`app.is_director(studio_id)`, confirmed via `pg_policies` before
building this), so this was a pure frontend addition reusing an existing,
already-correct write policy. Verified live: renamed a test account,
confirmed the change persisted and reverted it; confirmed the button is
absent both for a Director viewing themselves and for a non-Director
viewing someone else.



### 34. Competition dates rendered a day early (UTC-parse / local-render mismatch)
**Found in:** Task 22. **Fixed in:** the deficiencies-backlog pass
following Task 27 (Group 2).
`formatShortDate` (`src/lib/format.ts`) did `new Date(iso).toLocaleDateString(...)`
on plain date-only strings like `"2027-09-09"` — parsed as UTC midnight,
rendered in the device's local timezone, a day early for anyone west of
UTC. Fixed by detecting a bare `YYYY-MM-DD` input and building the `Date`
from its Y/M/D digits via the local-time constructor (`new Date(year,
month, day)`) instead of the ISO-string one — there's no instant to
convert for a pure calendar date, so this sidesteps timezone conversion
entirely rather than doing it correctly. Timestamp inputs (`created_at`/
`updated_at`/`expires_at`) are untouched — device-local rendering is
correct for those, same as "2 hours ago." Verified with `TZ` set to
Pacific/Honolulu, America/Los_Angeles, and Asia/Tokyo: date-only inputs
render identically across all three (no drift); a real timestamp still
correctly varies by zone. Reproduced the original bug against the old
code first (`America/Los_Angeles` showed "Sep 8" for a stored "2027-09-09")
to confirm the fix actually changes behavior, not just passes by luck.

### 38. `DirectorHome`'s "Today & this week, studio-wide" never showed real events
**Found in:** Task 24. **Fixed in:** the deficiencies-backlog pass
following Task 27 (Group 2).
The card's body text was a hardcoded "Nothing scheduled this week."
string, never driven by any query. Wired to the same real, RLS-scoped,
no-destination-filter `event` query `HomeUnified`/`GlobalSchedule`/
`DirectorHomeMobile` already use (`weekRangeInZone`, studio timezone),
rendering weekday/time/title/space per row with a "View full schedule"
link. Verified live: seeded a real event this week, card correctly
listed it; removed it afterward.

### 32. "Seen by X of Y" didn't count the sender's own send until reload
**Found in:** Task 21. **Fixed in:** the deficiencies-backlog pass
following Task 27 (Group 2).
`markAsRead()` correctly upserted `thread_read_state` but never updated
the component's local `lastReadAtByPerson` map, so a just-sent message
showed "Seen by 0 of 2" until reload. First fix attempt (writing the
client's own `new Date().toISOString()` into local state) turned out to
still race: `last_read_at` has a server-side `now()` default, and
comparing a client-generated timestamp against `message.created_at`
(server-generated) is only reliable to within however far the two clocks
drift — confirmed live via a direct DB check, an 8ms client-behind-server
skew reproduced the exact same "Seen by 0" symptom even with local state
updating immediately. Real fix: send `last_read_at: "now"` (Postgres's
special date/time literal, evaluated server-side at cast time — not the
`now()` function) in the upsert instead of a client timestamp, then read
back the server-confirmed value via `.select().single()` for the local
state update, keeping both sides of the "seen" comparison on the same
clock. (A plain `.upsert({thread_id, person_id})` with `last_read_at`
omitted was considered and rejected: PostgREST's merge-duplicates upsert
only applies a column's default on first insert, not on the
conflict-update path, so it would work once and then never advance
again.) Verified live: sent a message, saw "Seen by 1 of 2" immediately,
no reload, on both a fresh read-state row and a re-read against an
existing one.

### 40. `DirectorHome`'s "Studio at a glance" counted inactive Teams/Comp Teams
**Found in:** Task 25. **Fixed in:** the deficiencies-backlog pass
following Task 27 (Group 2).
`useDirectorHome`'s `teamCount`/`compTeamCount` queried `team`/`comp_team`
with no `is_active` filter, while `useTeamsIndexData` already correctly
filtered to `is_active = true`. Added the same `.eq("is_active", true)`.
Verified live: went from "0 Teams" (all 3 real Team rows were inactive at
the time) to correctly showing "1" once Jazz II was confirmed active —
which surfaced a separate loose end from Task 27: Jazz II's reactivation
had been in the very first, failed seed script and silently dropped from
every retry after that script rolled back, so it had been inactive the
whole time despite appearing correctly in destination-detail screens
(which don't filter by `is_active`). Fixed directly via SQL, unrelated to
this deficiency's own code change.



### 7. Parent-facing confirm/decline visibility, verified end-to-end
**Found in:** Task 5. **Verified in:** Task 27's cross-account audit
(closed in the deficiencies-backlog pass that followed).
Waiting on Tasks 7/9/14/16 to give a parent somewhere to see their own
family's status — all built now. Task 27's audit already exercised the
exact scenario: the test parent's roster row (`person_read`'s RLS: a
declined person is visible only to the Director, themselves, and their
own linked family) showed real linked-dancer names ("Guardian of Emma
Walsh, Cast Test Dancer Two") to the Director and to the parent's own
view, while the Instructor's and Adult Dancer's views of that same row
correctly fell back to "No dancers added yet" — confirming a declined
dancer stays invisible to everyone who shouldn't see it and visible to
who should, exactly BUILD_PLAN's Task 5 Verify step.

### 23. Bulletin/Media/Essentials tabs and composers, verified real
**Found in:** Task 15. **Verified in:** the deficiencies-backlog pass
following Task 27.
Written when Tasks 17–19 (the composer/feed/library screens) hadn't
shipped yet — they have. Re-checked live: Jazz II's Bulletin, Media, and
Essentials tabs all render real content (honest empty states with working
composer entry points — "No posts yet.", "No photos, video, or music
yet.", "Nothing posted yet." + "Add an item"), not `<Placeholder>` stubs.

### 43. `HomeUnified`'s Inbox preview could never show Team/Comp Team/Studio threads
**Found and fixed in:** the deficiencies-backlog pass following Task 27,
while re-verifying Deficiency #22 now that #1 (messaging) is resolved.
`HomeUnified.tsx`'s Inbox preview queried `thread_participant` directly
to find the viewer's threads — but per #1's fix, `thread_participant` is
only ever populated for `direct`-scope threads (team/comp_team/studio
membership is computed dynamically via `team_member`/`comp_team_cast`/
studio-wide confirmed status, never mirrored into that table). So this
widget was structurally incapable of showing a Team, Comp Team, or Studio
thread, regardless of real message content — the same bug class already
caught and fixed in `MessagingThread.tsx`'s audience math during #1's
fix, just missed in this second file. `MessagingInbox.tsx` already had
the correct pattern (`callApp('threads_i_can_see')`); `HomeUnified.tsx`
now uses the same call. Verified live: a confirmed instructor with real
Jazz II/Comp Team/Studio threads went from "No conversations yet." to
correctly listing all three.

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

### 3 & 15. No `dance_style`/`studio_space` rows existed yet, and no way to add them
**Found in:** Tasks 4 and 12. **Found and fixed in:** Task 26.
Both tables were empty for the real studio, so every style/space picker
built earlier in this project (CompleteProfile's dancer branch, Add
Event's Location picker) correctly showed an empty state rather than a
broken picker — but nothing could populate either list until Studio
Settings existed. Task 26 built the "Studio & dance styles" tab
(`Settings.tsx`): Studio profile (name/timezone/address/phone/email,
`logo_path` excluded per Deficiency #2), Studio Spaces, and Dance styles,
each with add/rename/deactivate — all writing through the pre-existing
`studio_write`/`space_write`/`style_write` RLS policies (Director-only via
`app.is_director(studio_id)`), no new RPCs needed.

One genuine schema gap surfaced while building this: `dance_style` had no
`is_active` column at all (`studio_space` already did), even though
BUILD_PLAN.md and the artboard both require "deactivate-only, never
hard-deleted" for both tables — confirmed via FK introspection that
`dance_style` is referenced by `person_dance_style`, `team`, and
`comp_team`, so a hard delete would silently orphan history. Fixed with a
one-column, additive migration
(`supabase/migrations/20260903004656_add_dance_style_is_active.sql`):
`alter table public.dance_style add column is_active boolean not null
default true`. Drafted, shown, and confirmed with the user before
pushing, per `CLAUDE.md`'s schema-change workflow. Verified live end-to-
end (add/rename/deactivate/reactivate for both a space and a style, plus
a studio-profile edit) via Playwright against the real dev server, then
all test rows removed and the studio profile fields restored to their
original `null`s, confirmed via a direct row-count query afterward.

Reorder-by-drag from the artboard was deliberately dropped — `sort_order`
exists on `studio_space` but BUILD_PLAN.md never asks for a reorder UI,
and lists already read in a stable, sensible order (`sort_order`, then
`name`). Not logged as an open gap since nothing describes it as
required.

### 42. A `pending` (unvetted) person could read real studio-wide Bulletin, Messaging, Essentials, and Media content
**Found and fixed in:** Task 27's cross-account audit.
Set up five real test accounts (Director, instructor, adult dancer,
parent, and a deliberately-still-`pending` self-serve instructor — the
studio had no active Teams and zero Comp Teams to test against, so this
task also reactivated Jazz II and created a real "Audit Test Comp Team"
with cast, per the user's choice to keep this as a working baseline
rather than tear it down afterward). Confirmed both of BUILD_PLAN.md's
named risks are handled correctly: Comp Team Bulletin is genuinely
cast/choreographer-only (verified with a real post — a confirmed parent
with no team/comp_team membership got "No posts yet." even though a real
post existed), and a pending person is fully invisible everywhere in the
app's own routing.

But checking the *raw* API (not just the app's UI/routing — this
project's Rule 2: RLS must be the actual boundary, not a hidden button)
found a real gap: `post_read`, `app.threads_i_can_see()` (which
`message_read`/`thread_read` both depend on), `essentials_read`, and
`media_read` all gated their `scope='studio'` branch on
`app.my_studio_ids()`, which filters only on `person.is_active` — not
`status`. Confirmed live: created a real studio-wide Bulletin post and a
real studio-wide Message as Director, then read both back in full,
including body text, as the pending test account via a raw `supabase-js`
query — directly contradicting `PROJECT_KNOWLEDGE.md`'s stated rule that
a pending person has "zero visibility... invisible to every role's
roster/team/thread queries."

Fixed with `supabase/migrations/20260903025458_fix_pending_studio_content_leak.sql`:
a new `app.my_confirmed_studio_ids()` helper (same shape as
`my_studio_ids()`, built on `my_confirmed_person_ids()` instead), swapped
into just the `scope='studio'` branch of the four content policies above.
Team/Comp Team-scope branches were untouched — those already gate through
`teams_i_can_see()`/`comp_teams_i_can_see()`, which require an actual
`team_member`/`comp_team_cast` row, not just studio membership. Verified
live, both before (leak confirmed) and after (leak closed, zero
regression for confirmed accounts) the fix, via raw `supabase-js` queries
for all five test accounts against real seeded content in all four
tables; all test content removed afterward. Six other tables
(`team`/`comp_team`/`dance_style`/`studio_space`/`season`/`studio`) have
the identical `my_studio_ids()`-without-status-check shape but only
expose catalog names, not content — deliberately left unfixed this task,
tracked separately as Deficiency #41.
