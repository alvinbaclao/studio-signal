import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useStudio } from "../lib/useStudio";
import { formatTimeInZone, weekRangeInZone } from "../lib/format";
import { Band } from "../components/Band";
import { Avatar } from "../components/Avatar";
import { useDirectorHome, type DirectorHomeData } from "../lib/useDirectorHome";

interface WeekEvent {
  id: string;
  title: string | null;
  event_type: string;
  starts_at: string;
  spaceName: string | null;
}

// Ports design-reference/DirectorHome.dc.html. The dark band aggregates
// real pending-decision counts (pending person registrations, pending
// booking requests, competition entries missing a call time) rather than
// restating the screens that own each item — those screens land in Tasks
// 5/13/23. A brand-new studio (no Teams yet) sees a setup checklist in the
// band's place instead; see BUILD_PLAN.md Task 3. Data/decisionCards now
// come from useDirectorHome, shared with DirectorHomeMobile (Task 25) so
// both show the exact same real counts, not two queries that could drift.
export function DirectorHome() {
  const { data, decisionCards, isEmptyStudio } = useDirectorHome();
  const studio = useStudio();
  const [weekEvents, setWeekEvents] = useState<WeekEvent[] | null>(null);

  // Real, RLS-scoped, no-destination-filter event query — same shape
  // HomeUnified/GlobalSchedule already use — replacing the card's old
  // hardcoded "Nothing scheduled this week." (docs/DEFICIENCIES.md #38).
  useEffect(() => {
    if (!studio) return;
    let cancelled = false;
    async function load() {
      const { start, end } = weekRangeInZone(new Date(), studio!.timezone);
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
      setWeekEvents((eventRows ?? []).map((e) => ({ id: e.id, title: e.title, event_type: e.event_type, starts_at: e.starts_at, spaceName: e.studio_space_id ? spaceName.get(e.studio_space_id) ?? null : null })));
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [studio]);

  return (
    <div style={{ padding: "18px 34px 30px" }}>
      {data && isEmptyStudio && (
        <Band>
          <SetupChecklist data={data} />
        </Band>
      )}
      {data && !isEmptyStudio && decisionCards.length > 0 && (
        <Band>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 10.5,
                letterSpacing: "0.11em",
                textTransform: "uppercase",
                color: "var(--band-ink-2)",
                fontWeight: 600,
              }}
            >
              Needs a decision · {decisionCards.length}
            </div>
            <span style={{ fontSize: 12, color: "var(--band-ink-2)" }}>
              Clear these and this block disappears
            </span>
          </div>

          <div
            style={{
              marginTop: 15,
              display: "grid",
              gridTemplateColumns: `repeat(${decisionCards.length}, 1fr)`,
              gap: 14,
            }}
          >
            {decisionCards.map((card) => (
              <div
                key={card.key}
                style={{ background: "var(--band-card)", borderRadius: 14, padding: "16px 17px" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: "var(--signal)",
                    }}
                  />
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.05em",
                      color: "var(--signal)",
                      textTransform: "uppercase",
                    }}
                  >
                    {card.label}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 14.5,
                    color: "var(--band-ink)",
                    fontWeight: 600,
                    marginTop: 9,
                    lineHeight: 1.4,
                  }}
                >
                  {card.title}
                </div>
                <div style={{ fontSize: 12, color: "var(--band-ink-2)", marginTop: 5 }}>
                  {card.detail}
                </div>
                <Link
                  to={card.to}
                  style={{
                    display: "inline-block",
                    marginTop: 13,
                    padding: "7px 15px",
                    borderRadius: 9,
                    background: "#3a322d",
                    color: "var(--band-ink)",
                    fontSize: 12.5,
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  {card.cta}
                </Link>
              </div>
            ))}
          </div>
        </Band>
      )}

      <div
        style={{
          marginTop: 24,
          display: "grid",
          gridTemplateColumns: "1.35fr 1fr",
          gap: 20,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="card" style={{ border: "1px solid var(--hairline)", borderRadius: 16, padding: "18px 22px 20px" }}>
            <Eyebrow>Today &amp; this week, studio-wide</Eyebrow>
            {weekEvents === null ? (
              <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 12 }}>Loading…</p>
            ) : weekEvents.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 12 }}>
                Nothing scheduled this week.
              </p>
            ) : (
              <>
                <div style={{ marginTop: 12 }}>
                  {weekEvents.slice(0, 5).map((e, i) => (
                    <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderTop: i === 0 ? "none" : "1px solid var(--hairline)" }}>
                      <div className="font-display" style={{ fontWeight: 700, fontSize: 12.5, color: "var(--ink-2)", width: 84, flexShrink: 0 }}>
                        {weekdayShort(e.starts_at, studio!.timezone)} {formatTimeInZone(e.starts_at, studio!.timezone).main}
                        {formatTimeInZone(e.starts_at, studio!.timezone).meridiem}
                      </div>
                      <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600 }}>{e.title ?? eventTypeLabel(e.event_type)}</div>
                      {e.spaceName && <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{e.spaceName}</div>}
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    marginTop: 13,
                    paddingTop: 13,
                    borderTop: "1px solid var(--hairline)",
                    fontSize: 12,
                    color: "var(--ink-2)",
                    fontWeight: 600,
                  }}
                >
                  {weekEvents.length} this week · <Link to="/schedule">View full schedule &rsaquo;</Link>
                </div>
              </>
            )}
          </div>

          <div className="card" style={{ border: "1px solid var(--hairline)", borderRadius: 16, padding: "18px 22px 20px" }}>
            <Eyebrow>Roster &amp; directory</Eyebrow>
            {data && data.rosterPreview.length > 0 ? (
              <>
                <div
                  style={{
                    marginTop: 14,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 13,
                  }}
                >
                  {data.rosterPreview.map((p) => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 11 }}>
                      <Avatar name={p.full_name} size={32} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{p.full_name}</div>
                        <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{p.role}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    marginTop: 15,
                    paddingTop: 13,
                    borderTop: "1px solid var(--hairline)",
                    fontSize: 12,
                    color: "var(--ink-2)",
                    fontWeight: 600,
                  }}
                >
                  {data.peopleCount} people · <Link to="/roster">See full roster &rsaquo;</Link>
                </div>
              </>
            ) : (
              <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 12 }}>
                No one has been confirmed yet — rotate a join code or send an invite to get started.
              </p>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="card" style={{ border: "1px solid var(--hairline)", borderRadius: 16, padding: "18px 22px 20px" }}>
            <Eyebrow>Studio at a glance</Eyebrow>
            <div
              style={{
                marginTop: 15,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "18px 14px",
              }}
            >
              <Stat n={data?.peopleCount ?? 0} label="People" />
              <Stat n={data?.teamCount ?? 0} label="Teams" />
              <Stat n={data?.compTeamCount ?? 0} label="Comp Teams" />
              <Stat n={data?.competitionCount ?? 0} label="Dance Competitions" />
            </div>
          </div>

          <div className="card" style={{ border: "1px solid var(--hairline)", borderRadius: 16, padding: "18px 22px 20px" }}>
            <Eyebrow>Quick actions</Eyebrow>
            <div style={{ marginTop: 13, display: "flex", flexDirection: "column", gap: 9 }}>
              <QuickAction to="/teams" label="Teams & Competitions" primary />
              <QuickAction to="/invite-someone" label="Invite someone" />
              <QuickAction to="/broadcast" label="Broadcast to studio" />
            </div>
          </div>

          <div className="card" style={{ border: "1px solid var(--hairline)", borderRadius: 16, padding: "18px 22px 20px" }}>
            <Eyebrow>Messaging oversight</Eyebrow>
            <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 12 }}>
              No conversations yet.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SetupChecklist({ data }: { data: DirectorHomeData }) {
  const items = [
    { label: "Rotate your first join codes", done: data.hasJoinCode, to: "/settings" },
    { label: "Create your first Team", done: false, to: "/teams" },
    { label: "Add your first dancers", done: data.hasDancer, to: "/invite-someone" },
  ];

  return (
    <div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 10.5,
          letterSpacing: "0.11em",
          textTransform: "uppercase",
          color: "var(--band-ink-2)",
          fontWeight: 600,
        }}
      >
        Get your studio set up
      </div>
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((item) => (
          <Link
            key={item.label}
            to={item.to}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              textDecoration: "none",
              color: item.done ? "var(--band-ink-2)" : "var(--band-ink)",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                border: `1.5px solid ${item.done ? "var(--signal)" : "var(--band-ink-2)"}`,
                background: item.done ? "var(--signal)" : "transparent",
                flexShrink: 0,
              }}
            />
            <span style={{ textDecoration: item.done ? "line-through" : "none" }}>
              {item.label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function weekdayShort(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(new Date(iso));
}

function eventTypeLabel(eventType: string): string {
  if (eventType === "class") return "Class";
  if (eventType === "rehearsal") return "Rehearsal";
  if (eventType === "call_time") return "Call time";
  return "Studio time";
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

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 34,
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {n}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 4 }}>{label}</div>
    </div>
  );
}

function QuickAction({ to, label, primary }: { to: string; label: string; primary?: boolean }) {
  return (
    <Link
      to={to}
      style={{
        background: primary ? "var(--signal)" : "var(--sand)",
        color: primary ? "var(--signal-ink)" : "var(--ink)",
        borderRadius: 12,
        padding: "13px 16px",
        display: "flex",
        alignItems: "center",
        fontSize: 13.5,
        fontWeight: primary ? 700 : 600,
        textDecoration: "none",
      }}
    >
      {label}
    </Link>
  );
}
