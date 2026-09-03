-- Found while building deficiency #29 (real multi-reaction picker):
-- reaction_write gated on app.visible_person_ids() (any status, plus
-- guardian-linked dancers regardless of their own status) rather than the
-- confirmed-only helper — the wrong family per CLAUDE.md's Rule 4 for a
-- policy that decides whether someone may DO something, not just see it.
-- Every other "author this content as yourself" write policy in this
-- schema (post_insert, media_insert) uses my_confirmed_person_ids() —
-- self only, confirmed only, no guardian delegation. reaction_write was
-- the one outlier.
--
-- Confirmed live and exploitable before this fix: a real pending
-- (unvetted) test person, added to a real team_member row, could insert
-- a real reaction row on that team's post via a raw supabase-js call —
-- reaction_read's post_id-visibility check doesn't require confirmed
-- status either (teams_i_can_see() has no status filter), so this wasn't
-- blocked anywhere else in the chain.

drop policy reaction_write on public.reaction;
create policy reaction_write on public.reaction
  for all
  using (person_id in (select app.my_confirmed_person_ids()))
  with check (
    person_id in (select app.my_confirmed_person_ids())
    and post_id in (select id from public.post)
  );
