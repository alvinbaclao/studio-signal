import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthProvider";
import { useStudio } from "../lib/useStudio";
import { useViewport } from "../lib/useViewport";
import { useDirectorHome } from "../lib/useDirectorHome";
import { formatLongDateInZone, formatTimeInZone, dayRangeInZone, zonedDateKey } from "../lib/format";
import { Band } from "../components/Band";

interface TodayEvent {
  id: string;
  title: string | null;
  event_type: string;
  starts_at: string;
  spaceName: string | null;
}

// Ports design-reference/DirectorHomeMobile.dc.html — a purpose-built
// condensed subset, not a mobile port of DirectorHome.dc.html. See
// BUILD_PLAN.md Task 25 and this file's own routing in App.tsx (renders
// below 900px in place of DirectorHome, same "/" route). Deep management
// (wizards, Settings, full roster edit, entries) stays on the desktop
// console, reachable here only via "Switch to full console"
// (useViewport's forceDesktop — see src/lib/useViewport.ts and
// Shell.css's `.force-desktop`).
//
// "Needs a decision" reuses useDirectorHome, the exact same real data
// DirectorHome's own band shows (Task 3) — just laid out as stacked
// cards instead of a grid. "Today, studio-wide" is real (no destination
// filter, RLS-scoped, same query shape HomeUnified/GlobalSchedule already
// use) but deliberately spare: title, space, and time only — no
// instructor/dancer-count enrichment or conflict badge, since BUILD_PLAN
// frames this whole task as "purely a new entry point," not a rebuild.
export function DirectorHomeMobile() {
  const { person } = useAuth();
  const studio = useStudio();
  const { setForceDesktop } = useViewport();
  const { decisionCards } = useDirectorHome();
  const [todayEvents, setTodayEvents] = useState<TodayEvent[] | null>(null);

  useEffect(() => {
    if (!person || !studio) return;
    let cancelled = false;
    async function load() {
      const todayYMD = zonedDateKey(new Date().toISOString(), studio!.timezone);
      const { start, end } = dayRangeInZone(todayYMD, studio!.timezone);
      const { data: eventRows } = await supabase
        .from("event")
        .select("id, title, event_type, starts_at, studio_space_id")
        .is("cancelled_at", null)
        .gte("starts_at", start.toISOString())
        .lt("starts_at", end.toISOString())
        .order("starts_at");
      if (cancelled) return;
      const spaceIds = [...new Set((eventRows ?? []).map((e) => e.studio_space_id).filter((v): v is string => !!v))];
      const { data: spaceRows } = spaceIds.length > 0 ? await supabase.from("studio_space").select("id, name").in("id", spaceIds) : { data: [] as { id: string; name: string }[] };
      if (cancelled) return;
      const spaceName = new Map((spaceRows ?? []).map((s) => [s.id, s.name]));
      setTodayEvents((eventRows ?? []).map((e) => ({ id: e.id, title: e.title, event_type: e.event_type, starts_at: e.starts_at, spaceName: e.studio_space_id ? spaceName.get(e.studio_space_id) ?? null : null })));
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [person, studio]);

  if (!person || !studio) return null;

  const greeting = greetingFor(studio.timezone);
  const firstName = person.full_name.split(" ")[0];
  const todayLabel = formatLongDateInZone(new Date().toISOString(), studio.timezone);

  return (
    <div style={{ padding: "18px 20px 40px" }}>
      <h2 className="font-display" style={{ fontSize: 21 }}>
        {greeting}, {firstName}
      </h2>
      <p style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 4 }}>
        {todayLabel} · Director
      </p>

      {decisionCards.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <Band>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 10.5, letterSpacing: "0.11em", textTransform: "uppercase", color: "var(--band-ink-2)", fontWeight: 600 }}>
              Needs a decision · {decisionCards.length}
            </div>
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 11 }}>
              {decisionCards.map((card) => (
                <div key={card.key} style={{ background: "var(--band-card)", borderRadius: 14, padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--signal)" }} />
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", color: "var(--signal)", textTransform: "uppercase" }}>{card.label}</span>
                  </div>
                  <div style={{ fontSize: 13.5, color: "var(--band-ink)", fontWeight: 600, marginTop: 7, lineHeight: 1.4 }}>{card.title}</div>
                  <div style={{ fontSize: 11.5, color: "var(--band-ink-2)", marginTop: 4 }}>{card.detail}</div>
                  <Link
                    to={card.to}
                    style={{ display: "block", textAlign: "center", marginTop: 11, padding: "8px 0", borderRadius: 9, background: "#3a322d", color: "var(--band-ink)", fontSize: 12, fontWeight: 600, textDecoration: "none" }}
                  >
                    {card.cta}
                  </Link>
                </div>
              ))}
            </div>
          </Band>
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <Eyebrow>Today, studio-wide</Eyebrow>
          <button type="button" onClick={() => setForceDesktop(true)} style={linkButtonStyle}>
            Full calendar (web) →
          </button>
        </div>
        <div className="card" style={{ marginTop: 10, border: "1px solid var(--hairline)", borderRadius: 16, padding: "2px 16px" }}>
          {todayEvents === null ? (
            <p style={{ padding: "13px 0", color: "var(--ink-2)", fontSize: 13 }}>Loading…</p>
          ) : todayEvents.length === 0 ? (
            <p style={{ padding: "13px 0", color: "var(--ink-2)", fontSize: 13 }}>Nothing scheduled today.</p>
          ) : (
            todayEvents.map((e, i) => (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: i === 0 ? "none" : "1px solid var(--hairline)" }}>
                <div className="font-display" style={{ fontWeight: 700, fontSize: 12.5, color: "var(--ink-2)", width: 52, flexShrink: 0 }}>
                  {formatTimeInZone(e.starts_at, studio.timezone).main}
                  {formatTimeInZone(e.starts_at, studio.timezone).meridiem}
                </div>
                <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600 }}>{e.title ?? eventTypeLabel(e.event_type)}</div>
                {e.spaceName && <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{e.spaceName}</div>}
              </div>
            ))
          )}
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <Eyebrow>Quick actions</Eyebrow>
        <div style={{ marginTop: 11, display: "flex", flexDirection: "column", gap: 9 }}>
          <QuickAction to="/teams" label="Teams & groups" icon={<TeamsIcon />} />
          <QuickAction to="/roster" label="Look up someone" icon={<SearchIcon />} />
          <QuickAction to="/broadcast" label="Broadcast to studio" icon={<BroadcastIcon />} />
        </div>
        <p style={{ marginTop: 12, fontSize: 11, color: "var(--ink-3)", lineHeight: 1.5 }}>
          Everything else — the competition wizards, creating a Team/Comp Team/Competition, join codes, Studio & dance styles, editing a person's record — opens the full web console; a bigger screen is where that work actually gets done, not a phone in a hallway.
        </p>
      </div>

      <div style={{ marginTop: 26 }}>
        <button
          type="button"
          onClick={() => setForceDesktop(true)}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 9, padding: "14px 20px", borderRadius: 12, background: "var(--band)", color: "var(--band-ink)", fontSize: 13.5, fontWeight: 700, border: "none", cursor: "pointer" }}
        >
          <ConsoleIcon />
          Switch to full console
        </button>
      </div>
    </div>
  );
}

