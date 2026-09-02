import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthProvider";
import { Avatar } from "../components/Avatar";
import { Chip } from "../components/Chip";
import { PrimaryButton } from "../components/PrimaryButton";
import { SecondaryButton } from "../components/SecondaryButton";
import type { Database } from "../lib/database.types";

type CompTeamType = Database["public"]["Enums"]["comp_team_type"];
type Step = 1 | 2 | 3 | 4;

const TYPE_LABEL: Record<CompTeamType, string> = {
  solo: "Solo",
  duo: "Duo",
  trio: "Trio",
  small_group: "Small Group",
  large_group: "Large Group",
  production: "Production",
};

interface CompTeamRow {
  id: string;
  name: string;
  comp_team_type: CompTeamType;
  choreographerName: string | null;
  dancerCount: number;
  isNewToday: boolean;
}

interface EntryState {
  entryId: string;
  proposedBy: string | null;
  proposedByName: string | null;
  acceptedAt: string | null;
}

// Ports design-reference/CompetitionWizardDetails.dc.html →
// CompetitionWizardEntries.dc.html — steps 1-2 of 4 only; steps 3-4 (Call
// times, Review & publish) are Tasks 23/24 and stay as a Placeholder for
// now, matching this build's established incremental-stub pattern. See
// BUILD_PLAN.md Task 22.
//
// Unlike NewCompTeamWizard (Task 10), which defers every write to a final
// "Create" step, this wizard persists progressively — BUILD_PLAN says so
// explicitly ("Details step inserts competition with published_at left
// null"), and a real competition takes real-world time to plan, so it
// needs to be resumable. "/competitions/new" creates a fresh row on step
// 1's Continue and then behaves exactly like "/competition/:id/manage" —
// one component serves both, matching the artboard's own note that this
// same form is what "+ New Competition" opens, empty.
//
// Entries: checking a box is Director-direct, auto-accepted immediately
// (accepted_at = now(), proposed_by = null) — Director doesn't need their
// own approval. An instructor-*proposed* entry (proposed_by set,
// accepted_at null) renders with Accept/Decline instead of a checkbox,
// per BUILD_PLAN's explicit mention — there's no reachable UI anywhere in
// this build yet for an instructor to actually create one (no nav path
// exists for a non-Director to reach Teams & Competitions), so this half
// was verified live by seeding a test row directly rather than through a
// real proposing screen; see docs/DEFICIENCIES.md.
//
// Comp Team rows show no "Level" — comp_team has no level column at all
// (only team does), same gap as Deficiency #24 (Comp Team Home's
// subtitle), just surfacing on a new screen.
export function CompetitionWizard() {
  const { id: routeId } = useParams<{ id?: string }>();
  const { person } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>(routeId ? 2 : 1);
  const [competitionId, setCompetitionId] = useState<string | null>(routeId ?? null);
  const [loadingExisting, setLoadingExisting] = useState(!!routeId);

  const [name, setName] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [compTeams, setCompTeams] = useState<CompTeamRow[] | null>(null);
  const [entries, setEntries] = useState<Map<string, EntryState>>(new Map());
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    if (!routeId || !person) return;
    let cancelled = false;
    supabase
      .from("competition")
      .select("*")
      .eq("id", routeId)
      .single()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setName(data.name);
        setVenueName(data.venue_name ?? "");
        setVenueAddress(data.venue_address ?? "");
        setDate(data.starts_on);
        setNotes(data.registration_note ?? "");
        setCompetitionId(data.id);
        setLoadingExisting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [routeId, person]);

  useEffect(() => {
    if (step !== 2 || !person || !competitionId) return;
    let cancelled = false;
    async function load() {
      const { data: teamRows } = await supabase
        .from("comp_team")
        .select("id, name, comp_team_type, created_at")
        .eq("studio_id", person!.studio_id)
        .eq("is_active", true)
        .order("name");
      const ids = (teamRows ?? []).map((t) => t.id);

      const [{ data: castRows }, { data: entryRows }] = await Promise.all([
        ids.length > 0
          ? supabase.from("comp_team_cast").select("comp_team_id, person_id, role").in("comp_team_id", ids)
          : Promise.resolve({ data: [] as { comp_team_id: string; person_id: string; role: string }[] }),
        supabase.from("competition_entry").select("id, comp_team_id, proposed_by, accepted_at").eq("competition_id", competitionId!),
      ]);
      if (cancelled) return;

      const choreoIds = (castRows ?? []).filter((r) => r.role === "choreographer").map((r) => r.person_id);
      const proposerIds = (entryRows ?? []).map((r) => r.proposed_by).filter((v): v is string => !!v);
      const peopleIds = [...new Set([...choreoIds, ...proposerIds])];
      const { data: people } = peopleIds.length > 0 ? await supabase.from("person").select("id, full_name").in("id", peopleIds) : { data: [] as { id: string; full_name: string }[] };
      if (cancelled) return;
      const nameById = new Map((people ?? []).map((p) => [p.id, p.full_name]));

      const today = new Date().toDateString();
      setCompTeams(
        (teamRows ?? []).map((t) => {
          const cast = (castRows ?? []).filter((r) => r.comp_team_id === t.id);
          const choreo = cast.find((r) => r.role === "choreographer");
          return {
            id: t.id,
            name: t.name,
            comp_team_type: t.comp_team_type,
            choreographerName: choreo ? nameById.get(choreo.person_id) ?? null : null,
            dancerCount: cast.filter((r) => r.role === "dancer").length,
            isNewToday: new Date(t.created_at).toDateString() === today,
          };
        })
      );
      setEntries(
        new Map(
          (entryRows ?? []).map((e) => [
            e.comp_team_id,
            { entryId: e.id, proposedBy: e.proposed_by, proposedByName: e.proposed_by ? nameById.get(e.proposed_by) ?? null : null, acceptedAt: e.accepted_at },
          ])
        )
      );
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [step, person, competitionId]);

  const canContinue = name.trim().length > 0 && date.trim().length > 0;

  async function saveDetails() {
    if (!person || !canContinue) return;
    setSaving(true);
    setError(null);
    const payload = {
      studio_id: person.studio_id,
      name: name.trim(),
      venue_name: venueName.trim() || null,
      venue_address: venueAddress.trim() || null,
      starts_on: date,
      ends_on: date,
      registration_note: notes.trim() || null,
    };
    if (competitionId) {
      const { error: updateErr } = await supabase.from("competition").update(payload).eq("id", competitionId);
      setSaving(false);
      if (updateErr) {
        setError("Something went wrong saving these details — try again.");
        return;
      }
      setStep(2);
    } else {
      const { data, error: insertErr } = await supabase
        .from("competition")
        .insert({ ...payload, created_by: person.id })
        .select("id")
        .single();
      setSaving(false);
      if (insertErr || !data) {
        setError("Something went wrong creating this competition — try again.");
        return;
      }
      setCompetitionId(data.id);
      navigate(`/competition/${data.id}/manage`, { replace: true });
      setStep(2);
    }
  }

  async function toggleEntry(compTeamId: string) {
    if (!person || !competitionId) return;
    const existing = entries.get(compTeamId);
    setTogglingId(compTeamId);
    if (existing) {
      const { error: delErr } = await supabase.from("competition_entry").delete().eq("id", existing.entryId);
      if (!delErr) {
        setEntries((prev) => {
          const next = new Map(prev);
          next.delete(compTeamId);
          return next;
        });
      }
    } else {
      const { data, error: insErr } = await supabase
        .from("competition_entry")
        .insert({ studio_id: person.studio_id, competition_id: competitionId, comp_team_id: compTeamId, proposed_by: null, accepted_at: new Date().toISOString() })
        .select("id")
        .single();
      if (!insErr && data) {
        setEntries((prev) => new Map(prev).set(compTeamId, { entryId: data.id, proposedBy: null, proposedByName: null, acceptedAt: new Date().toISOString() }));
      }
    }
    setTogglingId(null);
  }

  async function acceptProposal(compTeamId: string) {
    const existing = entries.get(compTeamId);
    if (!existing) return;
    setTogglingId(compTeamId);
    const acceptedAt = new Date().toISOString();
    const { error: updErr } = await supabase.from("competition_entry").update({ accepted_at: acceptedAt }).eq("id", existing.entryId);
    if (!updErr) {
      setEntries((prev) => new Map(prev).set(compTeamId, { ...existing, acceptedAt }));
    }
    setTogglingId(null);
  }

  async function declineProposal(compTeamId: string) {
    const existing = entries.get(compTeamId);
    if (!existing) return;
    setTogglingId(compTeamId);
    const { error: delErr } = await supabase.from("competition_entry").delete().eq("id", existing.entryId);
    if (!delErr) {
      setEntries((prev) => {
        const next = new Map(prev);
        next.delete(compTeamId);
        return next;
      });
    }
    setTogglingId(null);
  }

  async function selectAll(select: boolean) {
    if (!person || !competitionId || !compTeams) return;
    if (select) {
      const toAdd = compTeams.filter((t) => !entries.has(t.id));
      if (toAdd.length === 0) return;
      const acceptedAt = new Date().toISOString();
      const { data, error: insErr } = await supabase
        .from("competition_entry")
        .insert(toAdd.map((t) => ({ studio_id: person.studio_id, competition_id: competitionId, comp_team_id: t.id, proposed_by: null, accepted_at: acceptedAt })))
        .select("id, comp_team_id");
      if (!insErr && data) {
        setEntries((prev) => {
          const next = new Map(prev);
          for (const row of data) next.set(row.comp_team_id, { entryId: row.id, proposedBy: null, proposedByName: null, acceptedAt });
          return next;
        });
      }
    } else {
      const toRemove = [...entries.values()].map((e) => e.entryId);
      if (toRemove.length === 0) return;
      const { error: delErr } = await supabase.from("competition_entry").delete().in("id", toRemove);
      if (!delErr) setEntries(new Map());
    }
  }

  if (!person) return null;
  if (loadingExisting) return null;

  const selectedCount = [...entries.values()].filter((e) => e.acceptedAt).length;

  return (
    <div style={{ padding: "18px 34px 30px", maxWidth: 780 }}>
      <Link to="/teams" style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)" }}>
        ← Teams &amp; Competitions
      </Link>
      <h2 style={{ fontSize: 24, letterSpacing: "-0.01em", marginTop: 8 }}>{name || "New Competition"}</h2>

      <Stepper step={step} />

      {step === 1 && (
        <div className="card" style={{ marginTop: 20, maxWidth: 640, border: "1px solid var(--hairline)", borderRadius: 16, padding: "26px 28px", display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <FieldLabel>Competition name</FieldLabel>
            <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%" }} />
          </div>
          <div>
            <FieldLabel>Venue</FieldLabel>
            <input value={venueName} onChange={(e) => setVenueName(e.target.value)} style={{ width: "100%" }} />
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <FieldLabel>Date</FieldLabel>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div style={{ flex: 1 }}>
              <FieldLabel>Address (optional)</FieldLabel>
              <input value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)} placeholder="Add a street address…" style={{ width: "100%" }} />
            </div>
          </div>
          <div>
            <FieldLabel>Notes &amp; details (optional)</FieldLabel>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Entry fee, dress code, parking, load-in time…"
              style={{ width: "100%", fontFamily: "inherit", fontSize: 13.5, padding: "12px 15px", borderRadius: 11, border: "1px solid var(--hairline)", resize: "vertical" }}
            />
            <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 6, lineHeight: 1.5 }}>
              Shows on the competition's own summary page for instructors &amp; parents.
            </p>
          </div>
          <p style={{ fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.5, borderTop: "1px solid var(--hairline)", paddingTop: 14 }}>
            This is the event itself — who's competing gets decided on the next step, from the studio's existing Comp Teams.
          </p>
        </div>
      )}

      {step === 2 && (
        <div style={{ marginTop: 20, maxWidth: 780 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <Eyebrow>Which Comp Teams are competing at this event</Eyebrow>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600 }}>
                {selectedCount} of {compTeams?.length ?? 0} selected
              </span>
              <button type="button" onClick={() => selectAll(true)} style={linkButtonStyle}>
                Select all
              </button>
              <button type="button" onClick={() => selectAll(false)} style={linkButtonStyle}>
                Deselect all
              </button>
            </div>
          </div>

          <div className="card" style={{ marginTop: 10, border: "1px solid var(--hairline)", borderRadius: 16, padding: "2px 22px" }}>
            {compTeams === null ? (
              <p style={{ padding: "14px 0", color: "var(--ink-2)", fontSize: 13 }}>Loading…</p>
            ) : compTeams.length === 0 ? (
              <p style={{ padding: "14px 0", color: "var(--ink-2)", fontSize: 13 }}>No Comp Teams exist yet — create one from Teams &amp; Competitions first.</p>
            ) : (
              compTeams.map((t, i) => {
                const entry = entries.get(t.id);
                const isPending = !!entry && !entry.acceptedAt;
                const checked = !!entry && !!entry.acceptedAt;
                return (
                  <div
                    key={t.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      padding: "14px 6px",
                      borderTop: i === 0 ? "none" : "1px solid var(--hairline)",
                      ...(isPending ? { background: "var(--signal-tint)", margin: "0 -22px", padding: "14px 22px", borderRadius: 10, borderTop: "none" } : {}),
                    }}
                  >
                    {isPending ? (
                      <div style={{ width: 20, height: 20, flexShrink: 0 }} />
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleEntry(t.id)}
                        disabled={togglingId === t.id}
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 6,
                          border: checked ? "none" : "1.5px solid var(--hairline)",
                          background: checked ? "var(--band)" : "transparent",
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: togglingId === t.id ? "default" : "pointer",
                          opacity: togglingId === t.id ? 0.6 : 1,
                        }}
                      >
                        {checked && (
                          <svg style={{ width: 12, height: 12, color: "var(--signal)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                        )}
                      </button>
                    )}
                    <Avatar name={t.name} size={32} tone={isPending ? "band" : "default"} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 14.5, fontWeight: 700 }}>{t.name}</span>
                        <Chip label={TYPE_LABEL[t.comp_team_type]} />
                        {t.isNewToday && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--signal-deep)" }}>New</span>}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                        {[`choreographed by ${t.choreographerName ?? "not yet assigned"}`, `${t.dancerCount} ${t.dancerCount === 1 ? "dancer" : "dancers"}`].join(" · ")}
                      </div>
                    </div>
                    {isPending ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <span style={{ fontSize: 11, color: "var(--signal-ink)", fontWeight: 600 }}>Proposed by {entry.proposedByName ?? "an instructor"}</span>
                        <SecondaryButton onClick={() => declineProposal(t.id)}>Decline</SecondaryButton>
                        <PrimaryButton onClick={() => acceptProposal(t.id)}>Accept</PrimaryButton>
                      </div>
                    ) : (
                      !checked && <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>not currently entered</span>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <p style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 14, lineHeight: 1.5 }}>
            This list is every Comp Team the studio has created so far. Nothing here creates a new Comp Team — that happens on its own, from Teams &amp; Competitions.
          </p>
        </div>
      )}

      {step >= 3 && (
        <div className="card" style={{ marginTop: 20, maxWidth: 640, border: "1px solid var(--hairline)", borderRadius: 16, padding: "26px 28px" }}>
          <p className="font-display" style={{ fontSize: 18 }}>{step === 3 ? "Call times" : "Review & publish"}</p>
          <p style={{ color: "var(--ink-3)", marginTop: 6 }}>Not built yet — see BUILD_PLAN.md. Details and Entries are saved and real.</p>
        </div>
      )}

      {error && <p style={{ color: "var(--busy)", marginTop: 16, fontSize: 13 }}>{error}</p>}

      <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end", gap: 10 }}>
        {step === 1 ? (
          <SecondaryButton onClick={() => navigate("/teams")}>Save &amp; exit</SecondaryButton>
        ) : (
          <SecondaryButton onClick={() => setStep((step - 1) as Step)}>Back</SecondaryButton>
        )}
        {step === 1 && (
          <PrimaryButton onClick={saveDetails} disabled={!canContinue || saving}>
            {saving ? "Saving…" : "Continue to Entries"}
          </PrimaryButton>
        )}
        {step === 2 && <PrimaryButton onClick={() => setStep(3)}>Continue to Call times</PrimaryButton>}
      </div>
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const labels = ["Details", "Entries", "Call times", "Review & publish"];
  return (
    <div style={{ marginTop: 20, display: "flex", alignItems: "center", maxWidth: 760 }}>
      {labels.map((label, i) => {
        const num = i + 1;
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

const linkButtonStyle: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 700,
  color: "var(--signal-deep)",
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: 0,
};
