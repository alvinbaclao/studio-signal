import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, callApp } from "../lib/supabase";
import { useAuth, hasRole } from "../lib/AuthProvider";
import { useStudio } from "../lib/useStudio";
import {
  formatLongDateInZone,
  formatTimeInZone,
  weekRangeInZone,
  zonedDateKey,
} from "../lib/format";
import { Band } from "../components/Band";
import { Avatar } from "../components/Avatar";
import { ScheduleRow } from "../components/ScheduleRow";

type ChipTone = "instructor" | "parent";

interface DestRole {
  chipLabel: string;
  chipTone: ChipTone;
  namePrefix: string | null; // linked dancer's first name, for a parent-flavored item
}

interface DestCard {
  kind: "team" | "comp_team";
  id: string;
  name: string;
  meta: string;
  role: DestRole;
}

interface RawEvent {
  id: string;
  title: string | null;
  event_type: string;
  starts_at: string;
  ends_at: string;
  team_id: string | null;
  comp_team_id: string | null;
  studio_wide: boolean;
}

interface AttentionItem {
  key: string;
  icon: "wait" | "busy";
  title: string;
  detail: string;
  chipLabel: string;
  chipTone: ChipTone;
}

interface HighlightItem {
  id: string;
  caption: string | null;
  kind: string;
}

interface InboxThread {
  id: string;
  subject: string | null;
  scope: string;
}

