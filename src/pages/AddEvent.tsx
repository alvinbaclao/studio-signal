import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase, callApp } from "../lib/supabase";
import { useAuth, hasRole } from "../lib/AuthProvider";
import { useStudio } from "../lib/useStudio";
import { zonedDateTimeToUTC, zonedDateKey, zonedMinutesOfDay } from "../lib/format";
import { friendlyPostgrestError } from "../lib/errors";
import { Sheet } from "../components/Sheet";
import { PrimaryButton } from "../components/PrimaryButton";
import type { Database } from "../lib/database.types";

type EventType = Database["public"]["Enums"]["event_type"];

type DestKind = "team" | "comp_team" | "studio";
interface DestOption {
  kind: DestKind;
  id: string | null; // null for the studio-wide option
  name: string;
  postable: boolean;
  sublabel: string;
}

// The four picker "categories" the artboard shows — narrower than the four
// real event_type enum values. Class/Rehearsal maps to 'class' (Team
// destination) or 'rehearsal' (Comp Team destination); Studio time request,
// Dancer meeting and Other all map to the generic 'booking' type, which the
// live event_owner_matches_type probe (Task 12) confirmed tolerates any
// owner shape including none — see docs/DEFICIENCIES.md for why "Call time"
// isn't offered here (needs competition_entry, out of this task's Touches).
type TypeChoice = "class_rehearsal" | "booking" | "meeting" | "other";

const TYPE_META: Record<TypeChoice, { label: string; description: (isDirector: boolean) => string }> = {
  class_rehearsal: { label: "Class / Rehearsal", description: () => "Regular practice time" },
  booking: {
    label: "Studio time request",
    description: (isDirector) => (isDirector ? "Books a room" : "Books a room · sent to the Director for approval"),
  },
  meeting: { label: "Dancer meeting", description: () => "A sit-down, not a class" },
  other: { label: "Other", description: () => "Not one of the above? Name it yourself." },
};

type SpaceStatus = "ok" | "wait" | "busy";

