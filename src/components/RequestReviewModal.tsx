import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthProvider";
import { formatLongDateInZone, formatTimeInZone } from "../lib/format";
import { friendlyPostgrestError } from "../lib/errors";
import { Avatar } from "../components/Avatar";

interface RequestDetail {
  id: string;
  requesterName: string;
  createdAt: string;
  note: string | null;
  startsAt: string;
  endsAt: string;
  spaceId: string | null;
  spaceName: string | null;
  destinationKind: "team" | "comp_team";
  destinationId: string;
  destinationName: string;
  movesEventId: string | null;
  movingFrom: { startsAt: string; endsAt: string; spaceName: string | null } | null;
}

interface ConflictInfo {
  title: string | null;
  startsAt: string;
  endsAt: string;
  destinationName: string;
}

// Ports design-reference/RequestReviewModal.dc.html — approving inserts (or,
// for a move request, updates) the event FIRST and only marks the request
// approved once that succeeds, so a double-booking-constraint failure never
// leaves a request marked approved with nothing actually booked — see
// BUILD_PLAN.md Task 13's "approve ... in one transaction" instruction; a
// real multi-table transaction isn't reachable from the client (no `app.*`
// RPC exists for it), so ordering does the same job. The "propose a
// different time or room" mockup promises a real accept/counter loop with
// the requester — there's no schema column to store a counter-proposal at
// all, so Decline's optional note is the honest subset built instead; see
// docs/DEFICIENCIES.md.
export function RequestReviewModal({
  requestId,
  onClose,
  onResolved,
}: {
  requestId: string;
  onClose: () => void;
  onResolved: () => void;
}) {
  const { person } = useAuth();
  const [studio, setStudioTz] = useState<string | null>(null);
  const [request, setRequest] = useState<RequestDetail | null>(null);
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!person) return;
    let cancelled = false;
    async function load() {
      const { data: studioRow } = await supabase.from("studio").select("timezone").eq("id", person!.studio_id).single();
      if (cancelled) return;
      setStudioTz(studioRow?.timezone ?? null);

      const { data: req } = await supabase
        .from("booking_request")
        .select("id, requested_by, created_at, note, starts_at, ends_at, preferred_space_id, team_id, comp_team_id, moves_event_id")
        .eq("id", requestId)
        .single();
      if (!req || cancelled) return;

      const [{ data: requester }, { data: space }, { data: team }, { data: compTeam }, { data: movedEvent }] =
        await Promise.all([
          supabase.from("person").select("full_name").eq("id", req.requested_by).single(),
          req.preferred_space_id
            ? supabase.from("studio_space").select("name").eq("id", req.preferred_space_id).single()
            : Promise.resolve({ data: null as { name: string } | null }),
          req.team_id ? supabase.from("team").select("name").eq("id", req.team_id).single() : Promise.resolve({ data: null as { name: string } | null }),
          req.comp_team_id
            ? supabase.from("comp_team").select("name").eq("id", req.comp_team_id).single()
            : Promise.resolve({ data: null as { name: string } | null }),
          req.moves_event_id
            ? supabase.from("event").select("starts_at, ends_at, studio_space_id").eq("id", req.moves_event_id).single()
            : Promise.resolve({ data: null as { starts_at: string; ends_at: string; studio_space_id: string | null } | null }),
        ]);
      if (cancelled) return;

      let movingFromSpaceName: string | null = null;
      if (movedEvent?.studio_space_id) {
        const { data: s } = await supabase.from("studio_space").select("name").eq("id", movedEvent.studio_space_id).single();
        movingFromSpaceName = s?.name ?? null;
      }

      const detail: RequestDetail = {
        id: req.id,
        requesterName: requester?.full_name ?? "Someone",
        createdAt: req.created_at,
        note: req.note,
        startsAt: req.starts_at,
        endsAt: req.ends_at,
        spaceId: req.preferred_space_id,
        spaceName: space?.name ?? null,
        destinationKind: req.team_id ? "team" : "comp_team",
        destinationId: (req.team_id ?? req.comp_team_id)!,
        destinationName: team?.name ?? compTeam?.name ?? "Unknown",
        movesEventId: req.moves_event_id,
        movingFrom: movedEvent
          ? { startsAt: movedEvent.starts_at, endsAt: movedEvent.ends_at, spaceName: movingFromSpaceName }
          : null,
      };

      // A confirmed event in the same space that overlaps the requested
      // window is the only real "conflict" a pending request can have —
      // two CONFIRMED events overlapping the same space is already
      // impossible, enforced by event_no_double_booking.
      let conflictInfo: ConflictInfo | null = null;
      if (detail.spaceId) {
        let q = supabase
          .from("event")
          .select("id, title, event_type, starts_at, ends_at, team_id, comp_team_id")
          .eq("studio_space_id", detail.spaceId)
          .is("cancelled_at", null)
          .lt("starts_at", detail.endsAt)
          .gt("ends_at", detail.startsAt);
        if (detail.movesEventId) q = q.neq("id", detail.movesEventId);
        const { data: conflicts } = await q.limit(1);
        const c = conflicts?.[0];
        if (c) {
          const { data: cTeam } = c.team_id ? await supabase.from("team").select("name").eq("id", c.team_id).single() : { data: null };
          const { data: cCompTeam } = c.comp_team_id
            ? await supabase.from("comp_team").select("name").eq("id", c.comp_team_id).single()
            : { data: null };
          conflictInfo = {
            title: c.title,
            startsAt: c.starts_at,
            endsAt: c.ends_at,
            destinationName: cTeam?.name ?? cCompTeam?.name ?? "Studio-wide event",
          };
        }
      }

      if (cancelled) return;
      setRequest(detail);
      setConflict(conflictInfo);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [requestId, person]);

  async function approve() {
    if (!request || !person) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      let resultingEventId: string;
      if (request.movesEventId) {
        const { data, error } = await supabase
          .from("event")
          .update({ starts_at: request.startsAt, ends_at: request.endsAt, studio_space_id: request.spaceId })
          .eq("id", request.movesEventId)
          .select("id")
          .single();
        if (error) throw error;
        resultingEventId = data.id;
      } else {
        const title = noteTitle(request.note) || "Booking request";
        const rest = noteRest(request.note);
        const { data, error } = await supabase
          .from("event")
          .insert({
            studio_id: person.studio_id,
            created_by: person.id,
            title,
            event_type: "booking",
            team_id: request.destinationKind === "team" ? request.destinationId : null,
            comp_team_id: request.destinationKind === "comp_team" ? request.destinationId : null,
            studio_wide: false,
            studio_space_id: request.spaceId,
            starts_at: request.startsAt,
            ends_at: request.endsAt,
            notes: rest || null,
          })
          .select("id")
          .single();
        if (error) throw error;
        resultingEventId = data.id;
      }
      // Only reachable once the risky write above already succeeded — see
      // the file-level comment on why this ordering stands in for a real
      // transaction.
      const { error: updateErr } = await supabase
        .from("booking_request")
        .update({
          status: "approved",
          reviewed_by: person.id,
          reviewed_at: new Date().toISOString(),
          resulting_event_id: resultingEventId,
        })
        .eq("id", request.id);
      if (updateErr) throw updateErr;
      onResolved();
    } catch (err) {
      setErrorMsg(friendlyPostgrestError(err));
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    if (!request || !person) return;
    setBusy(true);
    setErrorMsg(null);
    const { error } = await supabase
      .from("booking_request")
      .update({
        status: "declined",
        reviewed_by: person.id,
        reviewed_at: new Date().toISOString(),
        decline_reason: declineReason.trim() || null,
      })
      .eq("id", request.id);
    setBusy(false);
    if (error) {
      setErrorMsg(friendlyPostgrestError(error));
      return;
    }
    onResolved();
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(28,23,20,.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 540,
          maxHeight: "90vh",
          overflowY: "auto",
          background: "var(--paper)",
          borderRadius: 20,
          boxShadow: "0 24px 60px -18px rgba(28,23,20,.35)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {loading || !request || !studio ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>Loading…</div>
        ) : (
          <>
            <div style={{ padding: "22px 26px 16px", borderBottom: "1px solid var(--hairline)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Avatar name={request.requesterName} size={38} />
                <div>
                  <h2 className="font-display" style={{ fontSize: 17 }}>
                    {request.movesEventId ? "Move request" : "Studio time request"}
                  </h2>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                    {request.requesterName} · requested {timeAgo(request.createdAt)}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ padding: "18px 26px 4px" }}>
              {request.movingFrom && (
                <ReviewField
                  label="Currently"
                  value={`${request.movingFrom.spaceName ?? "No space"} · ${formatLongDateInZone(request.movingFrom.startsAt, studio)} · ${rangeLabel(request.movingFrom.startsAt, request.movingFrom.endsAt, studio)}`}
                />
              )}
              <ReviewField label="Space" value={request.spaceName ?? "No preference"} />
              <ReviewField
                label="When"
                value={`${formatLongDateInZone(request.startsAt, studio)} · ${rangeLabel(request.startsAt, request.endsAt, studio)}`}
              />
              <ReviewField label="For" value={request.destinationName} />
              {noteRest(request.note) || noteTitle(request.note) ? (
                <div style={{ paddingTop: 12 }}>
                  <div style={{ fontSize: 13, color: "var(--ink-3)" }}>Note from {request.requesterName.split(" ")[0]}</div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5, marginTop: 4 }}>
                    {[noteTitle(request.note), noteRest(request.note)].filter(Boolean).join(" — ")}
                  </div>
                </div>
              ) : null}
            </div>

            {conflict && (
              <div
                style={{
                  margin: "6px 26px 18px",
                  background: "var(--busy-tint)",
                  border: "1px solid var(--busy-border)",
                  borderRadius: 13,
                  padding: "14px 16px",
                }}
              >
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--busy)" }}>Conflicts with an existing event</div>
                <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 5, lineHeight: 1.5 }}>
                  {conflict.title ?? "An event"} ({conflict.destinationName}) runs {rangeLabel(conflict.startsAt, conflict.endsAt, studio)} in{" "}
                  {request.spaceName} — the same room, overlapping.
                </div>
              </div>
            )}

            {errorMsg && (
              <div style={{ margin: "0 26px 14px", fontSize: 12.5, color: "var(--busy)" }}>{errorMsg}</div>
            )}

            {declining ? (
              <div style={{ padding: "0 26px 18px" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-2)", display: "block", marginBottom: 7 }}>
                  Note (optional) — let {request.requesterName.split(" ")[0]} know why, or suggest a different time or room
                </span>
                <textarea
                  autoFocus
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  rows={3}
                  placeholder="e.g. Studio B is busy then — Studio C is open all evening if that works"
                  style={{
                    width: "100%",
                    background: "var(--sand)",
                    border: "none",
                    borderRadius: 12,
                    padding: "12px 15px",
                    fontSize: 13.5,
                    color: "var(--ink)",
                    fontFamily: "inherit",
                    resize: "vertical",
                  }}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 12 }}>
                  <button type="button" onClick={() => setDeclining(false)} disabled={busy} style={btnghostStyle}>
                    Back
                  </button>
                  <button type="button" onClick={decline} disabled={busy} style={btndeclineStyle}>
                    {busy ? "Declining…" : "Confirm decline"}
                  </button>
                </div>
              </div>
            ) : (
              <div
                style={{
                  padding: "16px 26px 22px",
                  borderTop: "1px solid var(--hairline)",
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                  gap: 9,
                }}
              >
                <button type="button" onClick={() => setDeclining(true)} disabled={busy} style={btndeclineStyle}>
                  Decline
                </button>
                <button type="button" onClick={approve} disabled={busy} style={btnpStyle}>
                  {busy ? "…" : conflict ? "Approve anyway" : "Approve"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ReviewField({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 0",
        fontSize: 13,
        borderTop: "1px solid var(--hairline)",
      }}
    >
      <span style={{ color: "var(--ink-3)" }}>{label}</span>
      <span style={{ fontWeight: 700, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function rangeLabel(startsAt: string, endsAt: string, timeZone: string): string {
  const a = formatTimeInZone(startsAt, timeZone);
  const b = formatTimeInZone(endsAt, timeZone);
  return `${a.main}${a.meridiem}–${b.main}${b.meridiem}`;
}

function noteTitle(note: string | null): string {
  if (!note) return "";
  return note.split("\n\n")[0]?.trim() ?? "";
}

function noteRest(note: string | null): string {
  if (!note) return "";
  const parts = note.split("\n\n");
  return parts.length > 1 ? parts.slice(1).join("\n\n").trim() : "";
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

const btnpStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "11px 18px",
  borderRadius: 10,
  background: "var(--band)",
  color: "var(--signal)",
  fontSize: 12.5,
  fontWeight: 700,
  border: "none",
  cursor: "pointer",
};

const btnghostStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "11px 18px",
  borderRadius: 10,
  background: "var(--sand)",
  color: "var(--ink)",
  fontSize: 12.5,
  fontWeight: 600,
  border: "none",
  cursor: "pointer",
};

const btndeclineStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "11px 18px",
  borderRadius: 10,
  background: "var(--surface)",
  border: "1px solid var(--hairline)",
  color: "var(--ink-2)",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
};
