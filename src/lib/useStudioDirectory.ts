import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useAuth, type Role } from "./AuthProvider";

export interface DirectoryPerson {
  id: string;
  full_name: string;
  roles: Role[];
}

export const ROLE_PRIORITY: Role[] = ["director", "instructor", "parent", "dancer"];
export const ROLE_LABEL: Record<Role, string> = {
  director: "Director",
  instructor: "Instructor",
  dancer: "Dancer",
  parent: "Parent",
};

// The confirmed, active studio directory plus a one-line "what they do
// here" caption per person — originally Roster.tsx's own query (Task 7),
// extracted so NewMessage's People list (Task 20) doesn't duplicate it.
export function useStudioDirectory(): { people: DirectoryPerson[] | null; metaByPerson: Map<string, string> } {
  const { person: currentPerson } = useAuth();
  const [people, setPeople] = useState<DirectoryPerson[] | null>(null);
  const [metaByPerson, setMetaByPerson] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!currentPerson) return;
    let cancelled = false;

    async function load() {
      const { data: rows } = await supabase
        .from("person_with_login")
        .select("id, full_name")
        .eq("status", "confirmed")
        .eq("is_active", true)
        .order("full_name");

      const validRows = (rows ?? []).filter((r): r is { id: string; full_name: string } => !!r.id && !!r.full_name);
      const ids = validRows.map((r) => r.id);
      if (ids.length === 0) {
        if (!cancelled) {
          setPeople([]);
          setMetaByPerson(new Map());
        }
        return;
      }

      const [{ data: roleRows }, { data: teamMemberRows }, { data: castRows }, { data: guardianRows }] = await Promise.all([
        supabase.from("person_role_assignment").select("person_id, role").in("person_id", ids),
        supabase.from("team_member").select("person_id, role, team_id").in("person_id", ids),
        supabase.from("comp_team_cast").select("person_id, role, comp_team_id").in("person_id", ids),
        supabase.from("guardian_link").select("guardian_id, dancer_id").in("guardian_id", ids),
      ]);

      const rolesByPerson = new Map<string, Role[]>();
      for (const r of roleRows ?? []) {
        const arr = rolesByPerson.get(r.person_id) ?? [];
        arr.push(r.role as Role);
        rolesByPerson.set(r.person_id, arr);
      }

      const teamIds = [...new Set((teamMemberRows ?? []).map((r) => r.team_id))];
      const compTeamIds = [...new Set((castRows ?? []).map((r) => r.comp_team_id))];
      const dancerIds = [...new Set((guardianRows ?? []).map((r) => r.dancer_id))];

      const [{ data: teams }, { data: compTeams }, { data: dancers }] = await Promise.all([
        teamIds.length > 0 ? supabase.from("team").select("id, name").in("id", teamIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        compTeamIds.length > 0
          ? supabase.from("comp_team").select("id, name").in("id", compTeamIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        dancerIds.length > 0
          ? supabase.from("person").select("id, full_name").in("id", dancerIds)
          : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      ]);
      const teamNameById = new Map((teams ?? []).map((t) => [t.id, t.name]));
      const compTeamNameById = new Map((compTeams ?? []).map((c) => [c.id, c.name]));
      const dancerNameById = new Map((dancers ?? []).map((d) => [d.id, d.full_name]));

      const teamsTaughtByPerson = new Map<string, string[]>();
      const teamsDancedByPerson = new Map<string, string[]>();
      for (const r of teamMemberRows ?? []) {
        const name = teamNameById.get(r.team_id);
        if (!name) continue;
        const map = r.role === "instructor" ? teamsTaughtByPerson : teamsDancedByPerson;
        const arr = map.get(r.person_id) ?? [];
        arr.push(name);
        map.set(r.person_id, arr);
      }

      const choreographsByPerson = new Map<string, string[]>();
      const castOnByPerson = new Map<string, string[]>();
      for (const r of castRows ?? []) {
        const name = compTeamNameById.get(r.comp_team_id);
        if (!name) continue;
        const map = r.role === "choreographer" ? choreographsByPerson : castOnByPerson;
        const arr = map.get(r.person_id) ?? [];
        arr.push(name);
        map.set(r.person_id, arr);
      }

      const dancersByGuardian = new Map<string, string[]>();
      for (const r of guardianRows ?? []) {
        const name = dancerNameById.get(r.dancer_id);
        if (!name) continue;
        const arr = dancersByGuardian.get(r.guardian_id) ?? [];
        arr.push(name);
        dancersByGuardian.set(r.guardian_id, arr);
      }

      const meta = new Map<string, string>();
      for (const p of validRows) {
        const roles = rolesByPerson.get(p.id) ?? [];
        const primary = ROLE_PRIORITY.find((r) => roles.includes(r));
        meta.set(
          p.id,
          buildMeta(primary, p.id, { teamsTaughtByPerson, choreographsByPerson, dancersByGuardian, teamsDancedByPerson, castOnByPerson })
        );
      }

      if (cancelled) return;
      setPeople(validRows.map((p) => ({ ...p, roles: rolesByPerson.get(p.id) ?? [] })));
      setMetaByPerson(meta);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [currentPerson]);

  return { people, metaByPerson };
}

function buildMeta(
  primary: Role | undefined,
  personId: string,
  maps: {
    teamsTaughtByPerson: Map<string, string[]>;
    choreographsByPerson: Map<string, string[]>;
    dancersByGuardian: Map<string, string[]>;
    teamsDancedByPerson: Map<string, string[]>;
    castOnByPerson: Map<string, string[]>;
  }
): string {
  switch (primary) {
    case "director":
      return "Runs the studio · full access everywhere";
    case "instructor": {
      const teaches = maps.teamsTaughtByPerson.get(personId) ?? [];
      const choreographs = maps.choreographsByPerson.get(personId) ?? [];
      const parts = [teaches.length > 0 ? `teaches ${teaches.join(", ")}` : "", choreographs.length > 0 ? `choreographs ${choreographs.join(", ")}` : ""].filter(Boolean);
      return parts.length > 0 ? parts.join(" · ") : "Not yet assigned to a Team";
    }
    case "parent": {
      const dancers = maps.dancersByGuardian.get(personId) ?? [];
      return dancers.length > 0 ? `Guardian of ${dancers.join(", ")}` : "No dancers added yet";
    }
    case "dancer": {
      const teams = maps.teamsDancedByPerson.get(personId) ?? [];
      const castOn = maps.castOnByPerson.get(personId) ?? [];
      const parts = [...teams, ...castOn];
      return parts.length > 0 ? parts.join(" · ") : "Not on a Team yet";
    }
    default:
      return "";
  }
}
