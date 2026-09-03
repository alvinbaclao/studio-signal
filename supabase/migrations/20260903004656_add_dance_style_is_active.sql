-- Task 26 (Studio Settings) needs dance styles to be deactivate-only, never
-- hard-deleted, per BUILD_PLAN.md's explicit rule and DirectorSettings.dc.html's
-- own artboard copy ("a style referenced by a team, a dance, or someone's
-- dancer profile has to stay findable in history"). Confirmed via FK
-- introspection that dance_style is referenced by person_dance_style, team,
-- and comp_team, so a hard delete would be destructive. studio_space already
-- has this exact column (is_active boolean not null default true) for the
-- same reason — dance_style was simply missing it, not a naming mismatch.
alter table public.dance_style
  add column is_active boolean not null default true;