function greetingFor(timeZone: string): string {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hour12: false }).format(new Date()));
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function eventTypeLabel(eventType: string): string {
  if (eventType === "class") return "Class";
  if (eventType === "rehearsal") return "Rehearsal";
  if (eventType === "call_time") return "Call time";
  return "Studio time";
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "var(--font-display)", fontSize: 10.5, letterSpacing: "0.11em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>
      {children}
    </div>
  );
}

function QuickAction({ to, label, icon }: { to: string; label: string; icon: React.ReactNode }) {
  return (
    <Link to={to} style={{ display: "flex", alignItems: "center", gap: 12, borderRadius: 13, padding: "14px 16px", fontSize: 13.5, fontWeight: 700, background: "var(--sand)", color: "var(--ink)", textDecoration: "none" }}>
      {icon}
      {label}
      <ChevronIcon />
    </Link>
  );
}

const linkButtonStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "var(--signal-deep)",
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: 0,
};

function ChevronIcon() {
  return (
    <svg style={{ width: 15, height: 15, color: "var(--ink-3)", flexShrink: 0, marginLeft: "auto" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function TeamsIcon() {
  return (
    <svg style={{ width: 18, height: 18, flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
      <path d="M4 21V9l8-6 8 6v12" />
      <path d="M9 21v-7h6v7" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg style={{ width: 18, height: 18, flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
      <circle cx="9" cy="8" r="3.4" />
      <path d="M2 20a7 7 0 0114 0M17 11a3 3 0 100-6M22 20a5.5 5.5 0 00-4-5.3" />
    </svg>
  );
}

function BroadcastIcon() {
  return (
    <svg style={{ width: 18, height: 18, flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
      <path d="M3 11l18-8-8 18-2-8z" />
    </svg>
  );
}

function ConsoleIcon() {
  return (
    <svg style={{ width: 16, height: 16 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <rect x="2" y="4" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 18v3" />
    </svg>
  );
}
