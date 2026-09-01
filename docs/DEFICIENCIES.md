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

### 2. No Supabase Storage bucket exists yet
**Found in:** Task 4.
`supabase.storage.listBuckets()` returns empty on the real project. This
blocks profile photo upload (Task 4's CompleteProfile shows a placeholder
note, "Photo uploads arrive with the Media library," instead of a working
upload control) and will block Task 18 (Media library) entirely. Needs a
bucket created and RLS storage policies written — not something the
frontend alone can do; likely needs to happen in the Supabase dashboard or
via a migration-adjacent step before/during Task 18.

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

### 5. No general "edit person details" flow exists
**Found in:** Task 5.
`PersonDetail`'s action bar has Message and Deactivate/Reactivate, but no
"Edit details" — the artboard shows one, but there's no edit form to link
it to. Right now the only ways a person's own data changes are: their own
one-time CompleteProfile step (Task 4), a parent editing their dancer
inline during that same onboarding screen, and a Director confirming/
declining status. There's no way for a Director to correct a typo'd name
or update someone else's phone number after the fact. Likely resolved by
Task 16 (Profile tab) for self-edits, but Director-editing-someone-else
isn't clearly covered by any task on the current plan — worth flagging
when Task 16 is reached.

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

## Low priority / cosmetic

### 8. `TeamsAndDances`'s role chip has no Director case
**Found in:** Task 9.
The role chip logic (`Instructor`/`Choreographer` vs `Parent` vs
`Dancer`) doesn't account for a Director viewing the page — they fall
through to a generic "Dancer" chip on any team they don't teach. Cosmetic
only: there's no nav entry point into `/teams-and-dances` for a Director
(they have `/teams` instead), so this only shows up when deliberately
navigating there directly, as verification did.

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
