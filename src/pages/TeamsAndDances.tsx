import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, callApp } from "../lib/supabase";
import { useAuth } from "../lib/AuthProvider";

interface TeamCard {
  id: string;
  name: string;
  level: string | null;
  dancerCount: number;
  role: "Instructor" | "Parent" | "Dancer" | null;
}

interface CompTeamCard {
  id: string;
  name: string;
  comp_team_type: string;
  competitionNames: string[];
  role: "Choreographer" | "Parent" | "Dancer" | null;
}

// Ports design-reference/TeamsAndDances.dc.html — Studio pinned first,
// always, for everyone, then Teams, then Comp Teams. Queries `team`/
// `comp_team` directly (scoped to the studio) rather than through
// teams_i_can_see()/comp_teams_i_can_see() — those RPCs turned out to be
// scoped to "destinations this person is personally involved with," not
// the actual (broader) directory visibility real table RLS grants, the
// same narrowness already documented for the Director case in
// docs/DEFICIENCIES.md #18. Confirmed live during Task 17's verification:
// a confirmed instructor with zero relation to a Team/Comp Team could
// still SELECT it directly even though the RPC omitted it. teams_i_teach()/
// comp_teams_i_choreograph() are still used, just for the role chip now,
// not for visibility — and a destination the viewer has no real role on
// renders no chip at all rather than guessing Parent/Dancer. See
// BUILD_PLAN.md Task 9 (and Task 17, which is what surfaced this).
export function TeamsAndDances() {
  const { person } = useAuth();
  const [teams, setTeams] = useState<TeamCard[] | null>(null);
  const [compTeams, setCompTeams] = useState<CompTeamCard[] | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!person) return;
    const personId = person.id;
    const studioId = person.studio_id;
    let cancelled = false;

    async function load() {
      const [{ data: teamRows }, { data: compTeamRows }, { data: teachIds }, { data: choreographIds }, { data: myDancerTeamRows }, { data: myDancerCastRows }, { data: guardianRows }] =
        await Promise.all([
          supabase.from("team").select("id, name, level").eq("studio_id", studioId).eq("is_active", true),
          supabase.from("comp_team").select("id, name, comp_team_type").eq("studio_id", studioId).eq("is_active", true),
          callApp<string[]>("teams_i_teach"),
          callApp<string[]>("comp_teams_i_choreograph"),
          supabase.from("team_member").select("team_id").eq("person_id", personId).eq("role", "dancer"),
          supabase.from("comp_team_cast").select("comp_team_id").eq("person_id", personId).eq("role", "dancer"),
          supabase.from("guardian_link").select("dancer_id").eq("guardian_id", personId),
        ]);

      const teamSet = new Set((teamRows ?? []).map((t) => t.id));
      const compTeamSet = new Set((compTeamRows ?? []).map((c) => c.id));
      const teachSet = new Set(teachIds ?? []);
      const choreographSet = new Set(choreographIds ?? []);
      const myDancerTeamSet = new Set((myDancerTeamRows ?? []).map((r) => r.team_id));
      const myDancerCompTeamSet = new Set((myDancerCastRows ?? []).map((r) => r.comp_team_id));

      const dancerIds = (guardianRows ?? []).map((g) => g.dancer_id);
      let dancerTeamSet = new Set<string>();
      let dancerCompTeamSet = new Set<string>();
      if (dancerIds.length > 0) {
        const [{ data: dTeamRows }, { data: dCastRows }] = await Promise.all([
          supabase.from("team_member").select("team_id").in("person_id", dancerIds).eq("role", "dancer"),
          supabase.from("comp_team_cast").select("comp_team_id").in("person_id", dancerIds).eq("role", "dancer"),
        ]);
        dancerTeamSet = new Set((dTeamRows ?? []).map((r) => r.team_id));
        dancerCompTeamSet = new Set((dCastRows ?? []).map((r) => r.comp_team_id));
      }

      const [{ data: teamMemberRows }, { data: entryRows }] = await Promise.all([
        teamSet.size > 0
          ? supabase.from("team_member").select("team_id, role").in("team_id", [...teamSet])
          : Promise.resolve({ data: [] as { team_id: string; role: string }[] }),
        compTeamSet.size > 0
          ? supabase.from("competition_entry").select("comp_team_id, competition_id").in("comp_team_id", [...compTeamSet])
          : Promise.resolve({ data: [] as { comp_team_id: string; competition_id: string }[] }),
      ]);

      const competitionIds = [...new Set((entryRows ?? []).map((r) => r.competition_id))];
      const { data: competitionRows } =
        competitionIds.length > 0
          ? await supabase.from("competition").select("id, name").in("id", competitionIds)
          : { data: [] as { id: string; name: string }[] };
      const competitionNameById = new Map((competitionRows ?? []).map((c) => [c.id, c.name]));

      const teamCards: TeamCard[] = (teamRows ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        level: t.level,
        dancerCount: (teamMemberRows ?? []).filter((m) => m.team_id === t.id && m.role === "dancer").length,
        role: teachSet.has(t.id)
          ? "Instructor"
          : myDancerTeamSet.has(t.id)
            ? "Dancer"
            : dancerTeamSet.has(t.id)
              ? "Parent"
              : null,
      }));

      const compTeamCards: CompTeamCard[] = (compTeamRows ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        comp_team_type: c.comp_team_type,
        competitionNames: (entryRows ?? [])
          .filter((r) => r.comp_team_id === c.id)
          .map((r) => competitionNameById.get(r.competition_id))
          .filter((n): n is string => !!n),
        role: choreographSet.has(c.id)
          ? "Choreographer"
          : myDancerCompTeamSet.has(c.id)
            ? "Dancer"
            : dancerCompTeamSet.has(c.id)
              ? "Parent"
              : null,
      }));

      if (cancelled) return;
      setTeams(teamCards);
      setCompTeams(compTeamCards);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [person]);

  const q = search.trim().toLowerCase();
  const filteredTeams = useMemo(
    () => (teams ?? []).filter((t) => !q || t.name.toLowerCase().includes(q)),
    [teams, q]
  );
  const filteredCompTeams = useMemo(
    () => (compTeams ?? []).filter((c) => !q || c.name.toLowerCase().includes(q)),
    [compTeams, q]
  );

  if (!person) return null;

  return (
    <div style={{ padding: "18px 20px 30px", maxWidth: 480 }}>
      <h2 className="font-display" style={{ fontSize: 19 }}>
        Teams &amp; Dances
      </h2>

      <div
        style={{
          marginTop: 14,
          display: "flex",
          alignItems: "center",
          gap: 9,
          background: "var(--surface)",
          border: "1px solid var(--hairline)",
          borderRadius: 13,
          padding: "11px 14px",
        }}
      >
        <SearchIcon />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search teams & dances…"
          style={{ border: "none", background: "none", outline: "none", fontSize: 13.5, flex: 1, color: "var(--ink)" }}
        />
      </div>

      <div style={{ marginTop: 22 }}>
        <Link
          to="/studio"
          style={{
            display: "block",
            borderRadius: 18,
            background: "var(--band)",
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "14px 16px" }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 13,
                flexShrink: 0,
                background: "var(--signal)",
                color: "var(--signal-ink)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <StudioIcon />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--band-ink)" }}>Studio</div>
              <div style={{ fontSize: 11.5, color: "var(--band-ink-2)", marginTop: 2 }}>
                Whole-studio posts, media &amp; essentials
              </div>
            </div>
            <ChevronIcon color="var(--band-ink-2)" />
          </div>
        </Link>
      </div>

      <div style={{ marginTop: 26 }}>
        <Eyebrow>Teams</Eyebrow>
        {teams === null ? (
          <p style={{ marginTop: 11, color: "var(--ink-2)", fontSize: 13 }}>Loading…</p>
        ) : filteredTeams.length === 0 ? (
          <p style={{ marginTop: 11, color: "var(--ink-2)", fontSize: 13 }}>
            {teams.length === 0 ? "Not on any Team yet." : "No matches."}
          </p>
        ) : (
          <div className="card" style={{ marginTop: 11, border: "1px solid var(--hairline)", borderRadius: 18, overflow: "hidden" }}>
            {filteredTeams.map((t) => (
              <Link key={t.id} to={`/team/${t.id}`} style={destinationRowStyle}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 13,
                    flexShrink: 0,
                    background: "linear-gradient(155deg, var(--sand), var(--hairline))",
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{t.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                    {t.dancerCount} {t.dancerCount === 1 ? "dancer" : "dancers"}
                  </div>
                </div>
                <RoleChip role={t.role} />
                <ChevronIcon />
              </Link>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 22 }}>
        <Eyebrow>Group &amp; solo dances</Eyebrow>
        {compTeams === null ? (
          <p style={{ marginTop: 11, color: "var(--ink-2)", fontSize: 13 }}>Loading…</p>
        ) : filteredCompTeams.length === 0 ? (
          <p style={{ marginTop: 11, color: "var(--ink-2)", fontSize: 13 }}>
            {compTeams.length === 0 ? "Not cast in any Comp Team yet." : "No matches."}
          </p>
        ) : (
          <div className="card" style={{ marginTop: 11, border: "1px solid var(--hairline)", borderRadius: 18, overflow: "hidden" }}>
            {filteredCompTeams.map((c) => (
              <Link key={c.id} to={`/comp-team/${c.id}`} style={destinationRowStyle}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 13,
                    flexShrink: 0,
                    background: "linear-gradient(155deg, var(--sand), var(--hairline))",
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{c.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                    {c.comp_team_type}
                    {c.competitionNames.length > 0
                      ? ` · entered in ${c.competitionNames.join(", ")}`
                      : ""}
                  </div>
                </div>
                <RoleChip role={c.role} />
                <ChevronIcon />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RoleChip({ role }: { role: string | null }) {
  if (!role) return null;
  const isInstr = role === "Instructor" || role === "Choreographer";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 10.5,
        fontWeight: 700,
        flexShrink: 0,
        background: isInstr ? "var(--band)" : "var(--sand)",
        color: isInstr ? "var(--signal)" : "var(--ink-2)",
      }}
    >
      {role}
    </span>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-display)",
        fontSize: 10.5,
        letterSpacing: "0.11em",
        textTransform: "uppercase",
        color: "var(--ink-3)",
        fontWeight: 700,
      }}
    >
      {children}
    </div>
  );
}

const destinationRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 13,
  padding: "13px 16px",
  borderTop: "1px solid var(--sand)",
  color: "inherit",
};

function SearchIcon() {
  return (
    <svg style={{ width: 16, height: 16, color: "var(--ink-3)", flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function StudioIcon() {
  return (
    <svg style={{ width: 21, height: 21 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round">
      <path d="M4 21V9l8-6 8 6v12" />
      <path d="M9 21v-7h6v7" />
    </svg>
  );
}

function ChevronIcon({ color = "var(--ink-3)" }: { color?: string }) {
  return (
    <svg style={{ width: 16, height: 16, color, flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}
