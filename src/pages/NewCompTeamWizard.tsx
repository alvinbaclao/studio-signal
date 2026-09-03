import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthProvider";
import { Avatar } from "../components/Avatar";
import { PrimaryButton } from "../components/PrimaryButton";
import { SecondaryButton } from "../components/SecondaryButton";
import type { Database } from "../lib/database.types";

type CompTeamType = Database["public"]["Enums"]["comp_team_type"];

const TYPE_OPTIONS: { value: CompTeamType; label: string }[] = [
  { value: "solo", label: "Solo" },
  { value: "duo", label: "Duo" },
  { value: "trio", label: "Trio" },
  { value: "small_group", label: "Small Group" },
  { value: "large_group", label: "Large Group" },
  { value: "production", label: "Production" },
];

interface InstructorOption {
  id: string;
  full_name: string;
}

interface DancerCandidate {
  id: string;
  full_name: string;
  teamId: string | null;
  teamName: string | null;
}

type Step = 1 | 2 | 3;

// Ports CompGroupWizardDetails.dc.html → CompGroupWizardRoster.dc.html →
// CompGroupWizardReview.dc.html — nothing persists until "Create Comp
// Team" on the last step, all in one sequence of inserts. See
// BUILD_PLAN.md Task 10.
//
// One thing this wizard deliberately does NOT do, unlike the artboard's
// Review step: create a message_thread for the new Comp Team. A direct
// client insert into message_thread is blocked by RLS (confirmed live,
// even signed in as Director) and there's no app-schema RPC for it either
// — see docs/DEFICIENCIES.md #1. Everything else the Review step promises
// (comp_team, comp_team_cast, comp_team_source_team, the choreographer
// auto-confirm trigger) is real.
export function NewCompTeamWizard() {
  const { person } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>(1);
  const [compTeamType, setCompTeamType] = useState<CompTeamType>("small_group");
  const [name, setName] = useState("");
  const [level, setLevel] = useState("");
  const [choreographerId, setChoreographerId] = useState("");
  const [instructors, setInstructors] = useState<InstructorOption[]>([]);
  const [candidates, setCandidates] = useState<DancerCandidate[]>([]);
  const [castIds, setCastIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!person) return;
    supabase
      .from("person_role_assignment")
      .select("person_id")
      .eq("role", "instructor")
      .then(async ({ data: roleRows }) => {
        const ids = (roleRows ?? []).map((r) => r.person_id);
        if (ids.length === 0) {
          setInstructors([]);
          return;
        }
        const { data } = await supabase
          .from("person")
          .select("id, full_name")
          .in("id", ids)
          .in("status", ["confirmed", "pending"]);
        setInstructors(data ?? []);
      });

    async function loadDancers() {
      const { data: roleRows } = await supabase.from("person_role_assignment").select("person_id").eq("role", "dancer");
      const dancerIds = (roleRows ?? []).map((r) => r.person_id);
      if (dancerIds.length === 0) {
        setCandidates([]);
        return;
      }
      const [{ data: people }, { data: teamMembers }, { data: teams }] = await Promise.all([
        supabase.from("person").select("id, full_name").in("id", dancerIds).eq("status", "confirmed"),
        supabase.from("team_member").select("person_id, team_id").eq("role", "dancer").in("person_id", dancerIds),
        supabase.from("team").select("id, name").eq("studio_id", person!.studio_id),
      ]);
      const teamNameById = new Map((teams ?? []).map((t) => [t.id, t.name]));
      const teamByPerson = new Map((teamMembers ?? []).map((m) => [m.person_id, m.team_id]));
      setCandidates(
        (people ?? []).map((p) => {
          const teamId = teamByPerson.get(p.id) ?? null;
          return { id: p.id, full_name: p.full_name, teamId, teamName: teamId ? teamNameById.get(teamId) ?? null : null };
        })
      );
    }
    loadDancers();
  }, [person]);

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q ? candidates.filter((c) => c.full_name.toLowerCase().includes(q)) : candidates;
    const groups = new Map<string, DancerCandidate[]>();
    for (const c of filtered) {
      const key = c.teamName ?? "Not on a Team";
      const arr = groups.get(key) ?? [];
      arr.push(c);
      groups.set(key, arr);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [candidates, search]);

  const selected = candidates.filter((c) => castIds.includes(c.id));
  const choreographer = instructors.find((i) => i.id === choreographerId);

  if (!person) return null;

  const toggleCast = (id: string) => {
    setCastIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const create = async () => {
    setSubmitting(true);
    setError(null);

    const { data: seasonRow } = await supabase
      .from("season")
      .select("id")
      .eq("studio_id", person.studio_id)
      .eq("is_current", true)
      .maybeSingle();
    if (!seasonRow) {
      setError("No current season is set up for this studio.");
      setSubmitting(false);
      return;
    }

    const { data: newTeam, error: insertError } = await supabase
      .from("comp_team")
      .insert({ studio_id: person.studio_id, season_id: seasonRow.id, name, comp_team_type: compTeamType, level: level || null })
      .select("id")
      .single();
    if (insertError || !newTeam) {
      setError(insertError?.message ?? "Couldn't create the Comp Team.");
      setSubmitting(false);
      return;
    }

    type CastRole = Database["public"]["Enums"]["comp_team_role"];
    const castRows: { comp_team_id: string; person_id: string; studio_id: string; role: CastRole }[] =
      castIds.map((id) => ({
        comp_team_id: newTeam.id,
        person_id: id,
        studio_id: person.studio_id,
        role: "dancer",
      }));
    if (choreographerId) {
      castRows.push({
        comp_team_id: newTeam.id,
        person_id: choreographerId,
        studio_id: person.studio_id,
        role: "choreographer",
      });
    }
    if (castRows.length > 0) {
      const { error: castError } = await supabase.from("comp_team_cast").insert(castRows);
      if (castError) {
        setError(castError.message);
        setSubmitting(false);
        return;
      }
    }

    const sourceTeamIds = [...new Set(selected.map((s) => s.teamId).filter((id): id is string => !!id))];
    if (sourceTeamIds.length > 0) {
      const { error: sourceError } = await supabase
        .from("comp_team_source_team")
        .insert(sourceTeamIds.map((teamId) => ({ comp_team_id: newTeam.id, team_id: teamId })));
      if (sourceError) {
        setError(sourceError.message);
        setSubmitting(false);
        return;
      }
    }

    navigate("/teams");
  };

  return (
    <div style={{ padding: "18px 34px 30px", maxWidth: 640 }}>
      <Link to="/teams" style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)" }}>
        ← Teams &amp; Competitions
      </Link>
      <h2 style={{ fontSize: 24, letterSpacing: "-0.01em", marginTop: 8 }}>New Comp Team</h2>

      <Stepper step={step} />

      {step === 1 && (
        <div className="card" style={{ marginTop: 20, border: "1px solid var(--hairline)", borderRadius: 16, padding: "26px 28px", display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <FieldLabel>Entry type</FieldLabel>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setCompTeamType(opt.value)}
                  style={{
                    padding: "9px 14px",
                    borderRadius: 9,
                    border: "none",
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: "pointer",
                    background: compTeamType === opt.value ? "var(--surface)" : "var(--sand)",
                    color: compTeamType === opt.value ? "var(--ink)" : "var(--ink-3)",
                    boxShadow: compTeamType === opt.value ? "0 2px 6px -2px rgba(44,32,12,.2)" : "none",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <FieldLabel>Name</FieldLabel>
            <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%" }} />
            <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 6 }}>
              Usually the dancers' names for a Solo/Duo/Trio, or the piece title for a Group —
              whatever the studio actually calls it.
            </p>
          </div>

          <div style={{ maxWidth: 200 }}>
            <FieldLabel>Level (optional)</FieldLabel>
            <input value={level} onChange={(e) => setLevel(e.target.value)} placeholder="Level 2" style={{ width: "100%" }} />
          </div>

          <div>
            <FieldLabel>Choreographer (optional)</FieldLabel>
            <select value={choreographerId} onChange={(e) => setChoreographerId(e.target.value)} style={{ width: "100%" }}>
              <option value="">Not yet assigned</option>
              {instructors.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.full_name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {step === 2 && (
        <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <div>
            <Eyebrow>Search the roster</Eyebrow>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name…"
              style={{ width: "100%", marginTop: 9 }}
            />
            <div className="card" style={{ marginTop: 14, border: "1px solid var(--hairline)", borderRadius: 16, padding: "2px 18px", maxHeight: 480, overflowY: "auto" }}>
              {grouped.length === 0 ? (
                <p style={{ padding: "12px 0", color: "var(--ink-2)", fontSize: 13 }}>No confirmed dancers found.</p>
              ) : (
                grouped.map(([teamName, people]) => (
                  <div key={teamName}>
                    <div style={{ padding: "12px 0 4px", fontSize: 11, fontWeight: 700, color: "var(--ink-3)" }}>
                      {teamName.toUpperCase()}
                    </div>
                    {people.map((p) => (
                      <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderTop: "1px solid var(--hairline)", cursor: "pointer" }}>
                        <input type="checkbox" checked={castIds.includes(p.id)} onChange={() => toggleCast(p.id)} />
                        <Avatar name={p.full_name} size={30} />
                        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{p.full_name}</span>
                      </label>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <Eyebrow>Selected · {selected.length}</Eyebrow>
            <div className="card" style={{ marginTop: 9, border: "1px solid var(--hairline)", borderRadius: 16, padding: "6px 18px" }}>
              {selected.length === 0 ? (
                <p style={{ padding: "12px 0", color: "var(--ink-2)", fontSize: 13 }}>No one selected yet.</p>
              ) : (
                selected.map((s) => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderTop: "1px solid var(--hairline)" }}>
                    <Avatar name={s.full_name} size={32} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{s.full_name}</div>
                      <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{s.teamName ?? "Not on a Team"}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 1.1fr", gap: 22 }}>
          <div>
            <Eyebrow>This Comp Team</Eyebrow>
            <div className="card" style={{ marginTop: 9, border: "1px solid var(--hairline)", borderRadius: 16, padding: "20px 22px" }}>
              <h3 style={{ fontSize: 17 }}>{name || "(untitled)"}</h3>
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 9 }}>
                <KV label="Type">{TYPE_OPTIONS.find((t) => t.value === compTeamType)?.label}</KV>
                {level.trim() && <KV label="Level">{level.trim()}</KV>}
                <KV label="Choreographer">{choreographer?.full_name ?? "Not yet assigned"}</KV>
                <KV label="Roster">{selected.length > 0 ? selected.map((s) => s.full_name).join(", ") : "No dancers yet"}</KV>
                <KV label="Entered in a competition?">Not yet</KV>
              </div>
            </div>
          </div>

          <div>
            <Eyebrow>What happens when you create it</Eyebrow>
            <div className="card" style={{ marginTop: 9, border: "1px solid var(--hairline)", borderRadius: 16, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
              <UpdateRow>
                {name || "This Comp Team"} is added to your studio's Comp Teams, cast with{" "}
                {selected.length} {selected.length === 1 ? "dancer" : "dancers"}
                {sourceSummary(selected)}.
              </UpdateRow>
              {choreographerId && (
                <UpdateRow>
                  {choreographer?.full_name} is cast as choreographer — if they were still pending,
                  this confirms them automatically.
                </UpdateRow>
              )}
              <UpdateRow>
                It appears in Teams &amp; Competitions' Comp Teams list, ready to enter into a Dance
                Competition whenever you're ready — that's a separate step, from that same page.
              </UpdateRow>
            </div>
          </div>
        </div>
      )}

      {error && <p style={{ color: "var(--busy)", marginTop: 16, fontSize: 13 }}>{error}</p>}

      <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end", gap: 10 }}>
        {step === 1 ? (
          <SecondaryButton onClick={() => navigate("/teams")}>Save &amp; exit</SecondaryButton>
        ) : (
          <SecondaryButton onClick={() => setStep((step - 1) as Step)}>Back</SecondaryButton>
        )}
        {step < 3 ? (
          <PrimaryButton onClick={() => setStep((step + 1) as Step)} disabled={step === 1 && !name.trim()}>
            {step === 1 ? "Continue to Roster" : "Continue to Review & create"}
          </PrimaryButton>
        ) : (
          <PrimaryButton onClick={create} disabled={submitting}>
            {submitting ? "Creating…" : "Create Comp Team"}
          </PrimaryButton>
        )}
      </div>
    </div>
  );
}

function sourceSummary(selected: DancerCandidate[]): string {
  const teams = [...new Set(selected.map((s) => s.teamName).filter((n): n is string => !!n))];
  if (teams.length === 0) return "";
  return ` from ${teams.join(" + ")}`;
}

function Stepper({ step }: { step: Step }) {
  const labels = ["Details", "Roster", "Review & create"];
  return (
    <div style={{ marginTop: 20, display: "flex", alignItems: "center", maxWidth: 500 }}>
      {labels.map((label, i) => {
        const num = (i + 1) as Step;
        const done = num < step;
        const on = num === step;
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", flex: i < labels.length - 1 ? 1 : undefined }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  fontSize: 11,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  background: done ? "var(--ok-tint)" : on ? "var(--band)" : "transparent",
                  color: done ? "var(--ok)" : on ? "var(--signal)" : "var(--ink-3)",
                  border: !done && !on ? "1.5px solid var(--hairline)" : "none",
                }}
              >
                {done ? "✓" : num}
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: on ? "var(--ink)" : "var(--ink-3)" }}>{label}</span>
            </div>
            {i < labels.length - 1 && <span style={{ flex: 1, height: 1.5, background: "var(--hairline)", margin: "0 6px" }} />}
          </div>
        );
      })}
    </div>
  );
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, borderTop: "1px solid var(--hairline)", paddingTop: 9 }}>
      <span style={{ color: "var(--ink-3)" }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: "right" }}>{children}</span>
    </div>
  );
}

function UpdateRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "var(--ok-tint)",
          color: "var(--ok)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          marginTop: 1,
          fontSize: 11,
        }}
      >
        ✓
      </span>
      <span style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>{children}</span>
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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-2)", marginBottom: 7, display: "block" }}>
      {children}
    </span>
  );
}