// Ports design-reference/AddEvent.dc.html, EventScopePicker.dc.html,
// EventTypePicker.dc.html and LocationPicker.dc.html — see BUILD_PLAN.md
// Task 12. One screen for both a direct event (Director) and a booking
// request (instructor) — the event type never changes which table gets
// written to, only who's signed in does.
export function AddEvent() {
  const { person } = useAuth();
  const studio = useStudio();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isDirector = hasRole(person, "director");
  // Set when this screen was opened to request moving an existing event
  // (BUILD_PLAN Task 13's move path). First real entry point: the Call
  // Times step's conflict panel (Task 23) links here for a Director. The
  // data-layer support was already real for the instructor/approval path
  // (RequestReviewModal.approve() has always updated the existing event
  // rather than inserting) — this screen now completes it symmetrically
  // for the Director-direct path: pre-fills the event's current details
  // below, and on submit only its starts_at/ends_at/studio_space_id
  // change, matching approve()'s own conservative "move changes when and
  // where, not what or whose" behavior exactly.
  const movesEventId = searchParams.get("movesEvent");
  const [moveSource, setMoveSource] = useState<{
    title: string | null;
    event_type: EventType;
    team_id: string | null;
    comp_team_id: string | null;
    studio_wide: boolean;
    studio_space_id: string | null;
    starts_at: string;
    ends_at: string;
    notes: string | null;
  } | null>(null);
  const [movePrefilled, setMovePrefilled] = useState(false);

  const [destOptions, setDestOptions] = useState<{ teams: DestOption[]; compTeams: DestOption[]; studio: DestOption } | null>(null);
  const [destination, setDestination] = useState<DestOption | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  const [typeChoice, setTypeChoice] = useState<TypeChoice | null>(null);
  const [otherLabel, setOtherLabel] = useState("");
  const [title, setTitle] = useState("");
  const [dateYMD, setDateYMD] = useState("");
  const [startHM, setStartHM] = useState("");
  const [endHM, setEndHM] = useState("");
  const [notes, setNotes] = useState("");
  const [repeatsWeekly, setRepeatsWeekly] = useState(false);
  const [notifyOn, setNotifyOn] = useState(true);

  const [spaces, setSpaces] = useState<{ id: string; name: string; floor_type: string | null }[] | null>(null);
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [spaceStatuses, setSpaceStatuses] = useState<Map<string, SpaceStatus>>(new Map());

  const [activeSheet, setActiveSheet] = useState<"scope" | "type" | "location" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Default the date field to today, in the studio's own timezone.
  useEffect(() => {
    if (!studio || dateYMD) return;
    setDateYMD(zonedDateKey(new Date().toISOString(), studio.timezone));
  }, [studio, dateYMD]);

  useEffect(() => {
    if (!person) return;
    const studioId = person.studio_id;
    let cancelled = false;
    async function load() {
      // teams_i_can_see()/comp_teams_i_can_see() are scoped to "teams this
      // person is personally involved with" — empty for a Director, who
      // isn't a team_member/comp_team_cast row anywhere. A Director's
      // visibility is total via plain table RLS instead, confirmed live
      // (Task 12 probe) — so Directors query the tables directly rather
      // than going through the narrower RPCs everyone else uses.
      let teamRows: { id: string; name: string }[] = [];
      let compTeamRows: { id: string; name: string }[] = [];
      if (isDirector) {
        const [{ data: t }, { data: c }] = await Promise.all([
          supabase.from("team").select("id, name").eq("studio_id", studioId).eq("is_active", true),
          supabase.from("comp_team").select("id, name").eq("studio_id", studioId).eq("is_active", true),
        ]);
        teamRows = t ?? [];
        compTeamRows = c ?? [];
      } else {
        const [{ data: teamIds }, { data: compTeamIds }] = await Promise.all([
          callApp<string[]>("teams_i_can_see"),
          callApp<string[]>("comp_teams_i_can_see"),
        ]);
        const [{ data: t }, { data: c }] = await Promise.all([
          (teamIds ?? []).length > 0
            ? supabase.from("team").select("id, name").in("id", teamIds!)
            : Promise.resolve({ data: [] as { id: string; name: string }[] }),
          (compTeamIds ?? []).length > 0
            ? supabase.from("comp_team").select("id, name").in("id", compTeamIds!)
            : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        ]);
        teamRows = t ?? [];
        compTeamRows = c ?? [];
      }
      const [{ data: teachIds }, { data: choreographIds }] = await Promise.all([
        callApp<string[]>("teams_i_teach"),
        callApp<string[]>("comp_teams_i_choreograph"),
      ]);
      const teachSet = new Set(teachIds ?? []);
      const choreographSet = new Set(choreographIds ?? []);
      if (cancelled) return;

      const teams: DestOption[] = (teamRows ?? []).map((t) => ({
        kind: "team",
        id: t.id,
        name: t.name,
        postable: isDirector || teachSet.has(t.id),
        sublabel: teachSet.has(t.id) ? "You teach this team" : isDirector ? "Studio team" : "Not one of your assignments",
      }));
      const compTeams: DestOption[] = (compTeamRows ?? []).map((c) => ({
        kind: "comp_team",
        id: c.id,
        name: c.name,
        postable: isDirector || choreographSet.has(c.id),
        sublabel: choreographSet.has(c.id)
          ? "You choreograph this dance"
          : isDirector
            ? "Studio dance"
            : "Not one of your assignments",
      }));
      const studioOpt: DestOption = {
        kind: "studio",
        id: null,
        name: "Studio · whole-studio post",
        postable: isDirector,
        sublabel: "Director only",
      };

      setDestOptions({ teams, compTeams, studio: studioOpt });
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [person, isDirector]);

  // Pre-fill the destination from the Schedule screen that linked here
  // (?team=, ?compTeam=, or ?studioWide=1), once options have loaded.
  useEffect(() => {
    if (!destOptions || prefilled) return;
    setPrefilled(true);
    const teamParam = searchParams.get("team");
    const compTeamParam = searchParams.get("compTeam");
    const studioWideParam = searchParams.get("studioWide");
    if (teamParam) {
      const match = destOptions.teams.find((t) => t.id === teamParam && t.postable);
      if (match) setDestination(match);
    } else if (compTeamParam) {
      const match = destOptions.compTeams.find((c) => c.id === compTeamParam && c.postable);
      if (match) setDestination(match);
    } else if (studioWideParam && destOptions.studio.postable) {
      setDestination(destOptions.studio);
    }
  }, [destOptions, prefilled, searchParams]);

  // Load the event being moved, if any.
  useEffect(() => {
    if (!movesEventId || !person) return;
    let cancelled = false;
    supabase
      .from("event")
      .select("title, event_type, team_id, comp_team_id, studio_wide, studio_space_id, starts_at, ends_at, notes")
      .eq("id", movesEventId)
      .single()
      .then(({ data }) => {
        if (!cancelled && data) setMoveSource(data);
      });
    return () => {
      cancelled = true;
    };
  }, [movesEventId, person]);

  // Pre-fill every field from the event being moved, once destOptions and
  // studio (needed for the UTC-to-zoned-time conversion) are both ready.
  // Only display fields — handleSubmit's move branch only ever writes
  // starts_at/ends_at/studio_space_id back, regardless of what's shown here.
  useEffect(() => {
    if (!moveSource || !destOptions || !studio || movePrefilled) return;
    setMovePrefilled(true);
    setTitle(moveSource.title ?? "");
    setTypeChoice(moveSource.event_type === "class" || moveSource.event_type === "rehearsal" ? "class_rehearsal" : "booking");
    setNotes(moveSource.notes ?? "");
    setDateYMD(zonedDateKey(moveSource.starts_at, studio.timezone));
    setStartHM(hmInZone(moveSource.starts_at, studio.timezone));
    setEndHM(hmInZone(moveSource.ends_at, studio.timezone));
    if (moveSource.studio_space_id) setSpaceId(moveSource.studio_space_id);
    if (moveSource.studio_wide) setDestination(destOptions.studio);
    else if (moveSource.team_id) {
      const match = destOptions.teams.find((t) => t.id === moveSource.team_id);
      if (match) setDestination(match);
    } else if (moveSource.comp_team_id) {
      const match = destOptions.compTeams.find((c) => c.id === moveSource.comp_team_id);
      if (match) setDestination(match);
    }
  }, [moveSource, destOptions, studio, movePrefilled]);

  // Load the studio's spaces once.
  useEffect(() => {
    if (!person) return;
    supabase
      .from("studio_space")
      .select("id, name, floor_type")
      .eq("studio_id", person.studio_id)
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => setSpaces(data ?? []));
  }, [person]);

  const canCreateDirectly = isDirector;
  const actionLabel = canCreateDirectly ? "Create" : "Send request";

  const typeOptions = useMemo<TypeChoice[]>(() => {
    if (!destination) return [];
    if (destination.kind === "studio") return ["booking", "meeting", "other"];
    return ["class_rehearsal", "booking", "meeting", "other"];
  }, [destination]);

  function pickType(choice: TypeChoice) {
    setTypeChoice(choice);
    if (!title.trim()) {
      if (choice === "meeting") setTitle("Dancer meeting");
      else if (choice === "booking") setTitle("Studio time request");
      else if (choice === "other" && otherLabel.trim()) setTitle(otherLabel.trim());
    }
  }

  // Advisory space status (--ok/--wait/--busy) for the chosen date/time —
  // the space picker's one deliberate exception to "never reuse that triad
  // outside itself," per PROJECT_KNOWLEDGE.md.
  useEffect(() => {
    if (activeSheet !== "location" || !spaces || spaces.length === 0 || !dateYMD || !startHM || !endHM || !studio) {
      return;
    }
    const startsAt = zonedDateTimeToUTC(dateYMD, startHM, studio.timezone).toISOString();
    const endsAt = zonedDateTimeToUTC(dateYMD, endHM, studio.timezone).toISOString();
    const spaceIds = spaces.map((s) => s.id);
    let cancelled = false;
    Promise.all([
      supabase
        .from("event")
        .select("studio_space_id")
        .in("studio_space_id", spaceIds)
        .is("cancelled_at", null)
        .lt("starts_at", endsAt)
        .gt("ends_at", startsAt),
      supabase
        .from("booking_request")
        .select("preferred_space_id")
        .in("preferred_space_id", spaceIds)
        .eq("status", "pending")
        .lt("starts_at", endsAt)
        .gt("ends_at", startsAt),
    ]).then(([{ data: busyRows }, { data: pendingRows }]) => {
      if (cancelled) return;
      const busy = new Set((busyRows ?? []).map((r) => r.studio_space_id).filter((v): v is string => !!v));
      const pending = new Set((pendingRows ?? []).map((r) => r.preferred_space_id).filter((v): v is string => !!v));
      const next = new Map<string, SpaceStatus>();
      for (const s of spaces) next.set(s.id, busy.has(s.id) ? "busy" : pending.has(s.id) ? "wait" : "ok");
      setSpaceStatuses(next);
    });
    return () => {
      cancelled = true;
    };
  }, [activeSheet, spaces, dateYMD, startHM, endHM, studio]);

  const canSubmit =
    !!destination && !!typeChoice && title.trim().length > 0 && !!dateYMD && !!startHM && !!endHM && !submitting;

  async function handleSubmit() {
    if (!canSubmit || !destination || !typeChoice || !person || !studio) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const startsAt = zonedDateTimeToUTC(dateYMD, startHM, studio.timezone).toISOString();
      const endsAt = zonedDateTimeToUTC(dateYMD, endHM, studio.timezone).toISOString();
      if (new Date(endsAt) <= new Date(startsAt)) {
        setErrorMsg("End time has to be after the start time.");
        setSubmitting(false);
        return;
      }

      if (canCreateDirectly && movesEventId) {
        // Moving an existing event only ever changes when and where it
        // happens — matches RequestReviewModal.approve()'s own move
        // branch exactly, never touching title/type/destination even
        // though those fields are shown (pre-filled, editable) above.
        const { error } = await supabase
          .from("event")
          .update({ starts_at: startsAt, ends_at: endsAt, studio_space_id: spaceId })
          .eq("id", movesEventId);
        if (error) throw error;
      } else if (canCreateDirectly) {
        const eventType: EventType =
          typeChoice === "class_rehearsal" ? (destination.kind === "comp_team" ? "rehearsal" : "class") : "booking";
        const { error } = await supabase.from("event").insert({
          studio_id: person.studio_id,
          created_by: person.id,
          title: title.trim(),
          event_type: eventType,
          team_id: destination.kind === "team" ? destination.id : null,
          comp_team_id: destination.kind === "comp_team" ? destination.id : null,
          studio_wide: destination.kind === "studio",
          studio_space_id: spaceId,
          starts_at: startsAt,
          ends_at: endsAt,
          notes: notes.trim() || null,
        });
        if (error) throw error;
      } else {
        // booking_request has no title/event_type column — the type and
        // title are folded into `note` for the Director to read at review
        // time (Task 13), same honest-subset approach as every other
        // schema-shaped gap in this project. See docs/DEFICIENCIES.md.
        const note = title.trim() + (notes.trim() ? `\n\n${notes.trim()}` : "");
        const { error } = await supabase.from("booking_request").insert({
          studio_id: person.studio_id,
          requested_by: person.id,
          team_id: destination.kind === "team" ? destination.id : null,
          comp_team_id: destination.kind === "comp_team" ? destination.id : null,
          starts_at: startsAt,
          ends_at: endsAt,
          preferred_space_id: spaceId,
          repeats: repeatsWeekly ? "weekly" : "once",
          note,
          moves_event_id: movesEventId,
        });
        if (error) throw error;
      }
      navigate(-1);
    } catch (err) {
      setErrorMsg(friendlyPostgrestError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!person || !studio) return null;

  return (
    <div style={{ maxWidth: 480, margin: "0 auto" }}>
      <div
        style={{
          padding: "16px 20px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--hairline)",
        }}
      >
        <div role="button" onClick={() => navigate(-1)} style={{ cursor: "pointer", color: "var(--ink-2)" }}>
          <CloseIcon />
        </div>
        <h2 className="font-display" style={{ fontSize: 16.5 }}>
          {movesEventId ? "Move Event" : "New Event"}
        </h2>
        <div
          role="button"
          onClick={handleSubmit}
          style={{
            fontSize: 14,
            fontWeight: 800,
            color: canSubmit ? "var(--signal-deep)" : "var(--ink-3)",
            cursor: canSubmit ? "pointer" : "default",
          }}
        >
          {submitting ? "…" : actionLabel}
        </div>
      </div>

      <div style={{ padding: "20px 20px 40px", display: "flex", flexDirection: "column", gap: 20 }}>
        {movesEventId && (
          <div style={{ background: "var(--sand)", color: "var(--ink-2)", borderRadius: 12, padding: "11px 14px", fontSize: 12 }}>
            Moving an existing event — only its date, time, and room change below; the type and destination stay the same.
          </div>
        )}
        {errorMsg && (
          <div
            style={{
              background: "var(--busy-tint)",
              color: "var(--busy)",
              borderRadius: 12,
              padding: "11px 14px",
              fontSize: 12.5,
            }}
          >
            {errorMsg}
          </div>
        )}

        <Field label="Posting to">
          <Row onClick={() => setActiveSheet("scope")}>
            {destination ? (
              <>
                <Swatch kind={destination.kind} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{destination.kind === "studio" ? "Studio" : destination.name}</div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 1 }}>{destination.sublabel}</div>
                </div>
              </>
            ) : (
              <div style={{ flex: 1, fontSize: 14, color: "var(--ink-3)" }}>Choose a destination…</div>
            )}
            <ChevronIcon />
          </Row>
        </Field>

        <Field label="Event type">
          <Row onClick={() => destination && setActiveSheet("type")} dim={!destination}>
            {typeChoice ? (
              <>
                <IconTile>
                  <CalendarIcon />
                </IconTile>
                <div style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>
                  {typeChoice === "other" && otherLabel.trim() ? otherLabel.trim() : TYPE_META[typeChoice].label}
                </div>
              </>
            ) : (
              <div style={{ flex: 1, fontSize: 14, color: "var(--ink-3)" }}>
                {destination ? "Choose a type…" : "Choose a destination first"}
              </div>
            )}
            <ChevronIcon />
          </Row>
        </Field>

        <Field label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Recital rehearsal"
            style={fieldInputStyle}
          />
        </Field>

        <Field label="Date">
          <input type="date" value={dateYMD} onChange={(e) => setDateYMD(e.target.value)} style={fieldInputStyle} />
        </Field>

        <div style={{ display: "flex", gap: 12 }}>
          <Field label="Start" style={{ flex: 1 }}>
            <input type="time" value={startHM} onChange={(e) => setStartHM(e.target.value)} style={fieldInputStyle} />
          </Field>
          <Field label="End" style={{ flex: 1 }}>
            <input type="time" value={endHM} onChange={(e) => setEndHM(e.target.value)} style={fieldInputStyle} />
          </Field>
        </div>

        <Field label="Location">
          <Row onClick={() => setActiveSheet("location")}>
            <IconTile>
              <MapPinIcon />
            </IconTile>
            <div style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>
              {spaceId ? spaces?.find((s) => s.id === spaceId)?.name : spaces && spaces.length === 0 ? "No spaces set up yet" : "Choose a location…"}
            </div>
            <ChevronIcon />
          </Row>
        </Field>

        {!canCreateDirectly && (
          <Toggle
            label="Repeats weekly"
            sublabel={repeatsWeekly ? "Every week, until the Director confirms an end date" : "Just this once"}
            on={repeatsWeekly}
            onToggle={() => setRepeatsWeekly((v) => !v)}
          />
        )}

        <Field label="Notes (optional)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Bring both costume pieces for spacing run"
            rows={3}
            style={{ ...fieldInputStyle, resize: "vertical", fontFamily: "inherit" }}
          />
        </Field>

        {destination && destination.kind !== "studio" && (
          <Toggle
            label={`Push to ${destination.name} families`}
            sublabel="Notified once this is saved"
            on={notifyOn}
            onToggle={() => setNotifyOn((v) => !v)}
          />
        )}

        <PrimaryButton onClick={handleSubmit} disabled={!canSubmit}>
          {submitting ? "Saving…" : actionLabel}
        </PrimaryButton>
      </div>

      <Sheet open={activeSheet === "scope"} onClose={() => setActiveSheet(null)} title="Post to…" subtitle="Only destinations you have posting access to are selectable.">
        {destOptions && (
          <>
            <SheetGroup label="Teams">
              {destOptions.teams.length === 0 && <EmptyRow>No teams yet.</EmptyRow>}
              {destOptions.teams.map((t) => (
                <DestRow
                  key={t.id}
                  option={t}
                  selected={destination?.kind === "team" && destination.id === t.id}
                  onSelect={() => {
                    setDestination(t);
                    setTypeChoice(null);
                  }}
                />
              ))}
            </SheetGroup>
            <SheetGroup label="Group & solo dances">
              {destOptions.compTeams.length === 0 && <EmptyRow>No dances yet.</EmptyRow>}
              {destOptions.compTeams.map((c) => (
                <DestRow
                  key={c.id}
                  option={c}
                  selected={destination?.kind === "comp_team" && destination.id === c.id}
                  onSelect={() => {
                    setDestination(c);
                    setTypeChoice(null);
                  }}
                />
              ))}
            </SheetGroup>
            <SheetGroup label="Studio">
              <DestRow
                option={destOptions.studio}
                selected={destination?.kind === "studio"}
                onSelect={() => {
                  setDestination(destOptions.studio);
                  setTypeChoice(null);
                }}
              />
            </SheetGroup>
          </>
        )}
      </Sheet>

      <Sheet open={activeSheet === "type"} onClose={() => setActiveSheet(null)} title="Event type" subtitle="Nothing fit? Pick Other and give it your own label.">
        {typeOptions.map((choice) => (
          <div key={choice} className="hairline" style={{ padding: "13px 0", display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div role="button" onClick={() => pickType(choice)} style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, cursor: "pointer" }}>
              <Radio on={typeChoice === choice} />
              <IconTile>
                <CalendarIcon />
              </IconTile>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{TYPE_META[choice].label}</div>
                <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{TYPE_META[choice].description(isDirector)}</div>
                {choice === "other" && typeChoice === "other" && (
                  <input
                    autoFocus
                    value={otherLabel}
                    onChange={(e) => {
                      setOtherLabel(e.target.value);
                      if (!title.trim() || title === "Studio time request" || title === "Dancer meeting") setTitle(e.target.value);
                    }}
                    placeholder="e.g. Costume swap, picture day setup…"
                    style={{ ...fieldInputStyle, marginTop: 8 }}
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
              </div>
            </div>
          </div>
        ))}
      </Sheet>

      <Sheet open={activeSheet === "location"} onClose={() => setActiveSheet(null)} title="Choose location" subtitle={`${studio.name}'s spaces, set up once under Studio settings.`}>
        {spaces === null ? (
          <EmptyRow>Loading…</EmptyRow>
        ) : spaces.length === 0 ? (
          <EmptyRow>Your studio hasn't set up any spaces yet.</EmptyRow>
        ) : (
          <SheetGroup label={studio.name}>
            {spaces.map((s) => (
              <div
                key={s.id}
                role="button"
                onClick={() => setSpaceId(s.id)}
                className="hairline"
                style={{ padding: "13px 0", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
              >
                <Radio on={spaceId === s.id} />
                <IconTile>
                  <MapPinIcon />
                </IconTile>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>{s.name}</div>
                  {s.floor_type && <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{s.floor_type}</div>}
                </div>
                <SpaceStatusDot status={spaceStatuses.get(s.id)} />
              </div>
            ))}
          </SheetGroup>
        )}
      </Sheet>
    </div>
  );
}

// "HH:MM" 24h, matching <input type="time">'s value format — the inverse
// of zonedDateTimeToUTC, for pre-filling the move form from an existing
// event's stored UTC instant.
function hmInZone(iso: string, timeZone: string): string {
  const mins = zonedMinutesOfDay(iso, timeZone);
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-2)", marginBottom: 7, display: "block" }}>{label}</span>
      {children}
    </div>
  );
}

function Row({ children, onClick, dim }: { children: React.ReactNode; onClick: () => void; dim?: boolean }) {
  return (
    <div
      role="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 11,
        padding: "14px 16px",
        background: "var(--surface)",
        border: "1px solid var(--hairline)",
        borderRadius: 13,
        cursor: dim ? "default" : "pointer",
        opacity: dim ? 0.6 : 1,
      }}
    >
      {children}
    </div>
  );
}

