import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase, callApp } from "../lib/supabase";
import { useAuth, hasRole } from "../lib/AuthProvider";
import { useStudio } from "../lib/useStudio";
import { formatLongDateInZone, formatTimeInZone } from "../lib/format";

interface EventDetailData {
  id: string;
  title: string | null;
  event_type: "class" | "rehearsal" | "booking" | "call_time";
  starts_at: string;
  ends_at: string;
  notes: string | null;
  team_id: string | null;
  comp_team_id: string | null;
  studio_wide: boolean;
  studio_space_id: string | null;
  competition_entry_id: string | null;
  cancelled_at: string | null;
}

// New — the entry point BUILD_PLAN's move path always assumed would exist
// ("an instructor's date/time/space edits are replaced with Request a
// move, opens Add Event pre-filled with moves_event_id") but no artboard
// or screen ever provided: something that shows an existing event and
// lets someone act on it. No design-reference artboard exists for this
// (checked before building), so styling follows this codebase's own
// established detail-screen pattern (PersonDetail) rather than porting a
// mockup. See docs/DEFICIENCIES.md #20.
//
// "Move event"/"Request a move" both link to the same
// /add-event?movesEvent=<id> — AddEvent.tsx already branches internally
// on canCreateDirectly (a Director moves the event directly; anyone else
// creates a booking_request with moves_event_id set), so this screen
// doesn't need two different destinations, just one label that matches
// what'll actually happen. Visibility mirrors event_update's real RLS
// (Director, or the team's teaching instructor / comp_team's
// choreographer) rather than guessing — confirmed via pg_policies first.
export function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { person } = useAuth();
  const studio = useStudio();
  const isDirector = hasRole(person, "director");

  const [event, setEvent] = useState<EventDetailData | null>(null);
  const [destName, setDestName] = useState<string | null>(null);
  const [spaceName, setSpaceName] = useState<string | null>(null);
  const [canMove, setCanMove] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id || !person) return;
    let cancelled = false;
    async function load() {
      const { data: row } = await supabase
        .from("event")
        .select("id, title, event_type, starts_at, ends_at, notes, team_id, comp_team_id, studio_wide, studio_space_id, competition_entry_id, cancelled_at")
        .eq("id", id!)
        .maybeSingle();
      if (cancelled) return;
      if (!row) {
        setNotFound(true);
        return;
      }
      setEvent(row);

      // Resolve destination name + move-eligibility together — both need
      // to know which team/comp_team actually owns this event, including
      // the one-hop-further case for a call_time event (comp_team_id is
      // always null there — same shape as AddEvent.tsx's own move-prefill
      // fix, see Deficiency #14).
      const [{ data: teachIds }, { data: choreographIds }] = await Promise.all([
        callApp<string[]>("teams_i_teach"),
        callApp<string[]>("comp_teams_i_choreograph"),
      ]);
      if (cancelled) return;
      const teachSet = new Set(teachIds ?? []);
      const choreographSet = new Set(choreographIds ?? []);

      if (row.studio_wide) {
        setDestName(studio?.name ?? "Studio");
        setCanMove(isDirector);
      } else if (row.team_id) {
        const { data: t } = await supabase.from("team").select("name").eq("id", row.team_id).maybeSingle();
        if (cancelled) return;
        setDestName(t?.name ?? null);
        setCanMove(isDirector || teachSet.has(row.team_id));
      } else if (row.comp_team_id) {
        const { data: c } = await supabase.from("comp_team").select("name").eq("id", row.comp_team_id).maybeSingle();
        if (cancelled) return;
        setDestName(c?.name ?? null);
        setCanMove(isDirector || choreographSet.has(row.comp_team_id));
      } else if (row.competition_entry_id) {
        const { data: entry } = await supabase.from("competition_entry").select("comp_team_id").eq("id", row.competition_entry_id).maybeSingle();
        if (cancelled || !entry) return;
        const { data: c } = await supabase.from("comp_team").select("name").eq("id", entry.comp_team_id).maybeSingle();
        if (cancelled) return;
        setDestName(c?.name ?? null);
        setCanMove(isDirector || choreographSet.has(entry.comp_team_id));
      } else {
        setDestName(null);
        setCanMove(isDirector);
      }

      if (row.studio_space_id) {
        const { data: s } = await supabase.from("studio_space").select("name").eq("id", row.studio_space_id).maybeSingle();
        if (!cancelled) setSpaceName(s?.name ?? null);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id, person, isDirector, studio]);

  if (notFound) {
    return (
      <div style={{ padding: "18px 34px 30px" }}>
        <BackLink navigate={navigate} />
        <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 16 }}>
          This event doesn't exist anymore, or you don't have access to it.
        </p>
      </div>
    );
  }

  if (!person || !studio || !event) return null;

  return (
    <div style={{ padding: "18px 34px 30px", maxWidth: 560 }}>
      <BackLink navigate={navigate} />

      <div style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 22, letterSpacing: "-0.01em" }}>{event.title ?? eventTypeLabel(event.event_type)}</h2>
        <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 4 }}>
          {eventTypeLabel(event.event_type)}
          {destName ? ` · ${destName}` : ""}
          {event.cancelled_at && <span style={{ marginLeft: 8, color: "var(--busy)", fontWeight: 700 }}>CANCELLED</span>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 22, border: "1px solid var(--hairline)", borderRadius: 16, padding: "20px 22px" }}>
        <KV label="When">
          {formatLongDateInZone(event.starts_at, studio.timezone)}
          <br />
          {formatTimeInZone(event.starts_at, studio.timezone).main}
          {formatTimeInZone(event.starts_at, studio.timezone).meridiem} – {formatTimeInZone(event.ends_at, studio.timezone).main}
          {formatTimeInZone(event.ends_at, studio.timezone).meridiem}
        </KV>
        {spaceName && (
          <div style={{ marginTop: 16 }}>
            <KV label="Where">{spaceName}</KV>
          </div>
        )}
        {event.notes && (
          <div style={{ marginTop: 16 }}>
            <KV label="Notes">{event.notes}</KV>
          </div>
        )}
      </div>

      {canMove && !event.cancelled_at && (
        <div style={{ marginTop: 20 }}>
          <Link
            to={`/add-event?movesEvent=${event.id}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "12px 20px",
              borderRadius: 12,
              background: "var(--signal)",
              color: "var(--signal-ink)",
              fontSize: 13.5,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            {isDirector ? "Move event" : "Request a move"}
          </Link>
          {!isDirector && (
            <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 8, lineHeight: 1.5 }}>
              Sent to the Director for approval — this doesn't change until they confirm it.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function BackLink({ navigate }: { navigate: (delta: number) => void }) {
  return (
    <button
      type="button"
      onClick={() => navigate(-1)}
      style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--ink-2)", fontSize: 12.5, fontWeight: 600 }}
    >
      ‹ Back
    </button>
  );
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 14, color: "var(--ink)", lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

function eventTypeLabel(eventType: string): string {
  if (eventType === "class") return "Class";
  if (eventType === "rehearsal") return "Rehearsal";
  if (eventType === "call_time") return "Call time";
  return "Studio time";
}
