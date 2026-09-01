import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth, hasRole, type Role } from "../lib/AuthProvider";
import { Avatar } from "../components/Avatar";

interface RosterPerson {
  id: string;
  full_name: string;
  roles: Role[];
}

const FILTER_OPTIONS: { value: Role | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "director", label: "Directors" },
  { value: "instructor", label: "Instructors" },
  { value: "parent", label: "Parents" },
  { value: "dancer", label: "Dancers" },
];

const ROLE_PRIORITY: Role[] = ["director", "instructor", "parent", "dancer"];
const ROLE_LABEL: Record<Role, string> = {
  director: "Director",
  instructor: "Instructor",
  dancer: "Dancer",
  parent: "Parent",
};

// Ports design-reference/DirectorRoster.dc.html and
// DirectorRosterLookup.dc.html — the same query and list at every width,
// condensed by the responsive layout rather than a separate mobile screen.
// Read-only: no edit controls here or reachable from here for anyone but a
// Director (PersonDetail's own action bar is gated the same way). See
// BUILD_PLAN.md Task 7.
export function Roster() {
  const { person: currentPerson } = useAuth();
  const [people, setPeople] = useState<RosterPerson[] | null>(null);
  const [metaByPerson, setMetaByPerson] = useState<Map<string, string>>(new Map());
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Role | "all">("all");

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

      const validRows = (rows ?? []).filter(
        (r): r is { id: string; full_name: string } => !!r.id && !!r.full_name
      );
      const ids = validRows.map((r) => r.id);
      if (ids.length === 0) {
        if (!cancelled) {
          setPeople([]);
          setMetaByPerson(new Map());
        }
        return;
      }

      const [
        { data: roleRows },
        { data: teamMemberRows },
        { data: castRows },
        { data: guardianRows },
      ] = await Promise.all([
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
        teamIds.length > 0
          ? supabase.from("team").select("id, name").in("id", teamIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
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
        meta.set(p.id, buildMeta(primary, p.id, {
          teamsTaughtByPerson,
          choreographsByPerson,
          dancersByGuardian,
          teamsDancedByPerson,
          castOnByPerson,
        }));
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

  const filtered = useMemo(() => {
    if (!people) return [];
    const q = search.trim().toLowerCase();
    return people.filter((p) => {
      if (filter !== "all" && !p.roles.includes(filter)) return false;
      if (q && !p.full_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [people, search, filter]);

  if (!currentPerson) return null;

  return (
    <div style={{ padding: "18px 34px 30px" }}>
      <h2 style={{ fontSize: 24, letterSpacing: "-0.01em" }}>Roster &amp; directory</h2>
      <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 4 }}>
        {people === null ? "Loading…" : `${people.length} confirmed ${people.length === 1 ? "person" : "people"}`}
        {hasRole(currentPerson, "director") && (
          <>
            {" "}
            · pending registrations live on their own queue —{" "}
            <Link to="/confirm-queue" style={{ color: "var(--signal-deep)", fontWeight: 600 }}>
              open Confirm queue →
            </Link>
          </>
        )}
      </div>

      <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div
          style={{
            flex: "1 1 260px",
            maxWidth: 380,
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "10px 14px",
            borderRadius: 11,
            background: "var(--surface)",
            border: "1px solid var(--hairline)",
          }}
        >
          <SearchIcon />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            style={{ border: "none", background: "none", outline: "none", fontSize: 13, flex: 1, color: "var(--ink)" }}
          />
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFilter(opt.value)}
              style={{
                padding: "8px 15px",
                borderRadius: 999,
                fontSize: 12.5,
                fontWeight: 700,
                border: "none",
                cursor: "pointer",
                background: filter === opt.value ? "var(--band)" : "var(--sand)",
                color: filter === opt.value ? "var(--signal)" : "var(--ink-2)",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 20, maxWidth: 920 }}>
        {people === null ? (
          <p style={{ color: "var(--ink-2)" }}>Loading…</p>
        ) : filtered.length === 0 ? (
          <p style={{ color: "var(--ink-2)" }}>
            {people.length === 0 ? "No one has been confirmed yet." : "No one matches that search."}
          </p>
        ) : (
          <div className="card" style={{ border: "1px solid var(--hairline)", borderRadius: 16, padding: "2px 22px" }}>
            {filtered.map((p) => (
              <Link
                key={p.id}
                to={`/person/${p.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "13px 6px",
                  borderTop: "1px solid var(--hairline)",
                  color: "inherit",
                }}
              >
                <Avatar name={p.full_name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>
                    {p.full_name}
                    {p.id === currentPerson.id && (
                      <span style={{ fontWeight: 600, color: "var(--ink-3)", fontSize: 12 }}> (you)</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                    {metaByPerson.get(p.id) ?? ""}
                  </div>
                </div>
                {(() => {
                  const primary = ROLE_PRIORITY.find((r) => p.roles.includes(r));
                  if (!primary) return null;
                  const isInk = primary === "director" || primary === "instructor";
                  return (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "4px 11px",
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 600,
                        flexShrink: 0,
                        background: isInk ? "var(--band)" : "var(--sand)",
                        color: isInk ? "var(--signal)" : "var(--ink-2)",
                      }}
                    >
                      {ROLE_LABEL[primary]}
                    </span>
                  );
                })()}
                <ChevronIcon />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
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
      const parts = [
        teaches.length > 0 ? `teaches ${teaches.join(", ")}` : "",
        choreographs.length > 0 ? `choreographs ${choreographs.join(", ")}` : "",
      ].filter(Boolean);
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

function SearchIcon() {
  return (
    <svg
      style={{ width: 16, height: 16, color: "var(--ink-3)", flexShrink: 0 }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      style={{ width: 15, height: 15, color: "var(--ink-3)", flexShrink: 0 }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}