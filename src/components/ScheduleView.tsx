import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ScheduleRow } from "./ScheduleRow";
import {
  addDays,
  dayNumberInZone,
  formatLongDateInZone,
  formatTimeInZone,
  monthRangeInZone,
  weekRangeInZone,
  weekdayLabelInZone,
  zonedDateKey,
} from "../lib/format";

export interface ScheduleEvent {
  id: string;
  title: string | null;
  event_type: "class" | "rehearsal" | "booking" | "call_time";
  starts_at: string;
  ends_at: string;
  /** Optional per-viewer role-indicator dot color (docs/DEFICIENCIES.md #10)
   *  — set by the caller (e.g. GlobalSchedule), since only it knows the
   *  viewer's relationship to this event's destination. Falls back to
   *  ScheduleRow's own neutral default when omitted. */
  dotColor?: string;
}

type ViewMode = "week" | "month";

// Shared by every Schedule screen (global and each destination's own) —
// only what range to query and how to fetch it differs between callers.
// See BUILD_PLAN.md Task 11.
export function ScheduleView({
  timeZone,
  fetchEvents,
  emptyText,
  addEvent,
  onEventClick,
}: {
  timeZone: string;
  fetchEvents: (range: { start: Date; end: Date }) => Promise<ScheduleEvent[]>;
  emptyText: string;
  addEvent?: { to: string; label: string };
  /** Optional — a row is only clickable when the caller provides this (docs/DEFICIENCIES.md #20). */
  onEventClick?: (event: ScheduleEvent) => void;
}) {
  const [mode, setMode] = useState<ViewMode>("week");
  const [reference, setReference] = useState(() => new Date());
  const [events, setEvents] = useState<ScheduleEvent[] | null>(null);
  const [offline, setOffline] = useState(false);
  // Defaults to today so switching into Month shows today's agenda under
  // the grid, matching ScheduleMonth.dc.html, rather than dumping the
  // whole month as a flat list.
  const [selectedDayKey, setSelectedDayKey] = useState<string>(() => zonedDateKey(new Date().toISOString(), timeZone));

  const range = useMemo(
    () => (mode === "week" ? weekRangeInZone(reference, timeZone) : monthRangeInZone(reference, timeZone)),
    [mode, reference, timeZone]
  );

  useEffect(() => {
    let cancelled = false;
    setEvents(null);
    setOffline(false);
    fetchEvents(range)
      .then((rows) => {
        if (!cancelled) setEvents(rows);
      })
      .catch(() => {
        if (!cancelled) setOffline(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start.getTime(), range.end.getTime()]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, ScheduleEvent[]>();
    for (const e of events ?? []) {
      const key = zonedDateKey(e.starts_at, timeZone);
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    return map;
  }, [events, timeZone]);

  const step = (dir: -1 | 1) => {
    setReference((prev) => {
      if (mode === "week") return addDays(prev, dir * 7);
      const d = new Date(prev);
      d.setUTCMonth(d.getUTCMonth() + dir);
      return d;
    });
  };

  return (
    <div>
      {addEvent && (
        <div style={{ marginBottom: 18 }}>
          <Link to={addEvent.to} style={addEventBtnStyle}>
            + {addEvent.label}
          </Link>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div style={{ display: "inline-flex", gap: 1, background: "var(--sand)", borderRadius: 999, padding: 3 }}>
          {(["week", "month"] as ViewMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              style={{
                padding: "6px 14px",
                borderRadius: 999,
                border: "none",
                fontSize: 11.5,
                fontWeight: 700,
                cursor: "pointer",
                background: mode === m ? "var(--surface)" : "transparent",
                color: mode === m ? "var(--ink)" : "var(--ink-3)",
                boxShadow: mode === m ? "0 2px 6px -2px rgba(44,32,12,.2)" : "none",
                textTransform: "capitalize",
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <NavArrow dir="prev" onClick={() => step(-1)} />
        <div className="font-display" style={{ fontWeight: 700, fontSize: 15 }}>
          {mode === "week"
            ? `Week of ${formatShortMD(range.start, timeZone)} – ${formatShortMD(addDays(range.end, -1), timeZone)}`
            : new Intl.DateTimeFormat("en-US", { timeZone, month: "long", year: "numeric" }).format(range.start)}
        </div>
        <NavArrow dir="next" onClick={() => step(1)} />
      </div>

      {mode === "week" ? (
        <WeekStrip range={range} timeZone={timeZone} eventsByDay={eventsByDay} />
      ) : (
        <MonthGrid range={range} timeZone={timeZone} eventsByDay={eventsByDay} selected={selectedDayKey} onSelect={setSelectedDayKey} />
      )}

      <div style={{ marginTop: 24 }}>
        {offline ? (
          <p style={{ color: "var(--busy)", fontSize: 13 }}>Can't load this {mode} — you're offline.</p>
        ) : events === null ? (
          <p style={{ color: "var(--ink-2)", fontSize: 13 }}>Loading…</p>
        ) : mode === "month" && selectedDayKey ? (
          <DayAgenda dayKey={selectedDayKey} events={eventsByDay.get(selectedDayKey) ?? []} timeZone={timeZone} onEventClick={onEventClick} />
        ) : (
          <Agenda range={range} timeZone={timeZone} eventsByDay={eventsByDay} emptyText={emptyText} onEventClick={onEventClick} />
        )}
      </div>
    </div>
  );
}

function NavArrow({ dir, onClick }: { dir: "prev" | "next"; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ background: "none", border: "none", cursor: "pointer", padding: 6 }}>
      <svg style={{ width: 18, height: 18, color: "var(--ink-3)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
        <path d={dir === "prev" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
      </svg>
    </button>
  );
}

function WeekStrip({
  range,
  timeZone,
  eventsByDay,
}: {
  range: { start: Date; end: Date };
  timeZone: string;
  eventsByDay: Map<string, ScheduleEvent[]>;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(range.start, i));
  const todayKey = zonedDateKey(new Date().toISOString(), timeZone);
  return (
    <div style={{ marginTop: 14, display: "flex", gap: 2 }}>
      {days.map((d) => {
        const key = zonedDateKey(d.toISOString(), timeZone);
        const hasEvents = (eventsByDay.get(key)?.length ?? 0) > 0;
        const isToday = key === todayKey;
        return (
          <div key={key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: "var(--ink-3)", fontWeight: 600 }}>
              {weekdayLabelInZone(d.toISOString(), timeZone)}
            </span>
            <div
              className="font-display"
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 13.5,
                background: isToday ? "var(--signal)" : "transparent",
                color: isToday ? "var(--signal-ink)" : "var(--ink)",
              }}
            >
              {dayNumberInZone(d.toISOString(), timeZone)}
            </div>
            <span style={{ width: 4.5, height: 4.5, borderRadius: "50%", background: hasEvents ? "var(--busy)" : "transparent" }} />
          </div>
        );
      })}
    </div>
  );
}

function MonthGrid({
  range,
  timeZone,
  eventsByDay,
  selected,
  onSelect,
}: {
  range: { start: Date; end: Date };
  timeZone: string;
  eventsByDay: Map<string, ScheduleEvent[]>;
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  // Pad out to full weeks (Monday-start) so the grid always has complete rows.
  const firstWeekday = (() => {
    const dow = range.start.getUTCDay();
    return dow === 0 ? 7 : dow;
  })();
  const gridStart = addDays(range.start, -(firstWeekday - 1));
  const totalDays = Math.ceil((range.end.getTime() - gridStart.getTime()) / 86400000 / 7) * 7;
  const days = Array.from({ length: totalDays }, (_, i) => addDays(gridStart, i));
  const todayKey = zonedDateKey(new Date().toISOString(), timeZone);

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 6 }}>
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: "var(--ink-3)" }}>
            {d}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, background: "var(--hairline)", border: "1px solid var(--hairline)", borderRadius: 14, overflow: "hidden" }}>
        {days.map((d) => {
          const key = zonedDateKey(d.toISOString(), timeZone);
          const inMonth = d.getTime() >= range.start.getTime() && d.getTime() < range.end.getTime();
          const hasEvents = (eventsByDay.get(key)?.length ?? 0) > 0;
          const isToday = key === todayKey;
          const isSelected = key === selected;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              style={{
                background: inMonth ? "var(--surface)" : "var(--paper)",
                border: isSelected ? "2px solid var(--ink)" : "none",
                minHeight: 46,
                padding: "6px 5px",
                display: "flex",
                flexDirection: "column",
                gap: 4,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span
                className="font-display"
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  background: isToday ? "var(--signal)" : "transparent",
                  color: isToday ? "var(--signal-ink)" : inMonth ? "var(--ink)" : "var(--ink-3)",
                  opacity: inMonth ? 1 : 0.5,
                }}
              >
                {dayNumberInZone(d.toISOString(), timeZone)}
              </span>
              {hasEvents && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--busy)", marginLeft: 2 }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Agenda({
  range,
  timeZone,
  eventsByDay,
  emptyText,
  onEventClick,
}: {
  range: { start: Date; end: Date };
  timeZone: string;
  eventsByDay: Map<string, ScheduleEvent[]>;
  emptyText: string;
  onEventClick?: (event: ScheduleEvent) => void;
}) {
  const totalDays = Math.round((range.end.getTime() - range.start.getTime()) / 86400000);
  const days = Array.from({ length: totalDays }, (_, i) => addDays(range.start, i));
  const todayKey = zonedDateKey(new Date().toISOString(), timeZone);
  const daysWithEvents = days.filter((d) => (eventsByDay.get(zonedDateKey(d.toISOString(), timeZone))?.length ?? 0) > 0);

  if (daysWithEvents.length === 0) {
    return <p style={{ color: "var(--ink-2)", fontSize: 13 }}>{emptyText}</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {daysWithEvents.map((d) => {
        const key = zonedDateKey(d.toISOString(), timeZone);
        const dayEvents = eventsByDay.get(key) ?? [];
        const label = formatLongDateInZone(d.toISOString(), timeZone) + (key === todayKey ? " · Today" : "");
        return <DayCard key={key} label={label} events={dayEvents} timeZone={timeZone} onEventClick={onEventClick} />;
      })}
    </div>
  );
}

function DayAgenda({ dayKey, events, timeZone, onEventClick }: { dayKey: string; events: ScheduleEvent[]; timeZone: string; onEventClick?: (event: ScheduleEvent) => void }) {
  const todayKey = zonedDateKey(new Date().toISOString(), timeZone);
  const label = formatLongDateInZone(events[0]?.starts_at ?? `${dayKey}T12:00:00Z`, timeZone) + (dayKey === todayKey ? " · Today" : "");
  return <DayCard label={label} events={events} timeZone={timeZone} onEventClick={onEventClick} />;
}

function DayCard({ label, events, timeZone, onEventClick }: { label: string; events: ScheduleEvent[]; timeZone: string; onEventClick?: (event: ScheduleEvent) => void }) {
  return (
    <div>
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
        {label}
      </div>
      <div className="card" style={{ marginTop: 10, border: "1px solid var(--hairline)", borderRadius: 18, padding: "2px 16px" }}>
        {events.length === 0 ? (
          <p style={{ padding: "13px 0", fontSize: 13, color: "var(--ink-2)" }}>Nothing scheduled.</p>
        ) : (
          events.map((e) => {
            const { main, meridiem } = formatTimeInZone(e.starts_at, timeZone);
            return (
              <ScheduleRow
                key={e.id}
                time={`${main}${meridiem}`}
                title={e.title ?? eventTypeLabel(e.event_type)}
                subtitle={e.title ? eventTypeLabel(e.event_type) : undefined}
                dotColor={e.dotColor}
                onClick={onEventClick ? () => onEventClick(e) : undefined}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

function eventTypeLabel(type: ScheduleEvent["event_type"]): string {
  switch (type) {
    case "class":
      return "Class";
    case "rehearsal":
      return "Rehearsal";
    case "booking":
      return "Booking";
    case "call_time":
      return "Call time";
  }
}

function formatShortMD(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" }).format(date);
}

const addEventBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  padding: "11px 18px",
  borderRadius: 11,
  background: "var(--band)",
  color: "var(--signal)",
  fontSize: 12.5,
  fontWeight: 700,
  textDecoration: "none",
};
