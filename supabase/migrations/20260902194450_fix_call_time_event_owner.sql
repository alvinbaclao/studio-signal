-- ============================================================================
-- Fix app._sync_call_time_event: the event_owner_matches_type check
-- constraint requires a call_time event's comp_team_id to be NULL —
-- ownership is expressed entirely through competition_entry_id, not a
-- direct comp_team_id FK (confirmed live: the first version of this
-- function, from 20260902194242_publish_competition.sql, violated this
-- constraint on its very first real publish attempt, which rolled back
-- cleanly — confirming the surrounding transaction genuinely is atomic).
-- One consequence worth knowing: a call_time event will never show up in
-- CompTeamHome's "Rehearsals" list (which filters event.comp_team_id =
-- this comp team), only in the hero — which is the correct separation,
-- not a bug: a call time isn't a rehearsal.
-- ============================================================================

CREATE OR REPLACE FUNCTION app._sync_call_time_event(p_entry_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_entry RECORD;
  v_comp_team_name text;
  v_existing_event_id uuid;
BEGIN
  SELECT ce.studio_id, ce.comp_team_id, ce.call_time, c.published_at
    INTO v_entry
    FROM public.competition_entry ce
    JOIN public.competition c ON c.id = ce.competition_id
   WHERE ce.id = p_entry_id;

  IF NOT FOUND OR v_entry.published_at IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO v_existing_event_id FROM public.event WHERE competition_entry_id = p_entry_id;

  IF v_entry.call_time IS NULL THEN
    IF v_existing_event_id IS NOT NULL THEN
      DELETE FROM public.event WHERE id = v_existing_event_id;
    END IF;
    RETURN;
  END IF;

  SELECT name INTO v_comp_team_name FROM public.comp_team WHERE id = v_entry.comp_team_id;

  IF v_existing_event_id IS NOT NULL THEN
    UPDATE public.event
       SET starts_at = v_entry.call_time,
           ends_at = v_entry.call_time + interval '30 minutes'
     WHERE id = v_existing_event_id;
  ELSE
    -- comp_team_id deliberately NULL here — event_owner_matches_type
    -- requires it for event_type='call_time'; competition_entry_id alone
    -- carries the ownership link.
    INSERT INTO public.event (studio_id, event_type, comp_team_id, competition_entry_id, title, starts_at, ends_at)
    VALUES (v_entry.studio_id, 'call_time', NULL, p_entry_id, v_comp_team_name || ' · Call time', v_entry.call_time, v_entry.call_time + interval '30 minutes');
  END IF;
END;
$$;
