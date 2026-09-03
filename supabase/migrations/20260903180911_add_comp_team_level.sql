-- Deficiency #24: CompTeamHome's subtitle is missing "Level" — comp_team
-- has no level column at all (only team does). Adds one with the exact
-- same shape as team.level (nullable free text, no CHECK — confirmed via
-- information_schema/pg_constraint before writing this) so the same
-- "Level 2" free-text convention applies to both.

alter table public.comp_team
  add column level text;
