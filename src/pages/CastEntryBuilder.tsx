import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthProvider";
import { Avatar } from "../components/Avatar";
import { Chip } from "../components/Chip";

interface CompTeamInfo {
  id: string;
  name: string;
  comp_team_type: string;
}

interface CastMember {
  id: string;
  full_name: string;
  sourceTeamName: string | null;
}

interface DancerCandidate {
  id: string;
  full_name: string;
  teamId: string | null;
  teamName: string | null;
}

// Ports CastEntryBuilder.dc.html — the same add/remove pattern as
// TeamRosterManager, reused standalone for an existing Comp Team's
// roster, deliberately separate from Team assignment. Cast pulled from
// more than one Team on purpose; removing here never touches a dancer's
// own Team placement. See BUILD_PLAN.md Task 10.
export function CastEntryBuilder() {
  const { id: compTeamId } = useParams<{ id: string }>();
  const { person } = useAuth();

  const [compTeam, setCompTeam] = useState<CompTeamInfo | null>(null);
  const [choreographerName, setChoreographerName] = useState<string | null>(null);
  const [cast, setCast] = useState<CastMember[] | null>(null);
  const [candidates, setCandidates] = useState<DancerCandidate[]>([]);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    if (!compTeamId || !person) return;

    const { data: teamRow } = await supabase
      .from("comp_team")
      .select("id, name, comp_team_type")
      .eq("id", compTeamId)
      .single();
    setCompTeam(teamRow ?? null);
    if (!teamRow) return;

    const { data: castRows } = await supabase
      .from("comp_team_cast")
      .select("person_id, role")
      .eq("comp_team_id", compTeamId);

    const dancerIds = (castRows ?? []).filter((c) => c.role === "dancer").map((c) => c.person_id);
    const choreographerId = (castRows ?? []).find((c) => c.role === "choreographer")?.person_id;

    const [{ data: sourceRows }, { data: castPeople }, { data: choreographerPerson }] = await Promise.all([
      supabase.from("comp_team_source_team").select("team_id").eq("comp_team_id", compTeamId),
      dancerIds.length > 0
        ? supabase.from("person").select("id, full_name").in("id", dancerIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      choreographerId
        ? supabase.from("person").select("full_name").eq("id", choreographerId).maybeSingle()
        : Promise.resolve({ data: null as { full_name: string } | null }),
    ]);
    setChoreographerName(choreographerPerson?.full_name ?? null);

    // Each dancer's ORIGINATING Team, not their current one — see
    // PROJECT_KNOWLEDGE.md: casting records the source at cast time,
    // never re-derived from the live team_member roster.
    const sourceTeamIds = (sourceRows ?? []).map((r) => r.team_id);
    const [{ data: sourceTeams }, { data: currentTeamMembers }] = await Promise.all([
      sourceTeamIds.length > 0
        ? supabase.from("team").select("id, name").in("id", sourceTeamIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      dancerIds.length > 0
        ? supabase.from("team_member").select("person_id, team_id").eq("role", "dancer").in("person_id", dancerIds).in("team_id", sourceTeamIds)
        : Promise.resolve({ data: [] as { person_id: string; team_id: string }[] }),
    ]);
    const sourceTeamNameById = new Map((sourceTeams ?? []).map((t) => [t.id, t.name]));
    const currentTeamByPerson = new Map((currentTeamMembers ?? []).map((m) => [m.person_id, m.team_id]));

    setCast(
      (castPeople ?? []).map((p) => {
        const teamId = currentTeamByPerson.get(p.id);
        return { id: p.id, full_name: p.full_name, sourceTeamName: teamId ? sourceTeamNameById.get(teamId) ?? null : null };
      })
    );

    const { data: dancerRoleRows } = await supabase.from("person_role_assignment").select("person_id").eq("role", "dancer");
    const allDancerIds = (dancerRoleRows ?? []).map((r) => r.person_id);
    const remainingIds = allDancerIds.filter((id) => !dancerIds.includes(id));
    if (remainingIds.length === 0) {
      setCandidates([]);
      return;
    }
    const [{ data: candidatePeople }, { data: candidateTeamMembers }, { data: allTeams }] = await Promise.all([
      supabase.from("person").select("id, full_name").in("id", remainingIds).eq("status", "confirmed"),
      supabase.from("team_member").select("person_id, team_id").eq("role", "dancer").in("person_id", remainingIds),
      supabase.from("team").select("id, name").eq("studio_id", person.studio_id),
    ]);
    const teamNameById = new Map((allTeams ?? []).map((t) => [t.id, t.name]));
    const teamByPerson = new Map((candidateTeamMembers ?? []).map((m) => [m.person_id, m.team_id]));
    setCandidates(
      (candidatePeople ?? []).map((p) => {
        const teamId = teamByPerson.get(p.id) ?? null;
        return { id: p.id, full_name: p.full_name, teamId, teamName: teamId ? teamNameById.get(teamId) ?? null : null };
      })
    );
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compTeamId, person]);

  const filteredCandidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return candidates.filter((c) => c.full_name.toLowerCase().includes(q));
  }, [candidates, search]);

  const groupedBySource = useMemo(() => {
    if (!cast) return [];
    const groups = new Map<string, CastMember[]>();
    for (const c of cast) {
      const key = c.sourceTeamName ?? "No source Team";
      const arr = groups.get(key) ?? [];
      arr.push(c);
      groups.set(key, arr);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [cast]);

  if (!compTeam || !person) return null;

  const remove = async (personId: string) => {
    setBusyId(personId);
    await supabase.from("comp_team_cast").delete().eq("comp_team_id", compTeam.id).eq("person_id", personId).eq("role", "dancer");
    await load();
    setBusyId(null);
  };

  const add = async (candidate: DancerCandidate) => {
    setBusyId(candidate.id);
    await supabase
      .from("comp_team_cast")
      .insert({ comp_team_id: compTeam.id, person_id: candidate.id, studio_id: person.studio_id, role: "dancer" });

    if (candidate.teamId) {
      const { data: existing } = await supabase
        .from("comp_team_source_team")
        .select("team_id")
        .eq("comp_team_id", compTeam.id)
        .eq("team_id", candidate.teamId)
        .maybeSingle();
      if (!existing) {
        await supabase.from("comp_team_source_team").insert({ comp_team_id: compTeam.id, team_id: candidate.teamId });
      }
    }

    setSearch("");
    await load();
    setBusyId(null);
  };

  return (
    <div style={{ padding: "18px 34px 30px" }}>
      <Link to="/teams" style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)" }}>
        ← Teams &amp; Competitions
      </Link>

      <div style={{ marginTop: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <h2 style={{ fontSize: 24, letterSpacing: "-0.01em" }}>{compTeam.name}</h2>
          <Chip label={compTeam.comp_team_type} />
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 4 }}>
          {`Choreographed by ${choreographerName ?? "not yet assigned"} · ${cast?.length ?? 0} ${(cast?.length ?? 0) === 1 ? "dancer" : "dancers"} on the roster`}
        </div>
      </div>

      <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div>
          <Eyebrow>Cast · {cast?.length ?? 0}</Eyebrow>
          <div className="card" style={{ marginTop: 11, border: "1px solid var(--hairline)", borderRadius: 16, padding: "6px 20px" }}>
            {cast === null ? (
              <p style={{ padding: "12px 0", color: "var(--ink-2)" }}>Loading…</p>
            ) : cast.length === 0 ? (
              <p style={{ padding: "12px 0", color: "var(--ink-2)", fontSize: 13 }}>No dancers cast yet.</p>
            ) : (
              groupedBySource.map(([teamName, members]) => (
                <div key={teamName}>
                  <div style={{ padding: "12px 0 4px", fontSize: 11, fontWeight: 700, color: "var(--ink-3)" }}>
                    FROM {teamName.toUpperCase()}
                  </div>
                  {members.map((m) => (
                    <div key={m.id} style={rowStyle}>
                      <Avatar name={m.full_name} size={34} />
                      <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600 }}>{m.full_name}</div>
                      <button type="button" onClick={() => remove(m.id)} disabled={busyId === m.id} style={removeBtnStyle}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
          <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 9, lineHeight: 1.5 }}>
            Cast can be pulled from more than one Team on purpose — group numbers often don't map
            to a single class. Removing here doesn't touch any Team's own roster.
          </p>
        </div>

        <div>
          <Eyebrow>Add dancers · all confirmed, any team</Eyebrow>
          <SearchBox value={search} onChange={setSearch} placeholder="Search the roster by name…" />
          {search.trim() && (
            <div className="card" style={{ marginTop: 12, border: "1px solid var(--hairline)", borderRadius: 16, padding: "2px 20px" }}>
              {filteredCandidates.length === 0 ? (
                <p style={{ padding: "12px 0", color: "var(--ink-2)", fontSize: 13 }}>No matches.</p>
              ) : (
                filteredCandidates.map((c) => (
                  <div key={c.id} style={rowStyle}>
                    <Avatar name={c.full_name} size={34} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{c.full_name}</div>
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          color: "var(--ink-3)",
                          background: "var(--sand)",
                          padding: "2px 8px",
                          borderRadius: 999,
                          display: "inline-block",
                          marginTop: 2,
                        }}
                      >
                        {c.teamName ?? "Not on a Team"}
                      </span>
                    </div>
                    <button type="button" onClick={() => add(c)} disabled={busyId === c.id} style={addBtnStyle}>
                      Add
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
          <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 9, lineHeight: 1.5 }}>
            Every confirmed dancer studio-wide is searchable here, not just the Teams already
            represented — this is where a dancer from any level could join this number if the
            choreography calls for it.
          </p>
        </div>
      </div>
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div style={{ marginTop: 11, display: "flex", alignItems: "center", gap: 9, padding: "11px 14px", borderRadius: 11, background: "var(--surface)", border: "1px solid var(--hairline)" }}>
      <svg style={{ width: 16, height: 16, color: "var(--ink-3)", flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </svg>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ border: "none", background: "none", outline: "none", fontSize: 13, flex: 1, color: "var(--ink)" }} />
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "var(--font-display)", fontSize: 10.5, letterSpacing: "0.11em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>
      {children}
    </div>
  );
}

const rowStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: "1px solid var(--hairline)" };

const removeBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 13px",
  borderRadius: 8,
  background: "var(--surface)",
  border: "1px solid var(--hairline)",
  color: "var(--ink-3)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  flexShrink: 0,
};

const addBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 13px",
  borderRadius: 8,
  background: "var(--sand)",
  border: "none",
  color: "var(--ink)",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  flexShrink: 0,
};