function IconTile({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 11,
        background: "var(--sand)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        color: "var(--ink-2)",
      }}
    >
      {children}
    </div>
  );
}

function Swatch({ kind }: { kind: DestKind }) {
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 11,
        flexShrink: 0,
        background:
          kind === "studio" ? "var(--band)" : "linear-gradient(155deg, var(--sand), var(--hairline))",
      }}
    />
  );
}

function Toggle({ label, sublabel, on, onToggle }: { label: string; sublabel: string; on: boolean; onToggle: () => void }) {
  return (
    <div
      role="button"
      onClick={onToggle}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 16px",
        background: "var(--surface)",
        border: "1px solid var(--hairline)",
        borderRadius: 13,
        cursor: "pointer",
      }}
    >
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 1 }}>{sublabel}</div>
      </div>
      <div
        style={{
          width: 40,
          height: 23,
          borderRadius: 999,
          background: on ? "var(--signal)" : "var(--hairline)",
          position: "relative",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 2.5,
            left: on ? 19.5 : 2.5,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 1px 3px rgba(0,0,0,.25)",
            transition: "left 120ms ease",
          }}
        />
      </div>
    </div>
  );
}

function SheetGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div
        className="font-display"
        style={{ fontSize: 10.5, letterSpacing: "0.11em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 700 }}
      >
        {label}
      </div>
      <div style={{ marginTop: 4 }}>{children}</div>
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12.5, color: "var(--ink-3)", padding: "8px 0" }}>{children}</div>;
}

