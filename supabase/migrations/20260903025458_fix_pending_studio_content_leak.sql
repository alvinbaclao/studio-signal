-- Task 27 (cross-account audit) found: a person who redeemed a join code
-- but is still status='pending' (completely unvetted by the Director) could
-- read real studio-wide content — Bulletin posts, Messages, Essentials
-- items, and Media — via the raw Supabase API. Confirmed live: created a
-- real studio-scope post and message as Director, then read both back as a
-- pending test account.
--
-- Root cause: post_read, threads_i_can_see() (which message_read/thread_read
-- both depend on), essentials_read, and media_read all gate their
-- scope='studio' branch on app.my_studio_ids(), which is built on
-- my_person_ids() — filtered only by person.is_active, not status. It
-- doesn't distinguish confirmed from pending (or declined). This directly
-- contradicts PROJECT_KNOWLEDGE.md's rule that a pending person has "zero
-- visibility... invisible to every role's roster/team/thread queries."
--
-- Fix: a new app.my_confirmed_studio_ids() helper (same shape as
-- my_studio_ids(), but built on my_confirmed_person_ids()), swapped into
-- just the scope='studio' branch of each of the four content policies.
-- Team/Comp Team-scope branches are untouched — they already gate through
-- teams_i_can_see()/comp_teams_i_can_see(), which require an actual
-- team_member/comp_team_cast row, not just studio membership. Structural/
-- catalog tables (team, comp_team, dance_style, studio_space, season,
-- studio, competition) are deliberately left as-is: they only expose names,
-- not content, and this fix's scope was agreed with the user as the four
-- content-bearing tables specifically.

CREATE OR REPLACE FUNCTION app.my_confirmed_studio_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  select distinct p.studio_id from public.person p
  where p.id in (select * from app.my_confirmed_person_ids())
$function$;

REVOKE ALL ON FUNCTION app.my_confirmed_studio_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.my_confirmed_studio_ids() TO authenticated;

-- message_thread / message both read through this function — tightening
-- its scope='studio' branch here fixes both without touching their own
-- policies directly.
CREATE OR REPLACE FUNCTION app.threads_i_can_see()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  select mt.id from public.message_thread mt
  where mt.studio_id in (select * from app.my_studio_ids())
    and (
      (mt.scope = 'studio' and mt.studio_id in (select * from app.my_confirmed_studio_ids()))
      or (mt.scope = 'team'      and (app.is_director(mt.studio_id) or mt.team_id      in (select * from app.teams_i_can_see())))
      or (mt.scope = 'comp_team' and (app.is_director(mt.studio_id) or mt.comp_team_id in (select * from app.comp_teams_i_can_see())))
      or (mt.scope = 'direct' and exists (
            select 1 from public.thread_participant tp
            where tp.thread_id = mt.id
              and tp.person_id in (select * from app.visible_person_ids())))
    )
$function$;

DROP POLICY IF EXISTS post_read ON public.post;
CREATE POLICY post_read
ON public.post
FOR SELECT
TO authenticated
USING (
  deleted_at IS NULL AND (
    app.is_director(studio_id)
    OR (scope = 'studio' AND studio_id IN (SELECT app.my_confirmed_studio_ids()))
    OR (scope = 'team' AND team_id IN (SELECT app.teams_i_can_see()))
    OR (scope = 'comp_team' AND comp_team_id IN (SELECT app.comp_teams_i_can_see()))
    OR team_id IN (SELECT app.teams_i_teach())
    OR comp_team_id IN (SELECT app.comp_teams_i_choreograph())
  )
);

DROP POLICY IF EXISTS essentials_read ON public.essentials_item;
CREATE POLICY essentials_read
ON public.essentials_item
FOR SELECT
TO authenticated
USING (
  app.is_director(studio_id)
  OR (
    archived_at IS NULL AND (
      (scope = 'studio' AND studio_id IN (SELECT app.my_confirmed_studio_ids()))
      OR (scope = 'team' AND team_id IN (SELECT app.teams_i_can_see()))
      OR (scope = 'comp_team' AND comp_team_id IN (SELECT app.comp_teams_i_can_see()))
      OR team_id IN (SELECT app.teams_i_teach())
      OR comp_team_id IN (SELECT app.comp_teams_i_choreograph())
    )
  )
);

DROP POLICY IF EXISTS media_read ON public.media_item;
CREATE POLICY media_read
ON public.media_item
FOR SELECT
TO authenticated
USING (
  app.is_director(studio_id)
  OR (team_id IS NULL AND comp_team_id IS NULL AND studio_id IN (SELECT app.my_confirmed_studio_ids()))
  OR team_id IN (SELECT app.teams_i_can_see())
  OR comp_team_id IN (SELECT app.comp_teams_i_can_see())
  OR team_id IN (SELECT app.teams_i_teach())
  OR comp_team_id IN (SELECT app.comp_teams_i_choreograph())
);
