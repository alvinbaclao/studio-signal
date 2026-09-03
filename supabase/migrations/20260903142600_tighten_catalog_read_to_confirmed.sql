-- Deficiency #41: team_read, comp_team_read, style_read, space_read,
-- season_read, and studio_read all gated on app.my_studio_ids(), which
-- filters only on person.is_active, not status — so a pending/declined
-- person could browse every Team/Comp Team/Dance Style/Studio Space name
-- and the studio's own profile fields, studio-wide. Lower severity than
-- the content leak fixed in #42 (no message/post/essentials/media
-- content here, only catalog names), but still worth tightening now that
-- the confirmed-only helper (app.my_confirmed_studio_ids(), added
-- fixing #42) already exists.
--
-- dance_style is deliberately excluded here, verified against real usage
-- first: it's the one table of these six actually read by a client while
-- still pending — CompleteProfile's style picker (App.tsx's own gate
-- shows CompleteProfile before checking person.status === 'pending', so
-- it runs for a genuinely-unconfirmed person) queries dance_style
-- directly. Tightening it would break real onboarding, not just close a
-- low-severity gap. The other five tables are never queried by anything
-- reachable before both CompleteProfile and confirmation are done
-- (confirmed via grep: no pre-confirmation screen touches team, comp_team,
-- studio_space, season, or the studio table), so tightening them is a
-- pure security improvement with zero functional impact.

drop policy if exists team_read on public.team;
create policy team_read
on public.team
for select
to authenticated
using (studio_id in (select app.my_confirmed_studio_ids()));

drop policy if exists comp_team_read on public.comp_team;
create policy comp_team_read
on public.comp_team
for select
to authenticated
using (studio_id in (select app.my_confirmed_studio_ids()));

drop policy if exists space_read on public.studio_space;
create policy space_read
on public.studio_space
for select
to authenticated
using (studio_id in (select app.my_confirmed_studio_ids()));

drop policy if exists season_read on public.season;
create policy season_read
on public.season
for select
to authenticated
using (studio_id in (select app.my_confirmed_studio_ids()));

drop policy if exists studio_read on public.studio;
create policy studio_read
on public.studio
for select
to authenticated
using (id in (select app.my_confirmed_studio_ids()));
