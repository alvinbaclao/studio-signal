-- ============================================================================
-- Studio Signal — Team/Comp Team/Studio message threads (BUILD_PLAN Task 9,
-- 10, 20, 21 — follow-up to 20260902153111_start_direct_thread_and_realtime.sql)
--
-- Nothing in this app currently creates a Team/Comp Team/Studio-scope
-- message_thread row. thread_insert's existing RLS policy already allows
-- it (Director for any scope; the relevant instructor/choreographer for
-- team/comp_team scope) — nothing has ever called it. Fixed the same way
-- this codebase already handles the analogous choreographer-auto-confirm
-- case: a trigger on the parent row's own creation, not a client-side
-- workaround.
--
-- Separately, confirmed live that even once these threads exist, the
-- Director would not see them in their own Inbox: threads_i_can_see()'s
-- team/comp_team branches gate on teams_i_can_see()/comp_teams_i_can_see(),
-- which are personal-involvement-only (real team_member/comp_team_cast
-- rows) — and the Director has zero such rows anywhere (confirmed:
-- `select * from team_member where person_id = <director>` returns
-- nothing). This is the same "Director isn't personally on the roster"
-- gap already caught and fixed twice elsewhere in this codebase
-- (docs/DEFICIENCIES.md #18, #19) and already handled correctly inside
-- messaging's own thread_insert policy (`is_director(studio_id) OR ...`)
-- — just missing from threads_i_can_see() itself. Fixed by adding the
-- same OR is_director(...) clause, matching thread_insert's own pattern
-- exactly. Return type (SETOF uuid) is unchanged, so this is a clean
-- CREATE OR REPLACE — no DROP needed, no dependent-policy risk (thread_read,
-- thread_participant_read/write, message_read all reference this function
-- and are untouched).
-- ============================================================================


-- ============================================================================
-- 1) TEAM / COMP_TEAM / STUDIO AUTO-CREATE TRIGGERS + ONE-TIME BACKFILL
-- ============================================================================

CREATE OR REPLACE FUNCTION app.create_team_message_thread()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  INSERT INTO public.message_thread (studio_id, scope, team_id, comp_team_id, subject)
  VALUES (NEW.studio_id, 'team', NEW.id, NULL, NULL);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app.create_team_message_thread() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_team_create_message_thread ON public.team;
CREATE TRIGGER trg_team_create_message_thread
AFTER INSERT ON public.team
FOR EACH ROW EXECUTE FUNCTION app.create_team_message_thread();


CREATE OR REPLACE FUNCTION app.create_comp_team_message_thread()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  INSERT INTO public.message_thread (studio_id, scope, team_id, comp_team_id, subject)
  VALUES (NEW.studio_id, 'comp_team', NULL, NEW.id, NULL);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app.create_comp_team_message_thread() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_comp_team_create_message_thread ON public.comp_team;
CREATE TRIGGER trg_comp_team_create_message_thread
AFTER INSERT ON public.comp_team
FOR EACH ROW EXECUTE FUNCTION app.create_comp_team_message_thread();


CREATE OR REPLACE FUNCTION app.create_studio_message_thread()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  INSERT INTO public.message_thread (studio_id, scope, team_id, comp_team_id, subject)
  VALUES (NEW.id, 'studio', NULL, NULL, NULL);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app.create_studio_message_thread() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_studio_create_message_thread ON public.studio;
CREATE TRIGGER trg_studio_create_message_thread
AFTER INSERT ON public.studio
FOR EACH ROW EXECUTE FUNCTION app.create_studio_message_thread();


-- One-time backfill for rows that predate these triggers (the live "Jazz
-- II" team, the one live studio row, and any comp_team rows that exist
-- today). id-agnostic, NOT EXISTS-guarded so it's safe to re-run.

INSERT INTO public.message_thread (studio_id, scope, team_id, comp_team_id, subject)
SELECT t.studio_id, 'team', t.id, NULL, NULL
FROM public.team t
WHERE NOT EXISTS (
  SELECT 1 FROM public.message_thread mt
  WHERE mt.scope = 'team' AND mt.team_id = t.id
);

INSERT INTO public.message_thread (studio_id, scope, team_id, comp_team_id, subject)
SELECT c.studio_id, 'comp_team', NULL, c.id, NULL
FROM public.comp_team c
WHERE NOT EXISTS (
  SELECT 1 FROM public.message_thread mt
  WHERE mt.scope = 'comp_team' AND mt.comp_team_id = c.id
);

INSERT INTO public.message_thread (studio_id, scope, team_id, comp_team_id, subject)
SELECT s.id, 'studio', NULL, NULL, NULL
FROM public.studio s
WHERE NOT EXISTS (
  SELECT 1 FROM public.message_thread mt
  WHERE mt.scope = 'studio' AND mt.studio_id = s.id
);


-- ============================================================================
-- 2) app.threads_i_can_see() — Director sees every Team/Comp Team thread
--    in their own studio, not just ones they personally have a
--    team_member/comp_team_cast row for. Same signature, same shape as
--    the live function (confirmed via pg_get_functiondef before writing
--    this) — only the team/comp_team branches gain an is_director() OR,
--    matching thread_insert's own existing pattern exactly.
-- ============================================================================

CREATE OR REPLACE FUNCTION app.threads_i_can_see()
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  select mt.id from public.message_thread mt
  where mt.studio_id in (select * from app.my_studio_ids())
    and (
      mt.scope = 'studio'
      or (mt.scope = 'team'      and (app.is_director(mt.studio_id) or mt.team_id      in (select * from app.teams_i_can_see())))
      or (mt.scope = 'comp_team' and (app.is_director(mt.studio_id) or mt.comp_team_id in (select * from app.comp_teams_i_can_see())))
      or (mt.scope = 'direct' and exists (
            select 1 from public.thread_participant tp
            where tp.thread_id = mt.id
              and tp.person_id in (select * from app.visible_person_ids())))
    )
$function$;