function DestRow({ option, selected, onSelect }: { option: DestOption; selected: boolean; onSelect: () => void }) {
  return (
    <div
      role="button"
      onClick={() => option.postable && onSelect()}
      className="hairline"
      style={{ padding: "13px 0", display: "flex", alignItems: "center", gap: 12, cursor: option.postable ? "pointer" : "default" }}
    >
      <Radio on={selected} />
      <Swatch kind={option.kind} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: option.postable ? "var(--ink)" : "var(--ink-3)" }}>
          {option.kind === "studio" ? "Studio · whole-studio post" : option.name}
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{option.sublabel}</div>
      </div>
      {!option.postable && <LockIcon />}
    </div>
  );
}

function Radio({ on }: { on: boolean }) {
  return (
    <div
      style={{
        width: 21,
        height: 21,
        borderRadius: "50%",
        border: `1.5px solid ${on ? "var(--band)" : "var(--hairline)"}`,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {on && <div style={{ width: 11, height: 11, borderRadius: "50%", background: "var(--band)" }} />}
    </div>
  );
}

function SpaceStatusDot({ status }: { status?: SpaceStatus }) {
  if (!status) return null;
  const color = status === "busy" ? "var(--busy)" : status === "wait" ? "var(--wait)" : "var(--ok)";
  const label = status === "busy" ? "Busy" : status === "wait" ? "Requested" : "Available";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
      <span style={{ fontSize: 10.5, fontWeight: 700, color }}>{label}</span>
    </div>
  );
}

const fieldInputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--sand)",
  border: "none",
  borderRadius: 12,
  padding: "12px 15px",
  fontSize: 14,
  color: "var(--ink)",
};

function CloseIcon() {
  return (
    <svg style={{ width: 21, height: 21 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg style={{ width: 16, height: 16, color: "var(--ink-3)", flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg style={{ width: 17, height: 17 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <rect x="3" y="4" width="18" height="18" rx="3" />
      <path d="M8 2v4M16 2v4M3 10h18" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg style={{ width: 17, height: 17 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0116 0z" />
      <circle cx="12" cy="10" r="2.8" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg style={{ width: 14, height: 14, color: "var(--ink-3)", flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  );
}
