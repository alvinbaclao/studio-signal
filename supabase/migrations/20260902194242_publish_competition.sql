-- ============================================================================
-- Studio Signal — publish_competition + set_competition_entry_call_time
-- (BUILD_PLAN Task 24)
--
-- Two RPCs, matching this codebase's established pattern (start_direct_thread,
-- the messaging fix) of doing real multi-step, should-be-atomic writes as a
-- SECURITY DEFINER function rather than an ordered sequence of client calls
-- (the approximation RequestReviewModal.approve() already uses elsewhere,
-- with its own comment on why — this task's own BUILD_PLAN text explicitly
-- says "in one transaction," so it gets a real one this time).
--
-- Existing RLS confirmed live via pg_policies before writing this: Director
-- already has full write access to competition/competition_entry
-- (competition_write, entry_update are both `is_director(studio_id)` OR'd
-- with the choreographer case) — these RPCs don't add any new permission,
-- they just make the multi-table side effects (the call_time event, the
-- announcement message) atomic with the write a Director could already make
-- directly. Neither RPC touches any existing policy.
-- ============================================================================


-- ============================================================================
-- 1) app._sync_call_time_event — internal helper, not exposed to clients.
--    Create-or-update-or-remove the one `event` row for an entry's current
--    call_time. Only takes effect once the parent competition is published
--    (BUILD_PLAN: "an entry still 'Not set yet' gets no event until one is
--    set" — and no event at all before publish, matching "one call_time
--    event per entry that has a call time" being described as part of the
--    publish transaction). Idempotent and safe to call unconditionally —
--    every call site below does exactly that rather than duplicating the
--    "does an event already exist" branch.
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
    -- 30 minutes is a documented default, not derived from anything real —
    -- competition_entry.call_time is a single instant (when to arrive), the
    -- schema has no separate performance-duration field. See DEFICIENCIES.md.
    INSERT INTO public.event (studio_id, event_type, comp_team_id, competition_entry_id, title, starts_at, ends_at)
    VALUES (v_entry.studio_id, 'call_time', v_entry.comp_team_id, p_entry_id, v_comp_team_name || ' · Call time', v_entry.call_time, v_entry.call_time + interval '30 minutes');
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION app._sync_call_time_event(uuid) FROM PUBLIC;


-- ============================================================================
-- 2) app.set_competition_entry_call_time — the RPC CompetitionWizard's Call
--    Times step (Task 23) now calls instead of a raw client UPDATE, both
--    pre- and post-publish. Pre-publish this only ever touches
--    competition_entry (the sync helper no-ops, published_at is still
--    null); post-publish it also keeps the matching event's starts_at in
--    step, per BUILD_PLAN: "Changing a call time post-publish updates both
--    competition_entry.call_time and the matching event's starts_at
--    together."
-- ============================================================================

CREATE OR REPLACE FUNCTION app.set_competition_entry_call_time(p_entry_id uuid, p_call_time timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_studio_id uuid;
BEGIN
  SELECT studio_id INTO v_studio_id FROM public.competition_entry WHERE id = p_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That entry does not exist.';
  END IF;
  IF NOT app.is_director(v_studio_id) THEN
    RAISE EXCEPTION 'Only the Director can set a call time.';
  END IF;

  UPDATE public.competition_entry SET call_time = p_call_time WHERE id = p_entry_id;
  PERFORM app._sync_call_time_event(p_entry_id);
END;
$$;
REVOKE ALL ON FUNCTION app.set_competition_entry_call_time(uuid, timestamptz) FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO authenticated;
GRANT EXECUTE ON FUNCTION app.set_competition_entry_call_time(uuid, timestamptz) TO authenticated;


-- ============================================================================
-- 3) app.publish_competition — the real "one transaction": sets
--    published_at, creates every accepted+timed entry's call_time event,
--    and posts one announcement message into each accepted entry's Comp
--    Team channel (message_thread already exists for every comp_team via
--    the auto-create trigger from the messaging fix). Idempotent against a
--    double-click: a second call is a no-op (published_at only sets once,
--    guarded by the UPDATE's own WHERE, and the function returns
--    immediately if that UPDATE didn't affect a row — so it never
--    re-announces).
-- ============================================================================

CREATE OR REPLACE FUNCTION app.publish_competition(p_competition_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_studio_id uuid;
  v_name text;
  v_venue text;
  v_timezone text;
  v_caller_id uuid;
  v_entry RECORD;
  v_thread_id uuid;
  v_comp_team_name text;
  v_time_label text;
  v_body text;
BEGIN
  SELECT c.studio_id, c.name, c.venue_name, s.timezone
    INTO v_studio_id, v_name, v_venue, v_timezone
    FROM public.competition c
    JOIN public.studio s ON s.id = c.studio_id
   WHERE c.id = p_competition_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That competition does not exist.';
  END IF;
  IF NOT app.is_director(v_studio_id) THEN
    RAISE EXCEPTION 'Only the Director can publish a competition.';
  END IF;

  SELECT id INTO v_caller_id
    FROM public.person
   WHERE auth_user_id = auth.uid() AND studio_id = v_studio_id AND status = 'confirmed';

  UPDATE public.competition SET published_at = now() WHERE id = p_competition_id AND published_at IS NULL;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  FOR v_entry IN
    SELECT ce.id, ce.comp_team_id, ce.call_time
      FROM public.competition_entry ce
     WHERE ce.competition_id = p_competition_id AND ce.accepted_at IS NOT NULL
  LOOP
    PERFORM app._sync_call_time_event(v_entry.id);

    SELECT name INTO v_comp_team_name FROM public.comp_team WHERE id = v_entry.comp_team_id;
    SELECT id INTO v_thread_id FROM public.message_thread WHERE scope = 'comp_team' AND comp_team_id = v_entry.comp_team_id;

    IF v_thread_id IS NOT NULL AND v_caller_id IS NOT NULL THEN
      IF v_entry.call_time IS NOT NULL THEN
        v_time_label := to_char(v_entry.call_time AT TIME ZONE v_timezone, 'FMHH12:MI AM');
        v_body := v_comp_team_name || ' is entered in ' || v_name || COALESCE(' at ' || v_venue, '') || ' — call time is ' || v_time_label || '.';
      ELSE
        v_body := v_comp_team_name || ' is entered in ' || v_name || COALESCE(' at ' || v_venue, '') || ' — call time not set yet.';
      END IF;

      INSERT INTO public.message (studio_id, thread_id, author_id, body, is_pinned, is_urgent)
      VALUES (v_studio_id, v_thread_id, v_caller_id, v_body, false, false);
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION app.publish_competition(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.publish_competition(uuid) TO authenticated;
