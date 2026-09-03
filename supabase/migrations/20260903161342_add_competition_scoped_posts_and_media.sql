-- Deficiency #36: CompetitionOverview drops its "Updates" feed and
-- "Photos, video & documents" gallery because post/media_item have no way
-- to scope to a competition. Adds a nullable competition_id to both,
-- following media_item's existing pattern (an orthogonal nullable
-- destination FK, not a new content_scope enum value — avoids the
-- same-transaction "unsafe use of new enum value" restriction and keeps
-- the change additive). A competition-scoped post is stored with
-- scope='studio' (broadest existing scope) plus competition_id set; it's
-- visible studio-wide (matches how scope='studio' posts already work) and
-- postable by the Director or the choreographer of a comp_team with an
-- accepted entry in that competition, per BUILD_PLAN's "Add/Upload
-- controls for Director/entered-Comp-Team's-choreographer".

alter table public.post
  add column competition_id uuid references public.competition(id);

alter table public.media_item
  add column competition_id uuid references public.competition(id);

-- post: competition_id may only be set alongside scope='studio' (which
-- already requires team_id/comp_team_id both null).
alter table public.post
  drop constraint post_scope_matches_owner;

alter table public.post
  add constraint post_scope_matches_owner check (
    case scope
      when 'studio' then (team_id is null and comp_team_id is null)
      when 'team' then (team_id is not null and comp_team_id is null and competition_id is null)
      when 'comp_team' then (comp_team_id is not null and team_id is null and competition_id is null)
      else null
    end
  );

-- media_item: at most one of team_id/comp_team_id/competition_id.
alter table public.media_item
  drop constraint media_item_check;

alter table public.media_item
  add constraint media_item_check check (
    num_nonnulls(team_id, comp_team_id, competition_id) <= 1
  );

-- post_read: add a competition branch, visible to any confirmed studio
-- member (same audience as scope='studio').
drop policy post_read on public.post;
create policy post_read on public.post
  for select
  using (
    deleted_at is null
    and (
      app.is_director(studio_id)
      or (scope = 'studio'::content_scope and studio_id in (select app.my_confirmed_studio_ids()))
      or (scope = 'team'::content_scope and team_id in (select app.teams_i_can_see()))
      or (scope = 'comp_team'::content_scope and comp_team_id in (select app.comp_teams_i_can_see()))
      or (team_id in (select app.teams_i_teach()))
      or (comp_team_id in (select app.comp_teams_i_choreograph()))
      or (competition_id is not null and studio_id in (select app.my_confirmed_studio_ids()))
    )
  );

-- post_insert: add a branch for the choreographer of a comp_team with an
-- accepted entry in the target competition.
drop policy post_insert on public.post;
create policy post_insert on public.post
  for insert
  with check (
    author_id in (select app.my_confirmed_person_ids())
    and (
      app.is_director(studio_id)
      or (scope = 'team'::content_scope and team_id in (select app.teams_i_teach()))
      or (scope = 'comp_team'::content_scope and comp_team_id in (select app.comp_teams_i_choreograph()))
      or (
        competition_id is not null
        and competition_id in (
          select ce.competition_id
          from public.competition_entry ce
          where ce.comp_team_id in (select app.comp_teams_i_choreograph())
            and ce.accepted_at is not null
        )
      )
    )
  );

-- media_read: add the same competition branch as post_read.
drop policy media_read on public.media_item;
create policy media_read on public.media_item
  for select
  using (
    app.is_director(studio_id)
    or (team_id is null and comp_team_id is null and competition_id is null and studio_id in (select app.my_confirmed_studio_ids()))
    or (team_id in (select app.teams_i_can_see()))
    or (comp_team_id in (select app.comp_teams_i_can_see()))
    or (team_id in (select app.teams_i_teach()))
    or (comp_team_id in (select app.comp_teams_i_choreograph()))
    or (competition_id is not null and studio_id in (select app.my_confirmed_studio_ids()))
  );

-- media_insert: add the same entered-comp_team-choreographer branch as
-- post_insert.
drop policy media_insert on public.media_item;
create policy media_insert on public.media_item
  for insert
  with check (
    uploaded_by in (select app.my_confirmed_person_ids())
    and (
      app.is_director(studio_id)
      or (team_id in (select app.teams_i_teach()))
      or (comp_team_id in (select app.comp_teams_i_choreograph()))
      or (
        competition_id is not null
        and competition_id in (
          select ce.competition_id
          from public.competition_entry ce
          where ce.comp_team_id in (select app.comp_teams_i_choreograph())
            and ce.accepted_at is not null
        )
      )
    )
  );
