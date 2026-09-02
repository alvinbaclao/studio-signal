# Known deficiencies

Gaps, deferred work, and open questions found while building against
`docs/BUILD_PLAN.md`, kept here so they don't get lost between sessions.
Each entry names the task it surfaced in. Update this file as new gaps are
found or existing ones get resolved — move resolved items to the bottom
under "Resolved" with the task that fixed them, don't just delete them.

## Open

### 1. `message_thread` has no write path from the client
**Found in:** Task 9.
Adding someone to a Team's roster should plausibly grant them access to
that Team's message thread, and Task 10 explicitly needs to create a
`message_thread` row when a Comp Team is created. But a direct client
insert into `message_thread` is blocked by RLS — confirmed live, even
signed in as Director — and there's no `app.*` RPC for creating one either
(the full function list was checked). Likely needs a database trigger on
`team`/`comp_team` insert, or a dedicated RPC. Left `team_member` as the
only table Task 9 writes to rather than inventing a workaround.

**Confirmed again in Task 10:** a direct `comp_team` insert doesn't
auto-create a thread via trigger either (tested live — inserted a
comp_team, checked `message_thread` for it, found nothing), so the New
Comp Team wizard's Review step creates `comp_team` + `comp_team_cast` +
`comp_team_source_team` exactly as specified but skips the
`message_thread` row the artboard's Review step promises. Everything else
about that step (the choreographer auto-confirm trigger, the two
comp_team_source_team rows) is real and verified live.

**Confirmed again, and worse, in Task 20:** re-probed live and fresh
before writing `MessagingInbox`/`NewMessage` — `message_thread` has no
INSERT path from the client for **any** scope, including `direct`
(previously only Team/Comp Team scope had been checked). Zero
`message_thread` rows exist anywhere in the database, and there is still
no `app.*` RPC for creating one (the full function list — `create_invite`,
`decline_pending_person`, `find_person_by_email`, `generate_join_code`,
`is_director`, `is_instructor`, `my_confirmed_person_ids`,
`my_person_ids`, `my_studio_ids`, `redeem_invite`, `redeem_join_code`,
`register_dancer`, `revoke_join_code`, `rotate_join_code`,
`teams_i_can_see`, `teams_i_teach`, `comp_teams_i_can_see`,
`comp_teams_i_choreograph`, `threads_i_can_see`, `visible_person_ids` —
was checked again). Built the honest shell rather than skip or fake the
task: `MessagingInbox` queries `threads_i_can_see()` and the real
`message`/`thread_read_state`/`thread_participant` tables exactly as
BUILD_PLAN.md's Touches list specifies, and correctly renders "No
conversations yet" since `threads_i_can_see()` returns `[]` for every
account. `NewMessage`'s People list is real (shares `useStudioDirectory`
with `Roster`, Task 7) and its "Team & group threads" section is real
(same `threads_i_can_see()` query, filtered to non-direct scope).
Tapping a person calls the real `message_thread` insert rather than a
disabled control — verified live: it throws Postgres error `42501`
(RLS violation), caught and shown as "Direct messaging isn't set up yet
for this studio — check back soon." rather than a raw error or a
silently-disabled row. Task 21 (the thread view itself, broadcast rules,
Realtime) is blocked on this same gap even more directly — there's no
thread to open. This needs a real fix outside this codebase: either an
RPC (`app.start_direct_thread`, one per Team/Comp Team-creation trigger
for those scopes) or an RLS INSERT policy on `message_thread` — not
something this codebase can add itself (CLAUDE.md's four rules).

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

## Resolved

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
