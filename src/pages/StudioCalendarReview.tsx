import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth, hasRole } from "../lib/AuthProvider";
import { useStudio } from "../lib/useStudio";
import { dayRangeInZone, formatLongDateInZone, formatTimeInZone, zonedDateKey, zonedMinutesOfDay } from "../lib/format";
import { RequestReviewModal } from "../components/RequestReviewModal";
import { Placeholder } from "./Placeholder";

interface SpaceCol {
  id: string;
  name: string;
}

interface Block {
  id: string;
  kind: "confirmed" | "pending";
  spaceId: string;
  title: string;
  subtitle: string;
  startsAt: string;
  endsAt: string;
  hasConflict: boolean;
  requestId?: string;
}

interface LaidOutBlock extends Block {
  colIndex: number;
  colCount: number;
}

interface PendingSummary {
  id: string;
  requesterName: string;
  destinationName: string;
  spaceName: string | null;
  startsAt: string;
  endsAt: string;
  createdAt: string;
}

const GRID_HEIGHT = 560;
const MIN_SPAN_HOURS = 3;

// Ports design-reference/StudioCalendarReview.dc.html — Director-only, one
// day × every studio_space at a time (not a week grid, despite BUILD_PLAN's
// prose gloss — the artboard itself is single-day, day-navigable, which is
// what's concrete here). See BUILD_PLAN.md Task 13.
export function StudioCalendarReview() {
  const { person } = useAuth();
  const studio = useStudio();
  const isDirector = hasRole(person, "director");

  const [dateYMD, setDateYMD] = useState("");
  const [spaces, setSpaces] = useState<SpaceCol[] | null>(null);
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [oldestPending, setOldestPending] = useState<PendingSummary | null | undefined>(undefined);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!studio || dateYMD) return;
    setDateYMD(zonedDateKey(new Date().toISOString(), studio.timezone));
  }, [studio, dateYMD]);

  // The studio-wide oldest pending request, independent of whichever day is
  // in view — same "pendingBookingCount" scope DirectorHome already uses,
  // so this banner and that Home card agree on what's outstanding.
  useEffect(() => {
    if (!person || !isDirector) return;
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("booking_request")
        .select("id, requested_by, created_at, starts_at, ends_at, team_id, comp_team_id, preferred_space_id")
        .eq("studio_id", person!.studio_id)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(1);
      const req = data?.[0];
      if (!req) {
        if (!cancelled) setOldestPending(null);
        return;
      }
      const [{ data: requester }, { data: team }, { data: compTeam }, { data: space }] = await Promise.all([
        supabase.from("person").select("full_name").eq("id", req.requested_by).single(),
        req.team_id ? supabase.from("team").select("name").eq("id", req.team_id).single() : Promise.resolve({ data: null as { name: string } | null }),
        req.comp_team_id
          ? supabase.from("comp_team").select("name").eq("id", req.comp_team_id).single()
          : Promise.resolve({ data: null as { name: string } | null }),
        req.preferred_space_id
          ? supabase.from("studio_space").select("name").eq("id", req.preferred_space_id).single()
          : Promise.resolve({ data: null as { name: string } | null }),
      ]);
      if (cancelled) return;
      setOldestPending({
        id: req.id,
        requesterName: requester?.full_name ?? "Someone",
        destinationName: team?.name ?? compTeam?.name ?? "Studio",
        spaceName: space?.name ?? null,
        startsAt: req.starts_at,
        endsAt: req.ends_at,
        createdAt: req.created_at,
      });
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [person, isDirector, reloadKey]);

  useEffect(() => {
    if (!person || !studio || !dateYMD || !isDirector) return;
    let cancelled = false;
    async function load() {
      const { data: spaceRows } = await supabase
        .from("studio_space")
        .select("id, name")
        .eq("studio_id", person!.studio_id)
        .eq("is_active", true)
        .order("sort_order");
      const spaceCols: SpaceCol[] = spaceRows ?? [];
      if (cancelled) return;
      setSpaces(spaceCols);
      if (spaceCols.length === 0) {
        setBlocks([]);
        return;
      }
      const spaceIds = spaceCols.map((s) => s.id);
      const { start, end } = dayRangeInZone(dateYMD, studio!.timezone);

      const [{ data: eventRows }, { data: requestRows }] = await Promise.all([
        supabase
          .from("event")
          .select("id, title, event_type, starts_at, ends_at, studio_space_id, team_id, comp_team_id")
          .in("studio_space_id", spaceIds)
          .is("cancelled_at", null)
          .lt("starts_at", end.toISOString())
          .gt("ends_at", start.toISOString()),
        supabase
          .from("booking_request")
          .select("id, note, starts_at, ends_at, preferred_space_id, team_id, comp_team_id, requested_by")
          .in("preferred_space_id", spaceIds)
          .eq("status", "pending")
          .lt("starts_at", end.toISOString())
          .gt("ends_at", start.toISOString()),
      ]);
      if (cancelled) return;

      const teamIds = new Set<string>();
      const compTeamIds = new Set<string>();
      for (const e of eventRows ?? []) {
        if (e.team_id) teamIds.add(e.team_id);
        if (e.comp_team_id) compTeamIds.add(e.comp_team_id);
      }
      for (const r of requestRows ?? []) {
        if (r.team_id) teamIds.add(r.team_id);
        if (r.comp_team_id) compTeamIds.add(r.comp_team_id);
      }
      const requesterIds = new Set((requestRows ?? []).map((r) => r.requested_by));

      const [{ data: teamRows }, { data: compTeamRows }, { data: requesterRows }] = await Promise.all([
        teamIds.size > 0 ? supabase.from("team").select("id, name").in("id", [...teamIds]) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        compTeamIds.size > 0
          ? supabase.from("comp_team").select("id, name").in("id", [...compTeamIds])
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        requesterIds.size > 0
          ? supabase.from("person").select("id, full_name").in("id", [...requesterIds])
          : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      ]);
      if (cancelled) return;

      const teamName = new Map((teamRows ?? []).map((t) => [t.id, t.name]));
      const compTeamName = new Map((compTeamRows ?? []).map((c) => [c.id, c.name]));
      const requesterName = new Map((requesterRows ?? []).map((p) => [p.id, p.full_name]));
      const destName = (teamId: string | null, compTeamId: string | null) =>
        (teamId && teamName.get(teamId)) || (compTeamId && compTeamName.get(compTeamId)) || "Studio-wide";

      const confirmedBlocks: Block[] = (eventRows ?? [])
        .filter((e) => !!e.studio_space_id)
        .map((e) => ({
          id: e.id,
          kind: "confirmed" as const,
          spaceId: e.studio_space_id!,
          title: e.title ?? eventTypeLabel(e.event_type),
          subtitle: `${eventTypeLabel(e.event_type)} · ${destName(e.team_id, e.comp_team_id)}`,
          startsAt: e.starts_at,
          endsAt: e.ends_at,
          hasConflict: false,
        }));

      const pendingBlocks: Block[] = (requestRows ?? []).map((r) => ({
        id: r.id,
        kind: "pending" as const,
        spaceId: r.preferred_space_id!,
        title: `Pending · ${requesterName.get(r.requested_by) ?? "Someone"}`,
        subtitle: destName(r.team_id, r.comp_team_id),
        startsAt: r.starts_at,
        endsAt: r.ends_at,
        hasConflict: false,
        requestId: r.id,
      }));

      // A confirmed block "has a conflict" only if a pending request in the
      // same space overlaps it — two confirmed events overlapping the same
      // space is already impossible (event_no_double_booking).
      for (const c of confirmedBlocks) {
        c.hasConflict = pendingBlocks.some(
          (p) => p.spaceId === c.spaceId && p.startsAt < c.endsAt && p.endsAt > c.startsAt
        );
      }

      if (cancelled) return;
      setBlocks([...confirmedBlocks, ...pendingBlocks]);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [person, studio, dateYMD, isDirector, reloadKey]);

  const blocksBySpace = useMemo(() => {
    const map = new Map<string, LaidOutBlock[]>();
    if (!blocks || !spaces) return map;
    for (const space of spaces) {
      const items = blocks
        .filter((b) => b.spaceId === space.id)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      map.set(space.id, layoutClusters(items));
    }
    return map;
  }, [blocks, spaces]);

  const window_ = useMemo(() => {
    if (!blocks || blocks.length === 0 || !studio) return null;
    let minMinutes = Infinity;
    let maxMinutes = -Infinity;
    for (const b of blocks) {
      const startMin = zonedMinutesOfDay(b.startsAt, studio.timezone);
      const endMin = zonedMinutesOfDay(b.endsAt, studio.timezone);
      minMinutes = Math.min(minMinutes, Math.floor(startMin / 60) * 60);
      maxMinutes = Math.max(maxMinutes, Math.ceil(endMin / 60) * 60);
    }
    if (maxMinutes - minMinutes < MIN_SPAN_HOURS * 60) maxMinutes = minMinutes + MIN_SPAN_HOURS * 60;
    return { minMinutes, maxMinutes };
  }, [blocks, studio]);

  if (!hasRole(person, "director")) return <Placeholder title="Studio calendar" />;
  if (!person || !studio || !dateYMD) return null;

  const dayLabel = formatLongDateInZone(dayRangeInZone(dateYMD, studio.timezone).start.toISOString(), studio.timezone);

  return (
    <div style={{ padding: "18px 20px 40px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h2 className="font-display" style={{ fontSize: 22 }}>
          Studio Calendar
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button type="button" onClick={() => shiftDay(dateYMD, -1, setDateYMD)} style={navBtnStyle} aria-label="Previous day">
              ‹
            </button>
            <span className="font-display" style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap" }}>
              {dayLabel}
            </span>
            <button type="button" onClick={() => shiftDay(dateYMD, 1, setDateYMD)} style={navBtnStyle} aria-label="Next day">
              ›
            </button>
          </div>
          <Link to="/add-event" style={ghostLinkStyle}>
            Request studio time…
          </Link>
        </div>
      </div>

      {oldestPending && (
        <div
          style={{
            marginTop: 16,
            background: "var(--band)",
            borderRadius: 16,
            padding: "15px 20px",
            display: "flex",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--signal)", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 13.5, color: "var(--band-ink)", fontWeight: 600 }}>
              {oldestPending.requesterName} requests {oldestPending.spaceName ?? "a space"} for {oldestPending.destinationName}
              {" · "}
              {formatLongDateInZone(oldestPending.startsAt, studio.timezone)}, {rangeLabel(oldestPending.startsAt, oldestPending.endsAt, studio.timezone)}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--band-ink-2)", marginTop: 2 }}>Requested {timeAgo(oldestPending.createdAt)}</div>
          </div>
          <button type="button" onClick={() => setReviewingId(oldestPending.id)} style={btnpStyle}>
            Review request
          </button>
        </div>
      )}

      <div style={{ marginTop: 22, overflowX: "auto" }}>
        {spaces === null || blocks === null ? (
          <p style={{ color: "var(--ink-3)", fontSize: 13 }}>Loading…</p>
        ) : spaces.length === 0 ? (
          <p style={{ color: "var(--ink-3)", fontSize: 13 }}>Your studio hasn't set up any spaces yet.</p>
        ) : blocks.length === 0 ? (
          <p style={{ color: "var(--ink-3)", fontSize: 13 }}>Nothing on the calendar for {dayLabel}.</p>
        ) : (
          <div style={{ minWidth: spaces.length * 160 + 56 }}>
            <div style={{ display: "grid", gridTemplateColumns: `56px repeat(${spaces.length}, 1fr)` }}>
              <div />
              {spaces.map((s) => (
                <div key={s.id} className="font-display" style={colHeadStyle}>
                  {s.name}
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: `56px repeat(${spaces.length}, 1fr)` }}>
              <HourLabels window={window_} />
              {spaces.map((s, i) => (
                <div
                  key={s.id}
                  style={{ position: "relative", height: GRID_HEIGHT, borderRight: i === spaces.length - 1 ? "none" : "1px solid var(--hairline)" }}
                >
                  <HourLines window={window_} />
                  {(blocksBySpace.get(s.id) ?? []).map((b) => (
                    <CalendarBlock
                      key={`${b.kind}-${b.id}`}
                      block={b}
                      window={window_}
                      timeZone={studio.timezone}
                      onClick={() => b.requestId && setReviewingId(b.requestId)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 16, fontSize: 11.5, color: "var(--ink-3)", flexWrap: "wrap" }}>
          <LegendItem swatchStyle={{ background: "var(--sand)" }} label="Confirmed, regular" />
          <LegendItem swatchStyle={{ border: "1.5px solid var(--busy-border)" }} label="Confirmed, has a conflict" />
          <LegendItem swatchStyle={{ background: "var(--wait-tint)", border: "1.5px dashed var(--wait)" }} label="Pending studio time request" />
        </div>
      </div>

      {reviewingId && (
        <RequestReviewModal
          requestId={reviewingId}
          onClose={() => setReviewingId(null)}
          onResolved={() => {
            setReviewingId(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}

function CalendarBlock({
  block,
  window,
  timeZone,
  onClick,
}: {
  block: LaidOutBlock;
  window: { minMinutes: number; maxMinutes: number } | null;
  timeZone: string;
  onClick: () => void;
}) {
  if (!window) return null;
  const startMin = zonedMinutesOfDay(block.startsAt, timeZone);
  const endMin = zonedMinutesOfDay(block.endsAt, timeZone);
  const spanMin = window.maxMinutes - window.minMinutes;
  const pxPerMin = GRID_HEIGHT / spanMin;
  const top = Math.max(0, (startMin - window.minMinutes) * pxPerMin);
  const height = Math.max(24, (endMin - startMin) * pxPerMin);
  const widthPct = 100 / block.colCount;
  const leftPct = widthPct * block.colIndex;

  const isPending = block.kind === "pending";
  const style: React.CSSProperties = {
    position: "absolute",
    top,
    height,
    left: `calc(${leftPct}% + 4px)`,
    width: `calc(${widthPct}% - 8px)`,
    borderRadius: 9,
    padding: "6px 8px",
    fontSize: 10.5,
    lineHeight: 1.35,
    overflow: "hidden",
    cursor: isPending ? "pointer" : "default",
    background: isPending ? "var(--wait-tint)" : "var(--sand)",
    border: isPending ? "1.5px dashed var(--wait)" : block.hasConflict ? "1.5px solid var(--busy-border)" : "none",
    color: isPending ? "var(--signal-ink)" : "var(--ink)",
  };

  return (
    <div style={style} role={isPending ? "button" : undefined} onClick={isPending ? onClick : undefined}>
      <div style={{ fontWeight: 700 }}>{block.title}</div>
      <div>{block.subtitle}</div>
    </div>
  );
}

function HourLabels({ window }: { window: { minMinutes: number; maxMinutes: number } | null }) {
  if (!window) return <div style={{ position: "relative", height: GRID_HEIGHT }} />;
  const hours = hourMarks(window);
  const spanMin = window.maxMinutes - window.minMinutes;
  const pxPerMin = GRID_HEIGHT / spanMin;
  return (
    <div style={{ position: "relative", height: GRID_HEIGHT }}>
      {hours.map((h) => (
        <div key={h} style={{ position: "absolute", top: (h - window.minMinutes) * pxPerMin, fontSize: 10, color: "var(--ink-3)" }}>
          {formatHourMark(h)}
        </div>
      ))}
    </div>
  );
}

function HourLines({ window }: { window: { minMinutes: number; maxMinutes: number } | null }) {
  if (!window) return null;
  const hours = hourMarks(window);
  const spanMin = window.maxMinutes - window.minMinutes;
  const pxPerMin = GRID_HEIGHT / spanMin;
  return (
    <>
      {hours.map((h) => (
        <div
          key={h}
          style={{ position: "absolute", left: 0, right: 0, top: (h - window.minMinutes) * pxPerMin, borderTop: "1px dashed var(--hairline)" }}
        />
      ))}
    </>
  );
}

function LegendItem({ swatchStyle, label }: { swatchStyle: React.CSSProperties; label: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, ...swatchStyle }} />
      {label}
    </span>
  );
}

function hourMarks(window: { minMinutes: number; maxMinutes: number }): number[] {
  const marks: number[] = [];
  for (let h = window.minMinutes; h <= window.maxMinutes; h += 60) marks.push(h);
  return marks;
}

function formatHourMark(minutesFromMidnight: number): string {
  const h24 = Math.floor(minutesFromMidnight / 60) % 24;
  const meridiem = h24 >= 12 ? "p" : "a";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:00${meridiem}`;
}

function eventTypeLabel(eventType: string): string {
  if (eventType === "class") return "Class";
  if (eventType === "rehearsal") return "Rehearsal";
  if (eventType === "call_time") return "Call time";
  return "Booking";
}

function rangeLabel(startsAt: string, endsAt: string, timeZone: string): string {
  const a = formatTimeInZone(startsAt, timeZone);
  const b = formatTimeInZone(endsAt, timeZone);
  return `${a.main}${a.meridiem}–${b.main}${b.meridiem}`;
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

function shiftDay(dateYMD: string, delta: number, setDateYMD: (v: string) => void) {
  const [y, m, d] = dateYMD.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + delta));
  setDateYMD(
    `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`
  );
}

// Groups items in one space that overlap each other in time into
// side-by-side columns (equal width), full width otherwise. Simple greedy
// clustering — plenty for a single studio's realistic block volume.
function layoutClusters(items: Block[]): LaidOutBlock[] {
  const result: LaidOutBlock[] = [];
  let cluster: Block[] = [];
  let clusterEnd = "";

  function flush() {
    cluster.forEach((b, i) => result.push({ ...b, colIndex: i, colCount: cluster.length }));
    cluster = [];
  }

  for (const item of items) {
    if (cluster.length === 0 || item.startsAt < clusterEnd) {
      cluster.push(item);
      clusterEnd = cluster.reduce((max, b) => (b.endsAt > max ? b.endsAt : max), clusterEnd || item.endsAt);
    } else {
      flush();
      cluster.push(item);
      clusterEnd = item.endsAt;
    }
  }
  flush();
  return result;
}

const colHeadStyle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 13,
  padding: "10px 0",
  textAlign: "center",
  borderBottom: "1.5px solid var(--hairline)",
};

const navBtnStyle: React.CSSProperties = {
  width: 26,
  height: 26,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 8,
  background: "var(--sand)",
  border: "none",
  color: "var(--ink-2)",
  fontSize: 15,
  cursor: "pointer",
};

const ghostLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "9px 16px",
  borderRadius: 9,
  background: "var(--sand)",
  color: "var(--ink)",
  fontSize: 12.5,
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const btnpStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "9px 16px",
  borderRadius: 9,
  background: "var(--signal)",
  color: "var(--signal-ink)",
  fontSize: 12.5,
  fontWeight: 700,
  border: "none",
  cursor: "pointer",
  whiteSpace: "nowrap",
};
