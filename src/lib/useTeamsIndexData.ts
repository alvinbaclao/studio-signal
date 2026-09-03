import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./AuthProvider";

export interface TeamRow {
  id: string;
  name: string;
  level: string | null;
  instructorNames: string[];
  dancerCount: number;
}

export interface CompTeamRow {
  id: string;
  name: string;
  comp_team_type: string;
  level: string | null;
  choreographerNames: string[];
  sourceTeamNames: string[];
  dancerCount: number;
  competitionNames: string[];
}

export interface CompetitionRow {
  id: string;
  name: string;
  venue_name: string | null;
  starts_on: string;
  enteredCompTeamNames: string[];
}

export interface IndexData {
  teams: TeamRow[];
  compTeams: CompTeamRow[];
  competitions: CompetitionRow[];
}

// Every Team/Comp Team/Dance Competition in the studio, with real
// instructor/choreographer/dancer-count/entered-in captions — originally
// TeamsIndex.tsx's own query (Task 8), extracted so DirectorTeamsMobile
// (Task 25) shares the exact same data instead of a second query.
export function useTeamsIndexData(): { data: IndexData | null; currentSeasonId: string | null; reload: () => Promise<void> } {
  const { person } = useAuth();
  const [data, setData] = useState<IndexData | null>(null);
  const [currentSeasonId, setCurrentSeasonId] = useState<string | null>(null);

  const load = async () => {
    if (!person) return;
    const studioId = person.studio_id;

    const { data: seasonRow } = await supabase
      .from("season")
      .select("id")
      .eq("studio_id", studioId)
      .eq("is_current", true)
      .maybeSingle();
    setCurrentSeasonId(seasonRow?.id ?? null);

    const [{ data: teamRows }, { data: compTeamRows }, { data: competitionRows }] = await Promise.all([
      supabase.from("team").select("id, name, level").eq("studio_id", studioId).eq("is_active", true).order("name"),
      supabase
        .from("comp_team")
        .select("id, name, comp_team_type, level")
        .eq("studio_id", studioId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("competition")
        .select("id, name, venue_name, starts_on")
        .eq("studio_id", studioId)
        .order("starts_on"),
    ]);

    const teamIds = (teamRows ?? []).map((t) => t.id);
    const compTeamIds = (compTeamRows ?? []).map((c) => c.id);

    const [
      { data: teamMemberRows },
      { data: castRows },
      { data: sourceRows },
      { data: entryRows },
    ] = await Promise.all([
      teamIds.length > 0
        ? supabase.from("team_member").select("team_id, person_id, role").in("team_id", teamIds)
        : Promise.resolve({ data: [] as { team_id: string; person_id: string; role: string }[] }),
      compTeamIds.length > 0
        ? supabase.from("comp_team_cast").select("comp_team_id, person_id, role").in("comp_team_id", compTeamIds)
        : Promise.resolve({ data: [] as { comp_team_id: string; person_id: string; role: string }[] }),
      compTeamIds.length > 0
        ? supabase.from("comp_team_source_team").select("comp_team_id, team_id").in("comp_team_id", compTeamIds)
        : Promise.resolve({ data: [] as { comp_team_id: string; team_id: string }[] }),
      compTeamIds.length > 0
        ? supabase.from("competition_entry").select("comp_team_id, competition_id").in("comp_team_id", compTeamIds)
        : Promise.resolve({ data: [] as { comp_team_id: string; competition_id: string }[] }),
    ]);

    const personIds = [
      ...new Set([
        ...(teamMemberRows ?? []).map((r) => r.person_id),
        ...(castRows ?? []).map((r) => r.person_id),
      ]),
    ];
    const { data: peopleRows } =
      personIds.length > 0
        ? await supabase.from("person").select("id, full_name").in("id", personIds)
        : { data: [] as { id: string; full_name: string }[] };
    const nameById = new Map((peopleRows ?? []).map((p) => [p.id, p.full_name]));

    const teamNameById = new Map((teamRows ?? []).map((t) => [t.id, t.name]));
    const compTeamNameById = new Map((compTeamRows ?? []).map((c) => [c.id, c.name]));
    const competitionNameById = new Map((competitionRows ?? []).map((c) => [c.id, c.name]));

    const teams: TeamRow[] = (teamRows ?? []).map((t) => {
      const members = (teamMemberRows ?? []).filter((m) => m.team_id === t.id);
      return {
        id: t.id,
        name: t.name,
        level: t.level,
        instructorNames: members
          .filter((m) => m.role === "instructor")
          .map((m) => nameById.get(m.person_id))
          .filter((n): n is string => !!n),
        dancerCount: members.filter((m) => m.role === "dancer").length,
      };
    });

    const compTeams: CompTeamRow[] = (compTeamRows ?? []).map((c) => {
      const cast = (castRows ?? []).filter((r) => r.comp_team_id === c.id);
      const sources = (sourceRows ?? []).filter((r) => r.comp_team_id === c.id);
      const entries = (entryRows ?? []).filter((r) => r.comp_team_id === c.id);
      return {
        id: c.id,
        name: c.name,
        comp_team_type: c.comp_team_type,
        level: c.level,
        choreographerNames: cast
          .filter((r) => r.role === "choreographer")
          .map((r) => nameById.get(r.person_id))
          .filter((n): n is string => !!n),
        sourceTeamNames: sources
          .map((r) => teamNameById.get(r.team_id))
          .filter((n): n is string => !!n),
        dancerCount: cast.filter((r) => r.role === "dancer").length,
        competitionNames: entries
          .map((r) => competitionNameById.get(r.competition_id))
          .filter((n): n is string => !!n),
      };
    });

    const competitions: CompetitionRow[] = (competitionRows ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      venue_name: c.venue_name,
      starts_on: c.starts_on,
      enteredCompTeamNames: (entryRows ?? [])
        .filter((r) => r.competition_id === c.id)
        .map((r) => compTeamNameById.get(r.comp_team_id))
        .filter((n): n is string => !!n),
    }));

    setData({ teams, compTeams, competitions });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person]);

  return { data, currentSeasonId, reload: load };
}
