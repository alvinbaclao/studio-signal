-- ============================================================================
-- Studio Signal — start_direct_thread RPC + Realtime on message
-- (BUILD_PLAN Task 20/21)
--
-- Supersedes the earlier 20260902145653_messaging_write_paths.sql attempt,
-- which was deleted rather than applied. That migration was based on an
-- incorrect diagnosis: it assumed message_thread/message/thread_participant/
-- thread_read_state had NO RLS policies at all. Live introspection via
-- `supabase db query` (not previously available — the anon key can't read
-- pg_catalog) showed they already have correct, working policies
-- (thread_insert, thread_read, message_insert, message_read,
-- thread_participant_read/write, read_state_rw), all referencing real,
-- correctly-written app.* helper functions.
--
-- The actual root cause of every 42501 seen this build turned out to be
-- narrower: PostgREST's `.insert().select()` pattern (Prefer:
-- return=representation) requires the SELECT policy to also pass for the
-- newly-inserted row within the same statement. thread_read's policy scans
-- message_thread itself (via threads_i_can_see()), and Postgres's RLS
-- evaluation for a self-referencing policy doesn't see a row inserted
-- earlier in the very same statement — so `.insert({...}).select()` against
-- message_thread fails even though a bare `.insert({...})` (no .select())
-- followed by a separate, later `.select()` succeeds. Verified live both
-- ways.
--
-- One genuine, structural gap survives that finding: a freshly-created
-- direct-scope thread is invisible to everyone — including its own
-- creator — until a thread_participant row exists for it, but creating
-- that row requires the thread to already be visible (thread_participant's
-- own write policy also goes through threads_i_can_see()). A raw client
-- can never resolve this chicken-and-egg problem on its own. This is
-- exactly what a SECURITY DEFINER RPC is for — it bypasses RLS internally,
-- so it can create the thread and both participant rows atomically and
-- just return the id as a plain scalar (no RETURNING-vs-RLS interaction at
-- all).
--
-- Team/comp_team/studio-scope thread creation and ordinary message sending
-- are NOT touched here — verified live that both already work correctly
-- against the existing policies once RETURNING is avoided (or, for
-- message, isn't a problem in the first place since message_read doesn't
-- self-reference the message table). No existing policy is modified,
-- dropped, or replaced by this migration.
-- ============================================================================


-- ============================================================================
-- 1) DIRECT-THREAD RPC — app.start_direct_thread
--
-- SECURITY DEFINER, idempotent (returns the existing thread for a pair
-- that already has one, rather than creating a duplicate — impossible to
-- guarantee from a raw client insert, only a function that SELECTs first
-- can do it). Matches this codebase's existing pattern where every other
-- person-initiated action (redeem_invite, create_invite, register_dancer)
-- is an app.* RPC, never a raw client insert.
-- ============================================================================

CREATE OR REPLACE FUNCTION app.start_direct_thread(p_other_person_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_other_id   uuid;
  v_caller_id  uuid;
  v_studio_id  uuid;
  v_thread_id  uuid;
BEGIN
  -- Resolve the target person and their studio. Confirmed-only, matching
  -- the "may DO something" rule (starting a thread is an action).
  SELECT p.id, p.studio_id
    INTO v_other_id, v_studio_id
    FROM public.person p
   WHERE p.id = p_other_person_id
     AND p.status = 'confirmed';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That person is not available to message.';
  END IF;

  -- Resolve the caller's own confirmed person row IN THAT SAME STUDIO.
  SELECT p.id
    INTO v_caller_id
    FROM public.person p
   WHERE p.auth_user_id = auth.uid()
     AND p.studio_id = v_studio_id
     AND p.status = 'confirmed';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You are not a confirmed member of this studio.';
  END IF;

  IF v_caller_id = v_other_id THEN
    RAISE EXCEPTION 'You cannot start a direct thread with yourself.';
  END IF;

  -- Idempotency: reuse an existing exactly-these-two-people direct thread
  -- rather than creating a duplicate. Not protected by a unique index
  -- (none added — out of this migration's scope), so two truly concurrent
  -- first-time calls from the same pair could in theory both pass this
  -- check and create two threads. Accepted as a low-probability race for
  -- this app's usage pattern.
  SELECT tp1.thread_id
    INTO v_thread_id
    FROM public.thread_participant tp1
    JOIN public.thread_participant tp2
      ON tp2.thread_id = tp1.thread_id
     AND tp2.person_id = v_other_id
    JOIN public.message_thread mt
      ON mt.id = tp1.thread_id
   WHERE tp1.person_id = v_caller_id
     AND mt.scope = 'direct'
     AND mt.studio_id = v_studio_id
     AND (SELECT count(*) FROM public.thread_participant tp3
           WHERE tp3.thread_id = tp1.thread_id) = 2
   LIMIT 1;

  IF v_thread_id IS NOT NULL THEN
    RETURN v_thread_id;
  END IF;

  INSERT INTO public.message_thread (studio_id, scope, team_id, comp_team_id, subject)
  VALUES (v_studio_id, 'direct', NULL, NULL, NULL)
  RETURNING id INTO v_thread_id;

  INSERT INTO public.thread_participant (thread_id, person_id)
  VALUES (v_thread_id, v_caller_id), (v_thread_id, v_other_id);

  RETURN v_thread_id;
END;
$$;

REVOKE ALL ON FUNCTION app.start_direct_thread(uuid) FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO authenticated;
GRANT EXECUTE ON FUNCTION app.start_direct_thread(uuid) TO authenticated;


-- ============================================================================
-- 2) Realtime — enable on message (BUILD_PLAN Task 21's explicit
--    instruction). Confirmed live via pg_publication_tables that message
--    is not currently in the supabase_realtime publication.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'message'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message;
  END IF;
END $$;
