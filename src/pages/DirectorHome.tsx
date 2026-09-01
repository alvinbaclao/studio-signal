import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthProvider";
import { Band } from "../components/Band";
import { Avatar } from "../components/Avatar";

interface DecisionCard {
  key: string;
  label: string;
  title: string;
  detail: string;
  cta: string;
  to: string;
}

interface RosterPreviewRow {
  id: string;
  full_name: string;
  role: string;
}

interface DirectorHomeData {
  peopleCount: number;
  teamCount: number;
  compTeamCount: number;
  competitionCount: number;
  pendingPersonCount: number;
  pendingBookingCount: number;
  missingCallTimeCount: number;
  hasJoinCode: boolean;
  hasDancer: boolean;
  rosterPreview: RosterPreviewRow[];
}

const ROLE_LABEL: Record<string, string> = {
  director: "Director",
  instructor: "Instructor",
  dancer: "Dancer",
  parent: "Parent",
};

// Ports design-reference/DirectorHome.dc.html. The dark band aggregates
// real pending-decision counts (pending person registrations, pending
// booking requests, competition entries missing a call time) rather than
// restating the screens that own each item — those screens land in Tasks
// 5/13/23. A brand-new studio (no Teams yet) sees a setup checklist in the
// band's place instead; see BUILD_PLAN.md Task 3.
export function DirectorHome() {
  const { person } = useAuth();
  const [data, setData] = useState<DirectorHomeData | null>(null);

  useEffect(() => {
    if (!person) return;
    let cancelled = false;

    async function load() {
      const studioId = person!.studio_id;

      const [
        peopleCount,
        teamCount,
        compTeamCount,
        competitionCount,
        pendingPersonCount,
        pendingBookingCount,
        joinCodeRows,
        dancerRows,
        rosterRows,
        publishedCompetitions,
      ] = await Promise.all([
        supabase.from("person").select("id", { count: "exact", head: true }).eq("status", "confirmed"),
        supabase.from("team").select("id", { count: "exact", head: true }),
        supabase.from("comp_team").select("id", { count: "exact", head: true }),
        supabase.from("competition").select("id", { count: "exact", head: true }),
        supabase.from("person").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("booking_request").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("studio_join_code").select("id").eq("studio_id", studioId).limit(1),
        supabase
          .from("person_role_assignment")
          .select("person_id")
          .eq("role", "dancer")
          .limit(1),
        supabase
          .from("person")
          .select("id, full_name")
          .eq("status", "confirmed")
          .order("created_at", { ascending: false })
          .limit(4),
        supabase.from("competition").select("id").not("published_at", "is", null),
      ]);

      let missingCallTimeCount = 0;
      const publishedIds = (publishedCompetitions.data ?? []).map((c) => c.id);
      if (publishedIds.length > 0) {
        const { count } = await supabase
          .from("competition_entry")
          .select("id", { count: "exact", head: true })
          .is("call_time", null)
          .in("competition_id", publishedIds);
        missingCallTimeCount = count ?? 0;
      }

      let rosterPreview: RosterPreviewRow[] = [];
      const rows = rosterRows.data ?? [];
      if (rows.length > 0) {
        const { data: roleRows } = await supabase
          .from("person_role_assignment")
          .select("person_id, role")
          .in("person_id", rows.map((r) => r.id));
        const roleByPerson = new Map<string, string>();
        for (const r of roleRows ?? []) {
          if (!roleByPerson.has(r.person_id)) roleByPerson.set(r.person_id, r.role);
        }
        rosterPreview = rows.map((r) => ({
          id: r.id,
          full_name: r.full_name,
          role: ROLE_LABEL[roleByPerson.get(r.id) ?? ""] ?? "Member",
        }));
      }

      if (cancelled) return;
      setData({
        peopleCount: peopleCount.count ?? 0,
        teamCount: teamCount.count ?? 0,
        compTeamCount: compTeamCount.count ?? 0,
        competitionCount: competitionCount.count ?? 0,
        pendingPersonCount: pendingPersonCount.count ?? 0,
        pendingBookingCount: pendingBookingCount.count ?? 0,
        missingCallTimeCount,
        hasJoinCode: (joinCodeRows.data ?? []).length > 0,
        hasDancer: (dancerRows.data ?? []).length > 0,
        rosterPreview,
      });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [person]);

  const isEmptyStudio = data ? data.teamCount === 0 : false;

  const decisionCards: DecisionCard[] = data
    ? [
        data.pendingPersonCount > 0
          ? {
              key: "pending-people",
              label: `${data.pendingPersonCount} waiting`,
              title: "Pending registrations",
              detail:
                data.pendingPersonCount === 1
                  ? "1 person is waiting to be confirmed"
                  : `${data.pendingPersonCount} people are waiting to be confirmed`,
              cta: "Review queue",
              to: "/confirm-queue",
            }
          : null,
        data.pendingBookingCount > 0
          ? {
              key: "pending-bookings",
              label: `${data.pendingBookingCount} pending`,
              title: "Booking requests",
              detail:
                data.pendingBookingCount === 1
                  ? "1 instructor is waiting on a studio-time decision"
                  : `${data.pendingBookingCount} instructors are waiting on a studio-time decision`,
              cta: "Review",
              to: "/studio-calendar",
            }
          : null,
        data.missingCallTimeCount > 0
          ? {
              key: "missing-call-times",
              label: "Not set yet",
              title: "Call times",
              detail:
                data.missingCallTimeCount === 1
                  ? "1 published entry has no call time"
                  : `${data.missingCallTimeCount} published entries have no call time`,
              cta: "Set times",
              to: "/competitions",
            }
          : null,
      ].filter((c): c is DecisionCard => c !== null)
    : [];

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
            <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 12 }}>
              Nothing scheduled this week.
            </p>
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
              <QuickAction to="/messages" label="Broadcast to studio" />
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
