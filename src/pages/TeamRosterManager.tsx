import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthProvider";
import { Avatar } from "../components/Avatar";
import { Chip } from "../components/Chip";

interface TeamInfo {
  id: string;
  name: string;
  level: string | null;
}

interface RosterMember {
  id: string;
  full_name: string;
}

interface CandidatePerson {
  id: string;
  full_name: string;
  currentTeamName: string | null; // dancers only
}

// Ports design-reference/TeamRosterManager.dc.html — the destination behind
// "Manage roster" on the Teams & Competitions index (Task 8). Every action
// (Remove, Add, Move in) persists immediately; there's no staged "Save
// roster" step, since a dancer's single-Team placement is enforced by a
// real unique constraint (team_member_one_team_per_dancer_idx, confirmed
// live) rather than anything client-side to batch. Instructor assignment
// has no such limit — a second, independent list. See BUILD_PLAN.md Task 9.
export function TeamRosterManager() {
  const { id: teamId } = useParams<{ id: string }>();
  const { person } = useAuth();

  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [dancers, setDancers] = useState<RosterMember[] | null>(null);
  const [instructors, setInstructors] = useState<RosterMember[] | null>(null);
  const [dancerCandidates, setDancerCandidates] = useState<CandidatePerson[]>([]);
  const [instructorCandidates, setInstructorCandidates] = useState<CandidatePerson[]>([]);
  const [dancerSearch, setDancerSearch] = useState("");
  const [instructorSearch, setInstructorSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    if (!teamId || !person) return;

    const { data: teamRow } = await supabase.from("team").select("id, name, level").eq("id", teamId).single();
    setTeam(teamRow ?? null);
    if (!teamRow) return;

    const { data: memberRows } = await supabase
      .from("team_member")
      .select("person_id, role")
      .eq("team_id", teamId);

    const dancerIds = (memberRows ?? []).filter((m) => m.role === "dancer").map((m) => m.person_id);
    const instructorIds = (memberRows ?? []).filter((m) => m.role === "instructor").map((m) => m.person_id);
    const memberIds = [...dancerIds, ...instructorIds];

    const { data: memberPeople } =
      memberIds.length > 0
        ? await supabase.from("person").select("id, full_name").in("id", memberIds)
        : { data: [] as RosterMember[] };
    const nameById = new Map((memberPeople ?? []).map((p) => [p.id, p.full_name]));

    setDancers(dancerIds.map((id) => ({ id, full_name: nameById.get(id) ?? "Unknown" })));
    setInstructors(instructorIds.map((id) => ({ id, full_name: nameById.get(id) ?? "Unknown" })));

    // Every confirmed dancer studio-wide is a candidate, not just unplaced
    // ones — "Move in" is the whole action for a level move.
    const [{ data: dancerRoleRows }, { data: instructorRoleRows }, { data: allTeamMembers }, { data: allTeams }] =
      await Promise.all([
        supabase.from("person_role_assignment").select("person_id").eq("role", "dancer"),
        supabase.from("person_role_assignment").select("person_id").eq("role", "instructor"),
        supabase.from("team_member").select("person_id, team_id").eq("role", "dancer"),
        supabase.from("team").select("id, name").eq("studio_id", person.studio_id),
      ]);

    const teamNameById = new Map((allTeams ?? []).map((t) => [t.id, t.name]));
    const currentTeamByDancer = new Map((allTeamMembers ?? []).map((m) => [m.person_id, m.team_id]));

    const allDancerIds = (dancerRoleRows ?? []).map((r) => r.person_id);
    const allInstructorIds = (instructorRoleRows ?? []).map((r) => r.person_id);
    const candidateIds = [...new Set([...allDancerIds, ...allInstructorIds])];

    const { data: candidatePeople } =
      candidateIds.length > 0
        ? await supabase.from("person").select("id, full_name, status").in("id", candidateIds)
        : { data: [] as { id: string; full_name: string; status: string }[] };
    const confirmedById = new Map(
      (candidatePeople ?? []).filter((p) => p.status === "confirmed").map((p) => [p.id, p.full_name])
    );

    setDancerCandidates(
      allDancerIds
        .filter((id) => confirmedById.has(id) && !dancerIds.includes(id))
        .map((id) => {
          const currentTeamId = currentTeamByDancer.get(id);
          return {
            id,
            full_name: confirmedById.get(id)!,
            currentTeamName: currentTeamId ? teamNameById.get(currentTeamId) ?? null : null,
          };
        })
    );
    setInstructorCandidates(
      allInstructorIds
        .filter((id) => confirmedById.has(id) && !instructorIds.includes(id))
        .map((id) => ({ id, full_name: confirmedById.get(id)!, currentTeamName: null }))
    );
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, person]);

  const filteredDancerCandidates = useMemo(() => {
    const q = dancerSearch.trim().toLowerCase();
    if (!q) return [];
    return dancerCandidates.filter((c) => c.full_name.toLowerCase().includes(q));
  }, [dancerCandidates, dancerSearch]);

  const filteredInstructorCandidates = useMemo(() => {
    const q = instructorSearch.trim().toLowerCase();
    if (!q) return [];
    return instructorCandidates.filter((c) => c.full_name.toLowerCase().includes(q));
  }, [instructorCandidates, instructorSearch]);

  if (!team || !person) return null;

  const removeDancer = async (personId: string) => {
    setBusyId(personId);
    await supabase.from("team_member").delete().eq("team_id", team.id).eq("person_id", personId).eq("role", "dancer");
    await load();
    setBusyId(null);
  };

  const addOrMoveDancer = async (personId: string) => {
    setBusyId(personId);
    // The dancer's single-Team placement is a real unique constraint, not
    // just UI convention — the old row has to go before the new one lands.
    await supabase.from("team_member").delete().eq("person_id", personId).eq("role", "dancer");
    await supabase
      .from("team_member")
      .insert({ team_id: team.id, person_id: personId, studio_id: person.studio_id, role: "dancer" });
    setDancerSearch("");
    await load();
    setBusyId(null);
  };

  const removeInstructor = async (personId: string) => {
    setBusyId(personId);
    await supabase.from("team_member").delete().eq("team_id", team.id).eq("person_id", personId).eq("role", "instructor");
    await load();
    setBusyId(null);
  };

  const addInstructor = async (personId: string) => {
    setBusyId(personId);
    await supabase
      .from("team_member")
      .insert({ team_id: team.id, person_id: personId, studio_id: person.studio_id, role: "instructor" });
    setInstructorSearch("");
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
          <h2 style={{ fontSize: 24, letterSpacing: "-0.01em" }}>{team.name}</h2>
          <Chip label={`Team${team.level ? " · " + team.level : ""}`} />
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 4 }}>
          {instructors === null
            ? "Loading…"
            : `Instructor: ${instructors.length > 0 ? instructors.map((i) => i.full_name).join(", ") : "not yet assigned"} · ${dancers?.length ?? 0} ${(dancers?.length ?? 0) === 1 ? "dancer" : "dancers"} on the roster`}
        </div>
      </div>

      <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div>
          <Eyebrow>Roster · {dancers?.length ?? 0}</Eyebrow>
          <div className="card" style={{ marginTop: 11, border: "1px solid var(--hairline)", borderRadius: 16, padding: "6px 20px" }}>
            {dancers === null ? (
              <p style={{ padding: "12px 0", color: "var(--ink-2)" }}>Loading…</p>
            ) : dancers.length === 0 ? (
              <p style={{ padding: "12px 0", color: "var(--ink-2)", fontSize: 13 }}>No dancers on this Team yet.</p>
            ) : (
              dancers.map((d) => (
                <div key={d.id} style={rowStyle}>
                  <Avatar name={d.full_name} size={34} />
                  <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600 }}>{d.full_name}</div>
                  <button type="button" onClick={() => removeDancer(d.id)} disabled={busyId === d.id} style={removeBtnStyle}>
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
          <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 9, lineHeight: 1.5 }}>
            Removing here just ends this dancer's placement on {team.name} — it doesn't touch any
            Comp Team they're also on, and it doesn't deactivate their record.
          </p>
        </div>

        <div>
          <Eyebrow>Add or move a dancer in · all confirmed, any level</Eyebrow>
          <SearchBox value={dancerSearch} onChange={setDancerSearch} placeholder="Search the roster by name…" />
          {dancerSearch.trim() && (
            <div className="card" style={{ marginTop: 12, border: "1px solid var(--hairline)", borderRadius: 16, padding: "2px 20px" }}>
              {filteredDancerCandidates.length === 0 ? (
                <p style={{ padding: "12px 0", color: "var(--ink-2)", fontSize: 13 }}>No matches.</p>
              ) : (
                filteredDancerCandidates.map((c) => (
                  <div key={c.id} style={rowStyle}>
                    <Avatar name={c.full_name} size={34} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{c.full_name}</div>
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          color: c.currentTeamName ? "var(--busy)" : "var(--ink-3)",
                          background: "var(--sand)",
                          padding: "2px 8px",
                          borderRadius: 999,
                          display: "inline-block",
                          marginTop: 2,
                        }}
                      >
                        {c.currentTeamName ? `Currently on ${c.currentTeamName}` : "Not on a Team yet"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => addOrMoveDancer(c.id)}
                      disabled={busyId === c.id}
                      style={addBtnStyle}
                    >
                      {c.currentTeamName ? "Move in" : "Add"}
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
          <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 9, lineHeight: 1.5 }}>
            Every confirmed dancer studio-wide is searchable, not just unplaced ones — moving
            someone in here is the whole action for a level move, no separate remove step on
            their old Team's own roster.
          </p>
        </div>
      </div>

      <div style={{ marginTop: 28, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div>
          <Eyebrow>Instructors · {instructors?.length ?? 0}</Eyebrow>
          <div className="card" style={{ marginTop: 11, border: "1px solid var(--hairline)", borderRadius: 16, padding: "6px 20px" }}>
            {instructors === null ? (
              <p style={{ padding: "12px 0", color: "var(--ink-2)" }}>Loading…</p>
            ) : instructors.length === 0 ? (
              <p style={{ padding: "12px 0", color: "var(--ink-2)", fontSize: 13 }}>No instructor assigned yet.</p>
            ) : (
              instructors.map((i) => (
                <div key={i.id} style={rowStyle}>
                  <Avatar name={i.full_name} size={34} />
                  <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600 }}>{i.full_name}</div>
                  <button type="button" onClick={() => removeInstructor(i.id)} disabled={busyId === i.id} style={removeBtnStyle}>
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <Eyebrow>Add an instructor · no limit, unlike a dancer's one Team</Eyebrow>
          <SearchBox value={instructorSearch} onChange={setInstructorSearch} placeholder="Search instructors by name…" />
          {instructorSearch.trim() && (
            <div className="card" style={{ marginTop: 12, border: "1px solid var(--hairline)", borderRadius: 16, padding: "2px 20px" }}>
              {filteredInstructorCandidates.length === 0 ? (
                <p style={{ padding: "12px 0", color: "var(--ink-2)", fontSize: 13 }}>No matches.</p>
              ) : (
                filteredInstructorCandidates.map((c) => (
                  <div key={c.id} style={rowStyle}>
                    <Avatar name={c.full_name} size={34} />
                    <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600 }}>{c.full_name}</div>
                    <button
                      type="button"
                      onClick={() => addInstructor(c.id)}
                      disabled={busyId === c.id}
                      style={addBtnStyle}
                    >
                      Add
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div
      style={{
        marginTop: 11,
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "11px 14px",
        borderRadius: 11,
        background: "var(--surface)",
        border: "1px solid var(--hairline)",
      }}
    >
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
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ border: "none", background: "none", outline: "none", fontSize: 13, flex: 1, color: "var(--ink)" }}
      />
    </div>
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
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 0",
  borderTop: "1px solid var(--hairline)",
};

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
