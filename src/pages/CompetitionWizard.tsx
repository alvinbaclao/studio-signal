import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { supabase, callApp } from "../lib/supabase";
import { useAuth } from "../lib/AuthProvider";
import { useStudio } from "../lib/useStudio";
import { zonedDateTimeToUTC, formatTimeInZone } from "../lib/format";
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
  callTime: string | null;
}

interface ConflictInfo {
  eventId: string;
  title: string | null;
  destinationName: string;
  startsAt: string;
  endsAt: string;
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
  const studio = useStudio();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Step lives in the URL (?step=), not just component state — "Move that
  // event" in the Call Times conflict panel navigates away to /add-event
  // and back (navigate(-1)), which remounts this component fresh. Plain
  // useState would always reset to step 2 on return, losing the Director's
  // place on step 3. See docs/DEFICIENCIES.md #35.
  const stepFromUrl = Number(searchParams.get("step"));
  const initialStep: Step = stepFromUrl >= 1 && stepFromUrl <= 4 ? (stepFromUrl as Step) : routeId ? 2 : 1;
  const [step, setStepState] = useState<Step>(initialStep);
  function setStep(s: Step) {
    setStepState(s);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("step", String(s));
      return next;
    }, { replace: true });
  }
  const [competitionId, setCompetitionId] = useState<string | null>(routeId ?? null);
  const [loadingExisting, setLoadingExisting] = useState(!!routeId);

  const [name, setName] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [compTeams, setCompTeams] = useState<CompTeamRow[] | null>(null);
  const [entries, setEntries] = useState<Map<string, EntryState>>(new Map());
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [staggerStart, setStaggerStart] = useState("07:00");
  const [staggerGap, setStaggerGap] = useState(15);
  const [staggering, setStaggering] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTime, setEditTime] = useState("");
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const [savingTime, setSavingTime] = useState(false);

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
        setPublishedAt(data.published_at);
        setCompetitionId(data.id);
        setLoadingExisting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [routeId, person]);

  useEffect(() => {
    if (!person || !competitionId) return;
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
        supabase.from("competition_entry").select("id, comp_team_id, proposed_by, accepted_at, call_time").eq("competition_id", competitionId!),
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
            { entryId: e.id, proposedBy: e.proposed_by, proposedByName: e.proposed_by ? nameById.get(e.proposed_by) ?? null : null, acceptedAt: e.accepted_at, callTime: e.call_time },
          ])
        )
      );
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [person, competitionId]);

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
      // Not setStep(2) here: navigate() and setSearchParams() (which
      // setStep calls) both act on location in the same tick, and
      // setSearchParams reads the *current* (pre-navigate) location —
      // it would win and clobber the pathname change, leaving the URL on
      // /competitions/new?step=2 instead of the new /competition/:id/manage.
      // One navigate() carrying both the new path and the step avoids that.
      navigate(`/competition/${data.id}/manage?step=2`, { replace: true });
      setStepState(2);
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
        setEntries((prev) => new Map(prev).set(compTeamId, { entryId: data.id, proposedBy: null, proposedByName: null, acceptedAt: new Date().toISOString(), callTime: null }));
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
          for (const row of data) next.set(row.comp_team_id, { entryId: row.id, proposedBy: null, proposedByName: null, acceptedAt, callTime: null });
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

  // Cast-conflict check for a candidate call time: does anyone in this Comp
  // Team's cast already have something else on their calendar right then?
  // No exclusion constraint covers this (unlike the space-double-booking
  // one AddEvent/RequestReviewModal already lean on) — cast membership
  // spans team_member (their own class Team) and comp_team_cast (any other
  // Comp Team they're also on), neither of which `event` references by
  // person, only by team_id/comp_team_id — so this is a real query, not a
  // constraint violation to catch.
  async function findConflict(compTeamId: string, candidateISO: string): Promise<ConflictInfo | null> {
    const { data: castRows } = await supabase.from("comp_team_cast").select("person_id").eq("comp_team_id", compTeamId);
    const personIds = (castRows ?? []).map((r) => r.person_id);
    if (personIds.length === 0) return null;

    const [{ data: teamMemberRows }, { data: otherCastRows }] = await Promise.all([
      supabase.from("team_member").select("team_id").in("person_id", personIds),
      supabase.from("comp_team_cast").select("comp_team_id").in("person_id", personIds).neq("comp_team_id", compTeamId),
    ]);
    const teamIds = [...new Set((teamMemberRows ?? []).map((r) => r.team_id))];
    const otherCompTeamIds = [...new Set((otherCastRows ?? []).map((r) => r.comp_team_id))];
    if (teamIds.length === 0 && otherCompTeamIds.length === 0) return null;

    const orParts: string[] = [];
    if (teamIds.length > 0) orParts.push(`team_id.in.(${teamIds.join(",")})`);
    if (otherCompTeamIds.length > 0) orParts.push(`comp_team_id.in.(${otherCompTeamIds.join(",")})`);

    const { data: eventRows } = await supabase
      .from("event")
      .select("id, title, team_id, comp_team_id, starts_at, ends_at")
      .is("cancelled_at", null)
      .lte("starts_at", candidateISO)
      .gt("ends_at", candidateISO)
      .or(orParts.join(","))
      .limit(1);
    if (!eventRows || eventRows.length === 0) return null;

    const ev = eventRows[0];
    let destinationName = "elsewhere in the studio";
    if (ev.team_id) {
      const { data } = await supabase.from("team").select("name").eq("id", ev.team_id).single();
      if (data) destinationName = data.name;
    } else if (ev.comp_team_id) {
      const { data } = await supabase.from("comp_team").select("name").eq("id", ev.comp_team_id).single();
      if (data) destinationName = data.name;
    }
    return { eventId: ev.id, title: ev.title, destinationName, startsAt: ev.starts_at, endsAt: ev.ends_at };
  }

  function candidateISO(hm: string): string | null {
    if (!studio || !date || !hm) return null;
    return zonedDateTimeToUTC(date, hm, studio.timezone).toISOString();
  }

  async function startEditing(compTeamId: string) {
    setEditingId(compTeamId);
    setConflict(null);
    const existing = entries.get(compTeamId);
    if (existing?.callTime && studio) {
      const mins = new Date(existing.callTime);
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: studio.timezone, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(mins);
      const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
      setEditTime(`${map.hour}:${map.minute}`);
    } else {
      setEditTime("");
    }
  }

  async function saveCallTime(compTeamId: string, ignoreConflict = false) {
    const existing = entries.get(compTeamId);
    const iso = candidateISO(editTime);
    if (!existing || !iso) return;
    setSavingTime(true);
    if (!ignoreConflict) {
      const found = await findConflict(compTeamId, iso);
      if (found) {
        setConflict(found);
        setSavingTime(false);
        return;
      }
    }
    const { error: updErr } = await callApp("set_competition_entry_call_time", { p_entry_id: existing.entryId, p_call_time: iso });
    setSavingTime(false);
    if (!updErr) {
      setEntries((prev) => new Map(prev).set(compTeamId, { ...existing, callTime: iso }));
      setEditingId(null);
      setConflict(null);
    }
  }

  const TYPE_ORDER: CompTeamType[] = ["solo", "duo", "trio", "small_group", "large_group", "production"];

  async function applyStagger() {
    if (!person || !compTeams || !studio || !date) return;
    const unset = compTeams
      .filter((t) => {
        const e = entries.get(t.id);
        return e?.acceptedAt && !e.callTime;
      })
      .sort((a, b) => TYPE_ORDER.indexOf(a.comp_team_type) - TYPE_ORDER.indexOf(b.comp_team_type) || a.name.localeCompare(b.name));
    if (unset.length === 0) return;
    setStaggering(true);
    const [startH, startM] = staggerStart.split(":").map(Number);
    const updates = unset.map((t, i) => {
      const totalMin = startH * 60 + startM + i * staggerGap;
      const hm = `${String(Math.floor(totalMin / 60) % 24).padStart(2, "0")}:${String(totalMin % 60).padStart(2, "0")}`;
      return { compTeamId: t.id, entryId: entries.get(t.id)!.entryId, iso: zonedDateTimeToUTC(date, hm, studio.timezone).toISOString() };
    });
    await Promise.all(updates.map((u) => callApp("set_competition_entry_call_time", { p_entry_id: u.entryId, p_call_time: u.iso })));
    setEntries((prev) => {
      const next = new Map(prev);
      for (const u of updates) {
        const e = next.get(u.compTeamId);
        if (e) next.set(u.compTeamId, { ...e, callTime: u.iso });
      }
      return next;
    });
    setStaggering(false);
  }

  async function publish() {
    if (!competitionId || publishing) return;
    setPublishing(true);
    setError(null);
    const { error: pubErr } = await callApp("publish_competition", { p_competition_id: competitionId });
    setPublishing(false);
    if (pubErr) {
      setError("Something went wrong publishing — try again.");
      return;
    }
    setPublishedAt(new Date().toISOString());
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

      {step === 3 && (() => {
        const enteredTeams = compTeams?.filter((t) => entries.get(t.id)?.acceptedAt) ?? [];
        return (
          <div style={{ marginTop: 20, maxWidth: 1000 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 12, background: "var(--sand)", marginBottom: 14 }}>
              <span style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.5 }}>
                Not every host publishes a schedule this early — it's fine to leave an entry as "Not set yet." Nothing here blocks publishing, and this step is exactly what you'd reopen later, from Manage Dance Competition, once real times arrive.
              </span>
            </div>

            <div className="card" style={{ padding: "18px 22px", display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
              <Eyebrow>Bulk stagger</Eyebrow>
              <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13 }}>
                <span style={{ color: "var(--ink-3)" }}>Start</span>
                <input type="time" value={staggerStart} onChange={(e) => setStaggerStart(e.target.value)} style={{ fontWeight: 700 }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13 }}>
                <span style={{ color: "var(--ink-3)" }}>Gap between Comp Teams</span>
                <input
                  type="number"
                  min={0}
                  value={staggerGap}
                  onChange={(e) => setStaggerGap(Number(e.target.value) || 0)}
                  style={{ width: 60, fontWeight: 700 }}
                />
                <span style={{ color: "var(--ink-3)" }}>min</span>
              </div>
              <div style={{ flex: 1 }} />
              <SecondaryButton onClick={applyStagger} disabled={staggering}>
                {staggering ? "Applying…" : "Apply to entries without a time →"}
              </SecondaryButton>
            </div>

            <div className="card" style={{ marginTop: 16, border: "1px solid var(--hairline)", borderRadius: 16, padding: "2px 22px" }}>
              {enteredTeams.length === 0 ? (
                <p style={{ padding: "14px 0", color: "var(--ink-2)", fontSize: 13 }}>No entries yet — go back to Entries and select at least one Comp Team.</p>
              ) : (
                enteredTeams.map((t, i) => {
                  const entry = entries.get(t.id)!;
                  const isEditing = editingId === t.id;
                  return (
                    <div key={t.id} style={{ borderTop: i === 0 ? "none" : "1px solid var(--hairline)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 4px" }}>
                        <Avatar name={t.name} size={32} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700 }}>
                            {t.name} · {TYPE_LABEL[t.comp_team_type]}
                          </div>
                          <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{t.dancerCount} {t.dancerCount === 1 ? "dancer" : "dancers"}</div>
                        </div>
                        {entry.callTime ? (
                          <button type="button" onClick={() => (isEditing ? setEditingId(null) : startEditing(t.id))} style={timePillStyle(false)}>
                            {studio ? `${formatTimeInZone(entry.callTime, studio.timezone).main}${formatTimeInZone(entry.callTime, studio.timezone).meridiem.toUpperCase()}` : "…"}
                          </button>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={timePillStyle(true)}>Not set yet</span>
                            <button type="button" onClick={() => (isEditing ? setEditingId(null) : startEditing(t.id))} style={linkButtonStyle}>
                              {isEditing ? "Cancel" : "Set a time"}
                            </button>
                          </div>
                        )}
                      </div>

                      {isEditing && (
                        <div style={{ margin: "0 4px 16px", padding: "16px 18px", background: "var(--sand)", borderRadius: 12, display: "flex", gap: 20, flexWrap: "wrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <input type="time" value={editTime} onChange={(e) => setEditTime(e.target.value)} />
                            <PrimaryButton onClick={() => saveCallTime(t.id)} disabled={!editTime || savingTime}>
                              {savingTime ? "Saving…" : "Save"}
                            </PrimaryButton>
                          </div>

                          {editTime && studio && (
                            <HeroPreview
                              compTeamName={t.name}
                              competitionName={name}
                              date={date}
                              venueName={venueName}
                              dancerCount={t.dancerCount}
                              callTimeHM={editTime}
                              timezone={studio.timezone}
                            />
                          )}

                          {conflict && (
                            <div style={{ width: "100%", background: "var(--busy-tint)", border: "1px solid var(--busy-border)", borderRadius: 13, padding: "14px 16px" }}>
                              <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--busy)" }}>Conflicts with an existing event</div>
                              <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 5, lineHeight: 1.5 }}>
                                {conflict.title ?? "An event"} ({conflict.destinationName}) is already scheduled then — someone in this cast is booked elsewhere at that time.
                              </div>
                              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                                <Link to={`/add-event?movesEvent=${conflict.eventId}`} style={{ ...ghostBtnStyle }}>
                                  Move that event
                                </Link>
                                <button type="button" onClick={() => saveCallTime(t.id, true)} style={ghostBtnStyle} disabled={savingTime}>
                                  Ignore &amp; set anyway
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <p style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 12, lineHeight: 1.5 }}>
              Any call time can still be changed after staggering — this just gets you most of the way there instead of typing each one by hand. Most studios come back to this exact screen a few weeks before the event, once the host confirms a real schedule.
            </p>
          </div>
        );
      })()}

      {step === 4 && (() => {
        const enteredTeams = compTeams?.filter((t) => entries.get(t.id)?.acceptedAt) ?? [];
        if (publishedAt) {
          return (
            <div className="card" style={{ marginTop: 20, maxWidth: 640, border: "1px solid var(--hairline)", borderRadius: 16, padding: "26px 28px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--ok-tint)", color: "var(--ok)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg style={{ width: 16, height: 16 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
                <p className="font-display" style={{ fontSize: 18 }}>Published</p>
              </div>
              <p style={{ color: "var(--ink-2)", marginTop: 10, fontSize: 13, lineHeight: 1.5 }}>
                {name} is live — every entered Comp Team's Home hero now shows it, a message went out to each Comp Team's channel, and a real call-time event exists for every entry that has one set. Reopen Call Times from here any time to add or change one.
              </p>
              <Link to={`/competition/${competitionId}`} style={{ ...ghostBtnStyle, marginTop: 16, display: "inline-flex" }}>
                View Competition Overview →
              </Link>
            </div>
          );
        }
        return (
          <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 1.15fr", gap: 22, maxWidth: 1160 }}>
            <div>
              <Eyebrow>{name}</Eyebrow>
              <div className="card" style={{ marginTop: 9, border: "1px solid var(--hairline)", borderRadius: 16, padding: "20px 22px" }}>
                <h3 style={{ fontSize: 17 }}>
                  {venueName || "Venue not set"} · {date ? new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}
                </h3>
                <div style={{ marginTop: 14 }}>
                  <KV label="Comp Teams entered">{enteredTeams.length}</KV>
                  {enteredTeams.map((t) => {
                    const ct = entries.get(t.id)?.callTime;
                    return (
                      <KV key={t.id} label={t.name}>
                        {ct && studio ? `${formatTimeInZone(ct, studio.timezone).main}${formatTimeInZone(ct, studio.timezone).meridiem.toUpperCase()}` : "Not set yet"}
                      </KV>
                    );
                  })}
                </div>
              </div>
            </div>

            <div>
              <Eyebrow>What happens when you publish</Eyebrow>
              <div className="card" style={{ marginTop: 9, border: "1px solid var(--hairline)", borderRadius: 16, padding: "6px 20px" }}>
                <UpdateRow>{name} becomes visible to every confirmed studio member — nothing above is visible to anyone until you publish.</UpdateRow>
                <UpdateRow>Each entered Comp Team's own Home hero starts showing "Competing at {name}" — call time shows once one's set, "TBD" until then.</UpdateRow>
                <UpdateRow>A real call-time event is created for every entry that already has a time — the rest wait until you set one, here or later.</UpdateRow>
                <UpdateRow>A message posts into each entered Comp Team's own channel announcing the entry and its call time (or that one isn't set yet).</UpdateRow>
              </div>
              <div style={{ marginTop: 12, padding: "13px 16px", borderRadius: 12, background: "var(--signal-tint)", fontSize: 12, color: "var(--signal-ink)", lineHeight: 1.55 }}>
                Coming back to update call times later, once the host sends a real schedule, means reopening this same competition — not creating anything new.
              </div>
            </div>
          </div>
        );
      })()}

      {error && <p style={{ color: "var(--busy)", marginTop: 16, fontSize: 13 }}>{error}</p>}

      <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10 }}>
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
        {step === 3 && <PrimaryButton onClick={() => setStep(4)}>Continue to Review &amp; publish</PrimaryButton>}
        {step === 4 && !publishedAt && (
          <PrimaryButton onClick={publish} disabled={publishing}>
            {publishing ? "Publishing…" : "Publish"}
          </PrimaryButton>
        )}
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

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, borderTop: "1px solid var(--hairline)", paddingTop: 9, marginTop: 9 }}>
      <span style={{ color: "var(--ink-3)" }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: "right" }}>{children}</span>
    </div>
  );
}

function UpdateRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "11px 0", borderTop: "1px solid var(--hairline)" }}>
      <span style={{ width: 18, height: 18, borderRadius: "50%", background: "var(--ok-tint)", color: "var(--ok)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1, fontSize: 11 }}>
        ✓
      </span>
      <span style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>{children}</span>
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

const ghostBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "8px 14px",
  borderRadius: 9,
  background: "var(--surface)",
  color: "var(--ink)",
  fontSize: 11.5,
  fontWeight: 700,
  border: "1px solid var(--hairline)",
  cursor: "pointer",
  textDecoration: "none",
};

function timePillStyle(tbd: boolean): React.CSSProperties {
  return {
    fontFamily: "var(--font-display)",
    fontWeight: 700,
    fontSize: 13.5,
    borderRadius: 9,
    padding: "8px 13px",
    minWidth: 90,
    textAlign: "center",
    border: tbd ? "1.5px dashed var(--hairline)" : "none",
    background: tbd ? "transparent" : "var(--sand)",
    color: tbd ? "var(--ink-3)" : "var(--ink)",
    cursor: tbd ? "default" : "pointer",
  };
}

// A preview of what this Comp Team's own Home hero will show once this
// call time is set — same info hierarchy CompHome.dc.html's real hero
// uses (call time, venue, days-to-go), minus the photo/gradient treatment
// (no Storage bucket exists for this studio, same root gap as
// Deficiency #2 — dropped rather than faked, matching every other screen
// that's hit this). Task 24 "activates" the real version of this on
// CompTeamHome itself; this is a live preview of the same numbers while
// still inside the wizard, not that page.
function HeroPreview({
  compTeamName,
  competitionName,
  date,
  venueName,
  dancerCount,
  callTimeHM,
  timezone,
}: {
  compTeamName: string;
  competitionName: string;
  date: string;
  venueName: string;
  dancerCount: number;
  callTimeHM: string;
  timezone: string;
}) {
  const callTimeLabel = (() => {
    try {
      const iso = zonedDateTimeToUTC(date, callTimeHM, timezone).toISOString();
      const { main, meridiem } = formatTimeInZone(iso, timezone);
      return `${main}${meridiem.toUpperCase()}`;
    } catch {
      return "—";
    }
  })();
  const dateLabel = date ? new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";

  return (
    <div style={{ borderRadius: 14, overflow: "hidden", minWidth: 320, flex: 1 }}>
      <div style={{ background: "var(--band)", color: "var(--band-ink)", padding: "14px 16px" }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 15 }}>{compTeamName}</div>
        <div style={{ fontSize: 11, color: "var(--band-ink-2)", marginTop: 2 }}>
          Entered in {competitionName || "this competition"} · {dateLabel}
        </div>
      </div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--hairline)", borderTop: "none", padding: "12px 16px", display: "flex", gap: 16 }}>
        <div>
          <Eyebrow>Call time</Eyebrow>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 15, marginTop: 3 }}>{callTimeLabel}</div>
        </div>
        <div style={{ width: 1, background: "var(--hairline)" }} />
        <div>
          <Eyebrow>Venue</Eyebrow>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 3 }}>{venueName || "Not set yet"}</div>
        </div>
        <div style={{ flex: 1, textAlign: "right" }}>
          <Eyebrow>Affects</Eyebrow>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 3 }}>
            {dancerCount} {dancerCount === 1 ? "dancer" : "dancers"}
          </div>
        </div>
      </div>
    </div>
  );
}
