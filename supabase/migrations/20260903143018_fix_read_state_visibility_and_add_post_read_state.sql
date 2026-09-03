-- Deficiency #27 (Bulletin has no "Seen by X of Y") — building this
-- surfaced a genuine, already-live bug in Messaging's own "Seen by X of Y"
-- (shipped as part of Deficiency #1's Resolved fix): thread_read_state's
-- only policy, read_state_rw, is `person_id IN visible_person_ids()` for
-- ALL commands — meaning a viewer can only ever SELECT their *own*
-- read-state row, never another participant's. MessagingThread.tsx's
-- "Seen by X of Y" query has no way to see anyone else's read status, so
-- X can never be more than the viewer's own 0-or-1. Confirmed live: signed
-- in as the dancer, marked Jazz II's thread read; signed in as the
-- instructor (a different real participant on the same thread) and
-- queried thread_read_state for that thread — got back only the
-- instructor's own row, not the dancer's, despite both being real
-- participants who'd both marked it read.
--
-- This was never caught before because every previous live test only
-- checked a single viewer's own "Seen by" count (which looks correct in
-- isolation — "1 of 2" after your own send — without a second viewer ever
-- confirming the OTHER 1 shows up too).
--
-- Fixed by splitting the single overly-narrow "ALL" policy into a real
-- SELECT (broad — anyone who can see the thread can see who's read it,
-- matching message_read's own visibility) and separate INSERT/UPDATE
-- (still own-row-only, unchanged from before). post_read_state is built
-- with the same, now-correct shape from the start, rather than copying
-- the bug forward into a second table.

drop policy if exists read_state_rw on public.thread_read_state;

create policy thread_read_state_select
on public.thread_read_state
for select
to authenticated
using (thread_id in (select app.threads_i_can_see()));

create policy thread_read_state_insert
on public.thread_read_state
for insert
to authenticated
with check (
  person_id in (select app.visible_person_ids())
  and thread_id in (select app.threads_i_can_see())
);

create policy thread_read_state_update
on public.thread_read_state
for update
to authenticated
using (person_id in (select app.visible_person_ids()))
with check (person_id in (select app.visible_person_ids()));


-- ---------------------------------------------------------------------
-- New table: post_read_state — Bulletin's "Seen by X of Y", same shape
-- as thread_read_state (post_id, person_id, last_read_at), scoped to
-- confirmed people only (unlike thread_read_state's any-status
-- visible_person_ids() — Bulletin itself is only ever reached after
-- confirmation, so there's no pending-onboarding case to account for
-- here the way there was for dance_style).
-- ---------------------------------------------------------------------

create table public.post_read_state (
  post_id uuid not null references public.post(id) on delete cascade,
  person_id uuid not null references public.person(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (post_id, person_id)
);

alter table public.post_read_state enable row level security;

create policy post_read_state_select
on public.post_read_state
for select
to authenticated
using (post_id in (select id from public.post));

create policy post_read_state_insert
on public.post_read_state
for insert
to authenticated
with check (
  person_id in (select app.my_confirmed_person_ids())
  and post_id in (select id from public.post)
);

create policy post_read_state_update
on public.post_read_state
for update
to authenticated
using (person_id in (select app.my_confirmed_person_ids()))
with check (person_id in (select app.my_confirmed_person_ids()));