// Ports design-reference/HomeUnified.dc.html — the data-dense list layout,
// not HomeUnifiedVisual.dc.html's photo-hero treatment, since this app has
// no way to back real photos yet (no Storage bucket — see
// docs/DEFICIENCIES.md #2) and every other screen already uses the plain
// list language. One Home for every non-Director role — see BUILD_PLAN.md
// Task 14. Role chips are resolved per destination, not per account, so a
// dual-role person sees the correct chip on every single row.
export function HomeUnified() {
  const { person } = useAuth();
  const studio = useStudio();

  const [destCards, setDestCards] = useState<DestCard[] | null>(null);
  const [roleByDest, setRoleByDest] = useState<Map<string, DestRole> | null>(null);
  const [weekEvents, setWeekEvents] = useState<RawEvent[] | null>(null);
  const [attention, setAttention] = useState<AttentionItem[] | null>(null);
  const [highlights, setHighlights] = useState<HighlightItem[] | null>(null);
  const [inboxThreads, setInboxThreads] = useState<InboxThread[] | null>(null);

  // Destinations this person belongs to, each resolved to exactly one role
  // chip. Reused for both "My teams & dances" and for chipping every
  // Next-up/This-week row below.
  useEffect(() => {
    if (!person) return;
    const personId = person.id;
    let cancelled = false;
    async function load() {
      const isParent = hasRole(person, "parent");

      const [{ data: teamIds }, { data: teachIds }, { data: compTeamIds }, { data: choreographIds }] = await Promise.all([
        callApp<string[]>("teams_i_can_see"),
        callApp<string[]>("teams_i_teach"),
        callApp<string[]>("comp_teams_i_can_see"),
        callApp<string[]>("comp_teams_i_choreograph"),
      ]);
      const teachSet = new Set(teachIds ?? []);
      const choreographSet = new Set(choreographIds ?? []);

      const [{ data: teamRows }, { data: compTeamRows }] = await Promise.all([
        (teamIds ?? []).length > 0
          ? supabase.from("team").select("id, name, level").in("id", teamIds!)
          : Promise.resolve({ data: [] as { id: string; name: string; level: string | null }[] }),
        (compTeamIds ?? []).length > 0
          ? supabase.from("comp_team").select("id, name, comp_team_type").in("id", compTeamIds!)
          : Promise.resolve({ data: [] as { id: string; name: string; comp_team_type: string }[] }),
      ]);

      // Which of these am I a dancer on myself (an adult dancer, say), and
      // which am I a parent of via a linked dancer? Both need team_member/
      // comp_team_cast lookups — my own, and each linked dancer's.
      const [{ data: myTeamMemberRows }, { data: myCastRows }, { data: guardianRows }] = await Promise.all([
        supabase.from("team_member").select("team_id").eq("person_id", personId).eq("role", "dancer"),
        supabase.from("comp_team_cast").select("comp_team_id").eq("person_id", personId).eq("role", "dancer"),
        isParent
          ? supabase.from("guardian_link").select("dancer_id, dancer:dancer_id(full_name)").eq("guardian_id", personId)
          : Promise.resolve({ data: [] as { dancer_id: string; dancer: { full_name: string } | null }[] }),
      ]);
      const myDancerTeamIds = new Set((myTeamMemberRows ?? []).map((r) => r.team_id));
      const myDancerCompTeamIds = new Set((myCastRows ?? []).map((r) => r.comp_team_id));

      const dancerIds = (guardianRows ?? []).map((g) => g.dancer_id);
      const dancerFirstName = new Map(
        (guardianRows ?? []).map((g) => [g.dancer_id, (g.dancer?.full_name ?? "").split(" ")[0]])
      );
      let dancerTeamIds = new Map<string, string>(); // team_id -> dancer_id (first match wins)
      let dancerCompTeamIds = new Map<string, string>();
      if (dancerIds.length > 0) {
        const [{ data: dTeamRows }, { data: dCastRows }] = await Promise.all([
          supabase.from("team_member").select("team_id, person_id").in("person_id", dancerIds).eq("role", "dancer"),
          supabase.from("comp_team_cast").select("comp_team_id, person_id").in("person_id", dancerIds).eq("role", "dancer"),
        ]);
        for (const r of dTeamRows ?? []) if (!dancerTeamIds.has(r.team_id)) dancerTeamIds.set(r.team_id, r.person_id);
        for (const r of dCastRows ?? []) if (!dancerCompTeamIds.has(r.comp_team_id)) dancerCompTeamIds.set(r.comp_team_id, r.person_id);
      }

      function resolveRole(kind: "team" | "comp_team", id: string): DestRole {
        if (kind === "team" && teachSet.has(id)) return { chipLabel: "Instructor", chipTone: "instructor", namePrefix: null };
        if (kind === "comp_team" && choreographSet.has(id)) return { chipLabel: "Choreographer", chipTone: "instructor", namePrefix: null };
        if (kind === "team" && myDancerTeamIds.has(id)) return { chipLabel: "Dancer", chipTone: "parent", namePrefix: null };
        if (kind === "comp_team" && myDancerCompTeamIds.has(id)) return { chipLabel: "Dancer", chipTone: "parent", namePrefix: null };
        const dancerId = kind === "team" ? dancerTeamIds.get(id) : dancerCompTeamIds.get(id);
        if (dancerId) return { chipLabel: "Parent", chipTone: "parent", namePrefix: dancerFirstName.get(dancerId) ?? null };
        return { chipLabel: "Dancer", chipTone: "parent", namePrefix: null };
      }

      const map = new Map<string, DestRole>();
      const cards: DestCard[] = [];
      for (const t of teamRows ?? []) {
        const role = resolveRole("team", t.id);
        map.set(`team:${t.id}`, role);
        cards.push({ kind: "team", id: t.id, name: t.name, meta: t.level ?? "Team", role });
      }
      for (const c of compTeamRows ?? []) {
        const role = resolveRole("comp_team", c.id);
        map.set(`comp_team:${c.id}`, role);
        cards.push({ kind: "comp_team", id: c.id, name: c.name, meta: c.comp_team_type, role });
      }

      if (cancelled) return;
      setDestCards(cards);
      setRoleByDest(map);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [person]);

  // This week's events, across everything RLS shows this person.
  useEffect(() => {
    if (!person || !studio) return;
    let cancelled = false;
    const { start, end } = weekRangeInZone(new Date(), studio.timezone);
    supabase
      .from("event")
      .select("id, title, event_type, starts_at, ends_at, team_id, comp_team_id, studio_wide")
      .is("cancelled_at", null)
      .gte("starts_at", start.toISOString())
      .lt("starts_at", end.toISOString())
      .order("starts_at")
      .then(({ data }) => {
        if (!cancelled) setWeekEvents(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [person, studio]);

  // Needs your attention — this person's own outstanding booking_request
  // rows (pending, or recently declined). Nothing else is real yet: no
  // notification table exists for "urgent messages" or "schedule changes"
  // in general, so this stays scoped to what the schema actually tracks —
  // see BUILD_PLAN.md Task 14 and docs/DEFICIENCIES.md.
  useEffect(() => {
    if (!person) return;
    let cancelled = false;
    async function load() {
      const since = new Date(Date.now() - 14 * 86400000).toISOString();
      const { data: rows } = await supabase
        .from("booking_request")
        .select("id, status, decline_reason, team_id, comp_team_id, starts_at, preferred_space_id, reviewed_at")
        .eq("requested_by", person!.id)
        .in("status", ["pending", "declined"])
        .order("created_at", { ascending: false })
        .limit(6);
      const relevant = (rows ?? []).filter((r) => r.status === "pending" || (r.reviewed_at && r.reviewed_at >= since));
      if (relevant.length === 0) {
        if (!cancelled) setAttention([]);
        return;
      }
      const teamIds = [...new Set(relevant.filter((r) => r.team_id).map((r) => r.team_id!))];
      const compTeamIds = [...new Set(relevant.filter((r) => r.comp_team_id).map((r) => r.comp_team_id!))];
      const [{ data: teamRows }, { data: compTeamRows }] = await Promise.all([
        teamIds.length > 0 ? supabase.from("team").select("id, name").in("id", teamIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        compTeamIds.length > 0
          ? supabase.from("comp_team").select("id, name").in("id", compTeamIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      ]);
      const teamName = new Map((teamRows ?? []).map((t) => [t.id, t.name]));
      const compTeamName = new Map((compTeamRows ?? []).map((c) => [c.id, c.name]));
      if (cancelled) return;
      setAttention(
        relevant.map((r) => {
          const destName = (r.team_id && teamName.get(r.team_id)) || (r.comp_team_id && compTeamName.get(r.comp_team_id)) || "Studio";
          const chipTone: ChipTone = "instructor";
          const chipLabel = r.team_id ? "Instructor" : "Choreographer";
          if (r.status === "pending") {
            return {
              key: r.id,
              icon: "wait" as const,
              title: `${destName} · studio time request pending`,
              detail: "Waiting on the Director to review it",
              chipLabel,
              chipTone,
            };
          }
          return {
            key: r.id,
            icon: "busy" as const,
            title: `${destName} · studio time request declined`,
            detail: r.decline_reason ?? "No reason given",
            chipLabel,
            chipTone,
          };
        })
      );
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [person]);

  // Recent highlights — media_item is real, but there's no Storage bucket
  // yet (docs/DEFICIENCIES.md #2), so this is an honest empty state for
  // now, not faked content.
  useEffect(() => {
    if (!person) return;
    let cancelled = false;
    supabase
      .from("media_item")
      .select("id, caption, kind, created_at")
      .order("created_at", { ascending: false })
      .limit(4)
      .then(({ data }) => {
        if (!cancelled) setHighlights(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [person]);

  // Inbox preview — message_thread has no write path yet (docs/DEFICIENCIES.md
  // #1), so no thread can exist in real data yet; this query is real and
  // forward-compatible, not faked.
  useEffect(() => {
    if (!person) return;
    let cancelled = false;
    async function load() {
      const { data: participantRows } = await supabase.from("thread_participant").select("thread_id").eq("person_id", person!.id);
      const threadIds = (participantRows ?? []).map((r) => r.thread_id);
      if (threadIds.length === 0) {
        if (!cancelled) setInboxThreads([]);
        return;
      }
      const { data: threadRows } = await supabase.from("message_thread").select("id, subject, scope").in("id", threadIds).limit(4);
      if (!cancelled) setInboxThreads(threadRows ?? []);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [person]);

  const enrichedWeekEvents = useMemo(() => {
    if (!weekEvents || !roleByDest || !studio) return null;
    return weekEvents.map((e) => {
      const key = e.team_id ? `team:${e.team_id}` : e.comp_team_id ? `comp_team:${e.comp_team_id}` : null;
      const role = key ? roleByDest.get(key) : undefined;
      const displayTitle = role?.namePrefix ? `${role.namePrefix} — ${e.title ?? eventTypeLabel(e.event_type)}` : e.title ?? eventTypeLabel(e.event_type);
      return { event: e, role, displayTitle };
    });
  }, [weekEvents, roleByDest, studio]);

  const nextUp = useMemo(() => (enrichedWeekEvents ?? []).filter((r) => new Date(r.event.starts_at) >= new Date()).slice(0, 3), [enrichedWeekEvents]);

  if (!person || !studio) return null;

  const greeting = greetingFor(studio.timezone);
  const firstName = person.full_name.split(" ")[0];
  const todayLabel = formatLongDateInZone(new Date().toISOString(), studio.timezone);

  return (
    <div style={{ padding: "18px 20px 40px", maxWidth: 620 }}>
      <h2 className="font-display" style={{ fontSize: 21 }}>
        {greeting}, {firstName}
      </h2>
      <p style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 4 }}>{todayLabel}</p>

      {attention && attention.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <Eyebrow>Needs your attention</Eyebrow>
          <Band>
            {attention.map((item, i) => (
              <div
                key={item.key}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0", borderTop: i === 0 ? "none" : "1px solid var(--band-line)" }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: item.icon === "busy" ? "var(--busy-tint)" : "var(--wait-tint)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <AttentionIcon icon={item.icon} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--band-ink)" }}>{item.title}</div>
                  <div style={{ fontSize: 12, color: "var(--band-ink-2)", marginTop: 2 }}>{item.detail}</div>
                </div>
                <RoleChip label={item.chipLabel} tone={item.chipTone} onBand />
              </div>
            ))}
          </Band>
        </div>
      )}

      <div style={{ marginTop: 26 }}>
        <Eyebrow>Next up</Eyebrow>
        {nextUp.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 11 }}>Nothing coming up this week.</p>
        ) : (
          <div style={{ display: "flex", gap: 10, marginTop: 10, overflowX: "auto", paddingBottom: 2 }}>
            {nextUp.map(({ event, role, displayTitle }) => (
              <div key={event.id} className="card" style={{ flex: "0 0 168px", padding: "14px 15px", border: "1px solid var(--hairline)", borderRadius: 16 }}>
                {role && <RoleChip label={role.chipLabel} tone={role.chipTone} />}
                <div style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600, marginTop: role ? 8 : 0 }}>
                  {dayLabel(event.starts_at, studio.timezone)} · {formatTimeInZone(event.starts_at, studio.timezone).main}
                  {formatTimeInZone(event.starts_at, studio.timezone).meridiem.toUpperCase()}
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 3 }}>{displayTitle}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 26 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <Eyebrow>This week</Eyebrow>
          <Link to="/schedule" style={seeAllStyle}>
            View full schedule →
          </Link>
        </div>
        {enrichedWeekEvents === null ? (
          <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 11 }}>Loading…</p>
        ) : enrichedWeekEvents.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 11 }}>Nothing scheduled this week.</p>
        ) : (
          <div className="card" style={{ marginTop: 10, padding: "2px 16px", border: "1px solid var(--hairline)", borderRadius: 16 }}>
            {enrichedWeekEvents.map(({ event, role, displayTitle }) => (
              <ScheduleRow
                key={event.id}
                time={`${weekdayShort(event.starts_at, studio.timezone)} ${formatTimeInZone(event.starts_at, studio.timezone).main}${formatTimeInZone(event.starts_at, studio.timezone).meridiem}`}
                title={displayTitle}
                trailing={role ? <RoleChip label={role.chipLabel} tone={role.chipTone} /> : undefined}
              />
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 26 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <Eyebrow>My teams &amp; dances</Eyebrow>
          <Link to="/teams-and-dances" style={seeAllStyle}>
            See all →
          </Link>
        </div>
        {destCards === null ? (
          <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 11 }}>Loading…</p>
        ) : destCards.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 11 }}>Not on any Team or Comp Team yet.</p>
        ) : (
          <div className="card" style={{ marginTop: 10, padding: "2px 16px", border: "1px solid var(--hairline)", borderRadius: 16 }}>
            {destCards.slice(0, 4).map((d) => (
              <Link
                key={`${d.kind}:${d.id}`}
                to={d.kind === "team" ? `/team/${d.id}` : `/comp-team/${d.id}`}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0", borderTop: "1px solid var(--hairline)", color: "inherit" }}
              >
                <Avatar name={d.name} size={30} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>{d.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 1 }}>{d.meta}</div>
                </div>
                <RoleChip label={d.role.chipLabel} tone={d.role.chipTone} />
                <ChevronIcon />
              </Link>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 26 }}>
        <Eyebrow>Recent highlights</Eyebrow>
        {highlights === null ? (
          <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 11 }}>Loading…</p>
        ) : highlights.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 11 }}>
            No photos or videos yet — once your studio's Media library has some, they'll show up here.
          </p>
        ) : (
          <div style={{ display: "flex", gap: 10, marginTop: 10, overflowX: "auto", paddingBottom: 2 }}>
            {highlights.map((h) => (
              <div key={h.id} style={{ flex: "0 0 120px" }}>
                <div style={{ width: 120, height: 120, borderRadius: 12, background: "var(--sand)" }} />
                <div style={{ fontSize: 11.5, color: "var(--ink-2)", marginTop: 6 }}>{h.caption ?? h.kind}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 26 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <Eyebrow>Inbox</Eyebrow>
          <Link to="/messages" style={seeAllStyle}>
            Open Messaging →
          </Link>
        </div>
        {inboxThreads === null ? (
          <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 11 }}>Loading…</p>
        ) : inboxThreads.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 11 }}>No conversations yet.</p>
        ) : (
          <div className="card" style={{ marginTop: 10, padding: "2px 16px", border: "1px solid var(--hairline)", borderRadius: 16 }}>
            {inboxThreads.map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0", borderTop: "1px solid var(--hairline)" }}>
                <Avatar name={t.subject ?? t.scope} size={30} />
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700 }}>{t.subject ?? scopeLabel(t.scope)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RoleChip({ label, tone, onBand }: { label: string; tone: ChipTone; onBand?: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 10.5,
        fontWeight: 700,
        flexShrink: 0,
        background: tone === "instructor" ? "var(--band)" : onBand ? "#3a322d" : "var(--sand)",
        color: tone === "instructor" ? "var(--signal)" : onBand ? "var(--band-ink)" : "var(--ink-2)",
      }}
    >
      {label}
    </span>
  );
}

function AttentionIcon({ icon }: { icon: "wait" | "busy" }) {
  const color = icon === "busy" ? "var(--busy)" : "var(--wait)";
  return icon === "busy" ? (
    <svg style={{ width: 17, height: 17, color }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9L2.5 17a1.8 1.8 0 001.5 2.7h16a1.8 1.8 0 001.5-2.7L13.7 3.9a1.8 1.8 0 00-3.4 0z" />
    </svg>
  ) : (
    <svg style={{ width: 17, height: 17, color }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg style={{ width: 15, height: 15, color: "var(--ink-3)", flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
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

const seeAllStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "var(--signal-deep)" };

function eventTypeLabel(eventType: string): string {
  if (eventType === "class") return "Class";
  if (eventType === "rehearsal") return "Rehearsal";
  if (eventType === "call_time") return "Call time";
  return "Booking";
}

function greetingFor(timeZone: string): string {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", hour: "2-digit" }).format(new Date()));
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function dayLabel(iso: string, timeZone: string): string {
  const todayKey = zonedDateKey(new Date().toISOString(), timeZone);
  const key = zonedDateKey(iso, timeZone);
  if (key === todayKey) return "Today";
  const tomorrowKey = zonedDateKey(new Date(Date.now() + 86400000).toISOString(), timeZone);
  if (key === tomorrowKey) return "Tomorrow";
  return weekdayShort(iso, timeZone);
}

function weekdayShort(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(new Date(iso));
}

function scopeLabel(scope: string): string {
  if (scope === "team") return "Team chat";
  if (scope === "comp_team") return "Comp Team chat";
  if (scope === "studio") return "Studio";
  return "Direct message";
}
