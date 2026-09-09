-- Task 28 Phase 5 — wires 5 tables' row-changes to the notify-push Edge
-- Function (Phase 4, supabase/functions/notify-push/) via pg_net, using
-- exactly the payload shape Supabase's own Database Webhooks feature
-- produces (type/table/schema/record/old_record) so the Edge Function
-- needs no special-casing for how it was called.
--
-- pg_net is not yet enabled on this project (confirmed via
-- pg_available_extensions before writing this) — enabling it here.
--
-- The shared secret the Edge Function checks (x-notify-secret) is
-- deliberately NOT a literal anywhere in this file: CREATE TRIGGER
-- arguments are static and would otherwise bake the secret into git
-- history forever. It's pulled at call time from Supabase Vault (already
-- enabled on this project) instead. This migration does NOT create the
-- secret itself — that's a separate, non-committed step run once via
-- `supabase db query --linked` right after this migration, and the exact
-- same value also becomes this Edge Function's own NOTIFY_WEBHOOK_SECRET
-- (Phase 6), so both sides of the check match.

create extension if not exists pg_net;

create or replace function app.notify_push_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'notify_webhook_secret';

  perform net.http_post(
    url := 'https://eeanhicurmswdlungdjc.supabase.co/functions/v1/notify-push',
    body := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', to_jsonb(NEW),
      'old_record', to_jsonb(OLD)
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', v_secret
    ),
    timeout_milliseconds := 5000
  );

  return coalesce(NEW, OLD);
end;
$$;

comment on function app.notify_push_trigger() is
  'Task 28: forwards row changes to the notify-push Edge Function for push-notification delivery. See docs/BUILD_PLAN.md Task 28.';

-- 1. Booking request decided (approved/declined) -> the requester
create trigger notify_push_booking_request
after update on public.booking_request
for each row execute function app.notify_push_trigger();

-- 2/3. New message (urgent vs. ordinary both resolved inside the function)
create trigger notify_push_message
after insert on public.message
for each row execute function app.notify_push_trigger();

-- 4. Call time set/changed, 5. proposal accepted (update) or declined
-- (delete -- declineProposal() in CompetitionWizard.tsx really deletes
-- the row, confirmed by reading that code before writing this)
create trigger notify_push_competition_entry
after update or delete on public.competition_entry
for each row execute function app.notify_push_trigger();

-- 6. Person confirmed, 7. a person newly needs review
create trigger notify_push_person
after insert or update on public.person
for each row execute function app.notify_push_trigger();

-- 8. Bulletin post marked Important
create trigger notify_push_post
after insert on public.post
for each row execute function app.notify_push_trigger();
