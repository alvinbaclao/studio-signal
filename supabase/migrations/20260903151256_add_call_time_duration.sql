-- Deficiency #37: call-time events used a fixed 30-minute placeholder
-- duration (app._sync_call_time_event hardcoded `interval '30 minutes'`
-- since competition_entry had no duration field at all). Adds a real
-- duration_minutes column, defaulting to 30 to match today's behavior for
-- every existing/new entry until a Director sets a real value.

alter table public.competition_entry
  add column duration_minutes integer not null default 30
  constraint competition_entry_duration_minutes_check check (duration_minutes > 0);

create or replace function app._sync_call_time_event(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $function$
declare
  v_entry record;
  v_comp_team_name text;
  v_existing_event_id uuid;
begin
  select ce.studio_id, ce.comp_team_id, ce.call_time, ce.duration_minutes, c.published_at
    into v_entry
    from public.competition_entry ce
    join public.competition c on c.id = ce.competition_id
   where ce.id = p_entry_id;

  if not found or v_entry.published_at is null then
    return;
  end if;

  select id into v_existing_event_id from public.event where competition_entry_id = p_entry_id;

  if v_entry.call_time is null then
    if v_existing_event_id is not null then
      delete from public.event where id = v_existing_event_id;
    end if;
    return;
  end if;

  select name into v_comp_team_name from public.comp_team where id = v_entry.comp_team_id;

  if v_existing_event_id is not null then
    update public.event
       set starts_at = v_entry.call_time,
           ends_at = v_entry.call_time + (v_entry.duration_minutes || ' minutes')::interval
     where id = v_existing_event_id;
  else
    -- comp_team_id deliberately NULL here — event_owner_matches_type
    -- requires it for event_type='call_time'; competition_entry_id alone
    -- carries the ownership link.
    insert into public.event (studio_id, event_type, comp_team_id, competition_entry_id, title, starts_at, ends_at)
    values (v_entry.studio_id, 'call_time', null, p_entry_id, v_comp_team_name || ' · Call time', v_entry.call_time, v_entry.call_time + (v_entry.duration_minutes || ' minutes')::interval);
  end if;
end;
$function$;

create or replace function app.set_competition_entry_call_time(p_entry_id uuid, p_call_time timestamp with time zone, p_duration_minutes integer default null)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $function$
declare
  v_studio_id uuid;
begin
  select studio_id into v_studio_id from public.competition_entry where id = p_entry_id;
  if not found then
    raise exception 'That entry does not exist.';
  end if;
  if not app.is_director(v_studio_id) then
    raise exception 'Only the Director can set a call time.';
  end if;
  if p_duration_minutes is not null and p_duration_minutes <= 0 then
    raise exception 'Duration must be a positive number of minutes.';
  end if;

  update public.competition_entry
     set call_time = p_call_time,
         duration_minutes = coalesce(p_duration_minutes, duration_minutes)
   where id = p_entry_id;
  perform app._sync_call_time_event(p_entry_id);
end;
$function$;
