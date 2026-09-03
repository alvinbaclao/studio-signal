import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthProvider";
import { useTeamsIndexData } from "../lib/useTeamsIndexData";
import { formatShortDate } from "../lib/format";

interface UnreadCounts {
  studio: number;
  byTeam: Map<string, number>;
  byCompTeam: Map<string, number>;
}

// Ports design-reference/DirectorTeamsMobile.dc.html — the mobile browse
// point DirectorHomeMobile's Quick actions needs: a Director scoped over
// every destination (not just "my" teams, since a Director isn't
// enrolled in any — same reasoning as Deficiency #18's fix). See
// BUILD_PLAN.md Task 25. Renders at the same "/teams" route as
// TeamsIndex, swapped by useViewport (App.tsx) — nothing rebuilt for the
// destinations themselves: tapping a row still opens that Team/Comp
// Team's own real Home (TeamHome/CompTeamHome), already built and
// already responsive.
//
// The artboard's "4 new"/"All read" marker is real now that Bulletin
// read-tracking exists (post_read_state, docs/DEFICIENCIES.md #27,
// resolved) — per destination, how many of its posts this Director has
// no read-state row for. Computed here directly rather than through
// DirectorHome's own "Messaging oversight" (still a static placeholder,
// unrelated — that's Messaging, not Bulletin).
export function DirectorTeamsMobile() {
  const { person } = useAuth();
  const { data } = useTeamsIndexData();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [unread, setUnread] = useState<UnreadCounts | null>(null);

  useEffect(() => {
    if (!person) return;
    let cancelled = false;
    async function load() {
      const [{ data: postRows }, { data: readRows }] = await Promise.all([
        supabase.from("post").select("id, scope, team_id, comp_team_id").is("deleted_at", null),
        supabase.from("post_read_state").select("post_id").eq("person_id", person!.id),
      ]);
      if (cancelled) return;
      const readIds = new Set((readRows ?? []).map((r) => r.post_id));
      const counts: UnreadCounts = { studio: 0, byTeam: new Map(), byCompTeam: new Map() };
      for (const p of postRows ?? []) {
        if (readIds.has(p.id)) continue;
        if (p.scope === "studio") counts.studio += 1;
        else if (p.scope === "team" && p.team_id) counts.byTeam.set(p.team_id, (counts.byTeam.get(p.team_id) ?? 0) + 1);
        else if (p.scope === "comp_team" && p.comp_team_id) counts.byCompTeam.set(p.comp_team_id, (counts.byCompTeam.get(p.comp_team_id) ?? 0) + 1);
      }
      if (!cancelled) setUnread(counts);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [person]);

  const q = search.trim().toLowerCase();
  const teams = useMemo(() => (data?.teams ?? []).filter((t) => !q || t.name.toLowerCase().includes(q)), [data, q]);
  const compTeams = useMemo(() => (data?.compTeams ?? []).filter((c) => !q || c.name.toLowerCase().includes(q)), [data, q]);
  const competitions = useMemo(() => (data?.competitions ?? []).filter((c) => !q || c.name.toLowerCase().includes(q)), [data, q]);

  if (!data) return null;

  return (
    <div style={{ padding: "18px 20px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div role="button" onClick={() => navigate(-1)} style={{ cursor: "pointer", color: "var(--ink-2)" }}>
          <BackIcon />
        </div>
        <div>
          <h2 style={{ fontSize: 19 }}>Teams &amp; groups</h2>
          <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>Every Team, Comp Team &amp; Competition · studio-wide</div>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: 13, padding: "11px 14px" }}>
          <SearchIcon />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search teams & groups…"
            style={{ border: "none", background: "none", outline: "none", fontSize: 13.5, flex: 1, color: "var(--ink)" }}
          />
        </div>
      </div>

      <div style={{ marginTop: 22 }}>
        <Link
          to="/studio"
          style={{ display: "flex", alignItems: "center", gap: 13, borderRadius: 18, background: "var(--band)", boxShadow: "0 4px 14px -6px rgba(44,32,12,.22)", padding: "14px 16px", textDecoration: "none" }}
        >
          <Swatch bg="var(--signal)" color="var(--signal-ink)">
            <StudioIcon />
          </Swatch>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--band-ink)" }}>Studio</div>
            <div style={{ fontSize: 11.5, color: "var(--band-ink-2)", marginTop: 2 }}>Whole-studio posts, media &amp; essentials</div>
          </div>
          {unread &&
            (unread.studio > 0 ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 700, color: "var(--signal)", flexShrink: 0, whiteSpace: "nowrap" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--signal)" }} />
                {unread.studio} new
              </span>
            ) : (
              <span style={{ fontSize: 10.5, color: "var(--band-ink-2)", flexShrink: 0, whiteSpace: "nowrap" }}>All read</span>
            ))}
          <ChevronIcon color="var(--band-ink-2)" />
        </Link>
      </div>

      <Section title={`Teams · ${teams.length}`}>
        {teams.length === 0 ? (
          <EmptyRow text="No Teams yet." />
        ) : (
          teams.map((t, i) => (
            <Row key={t.id} to={`/team/${t.id}`} i={i} initials={t.name} trailing={unread && <UnreadMarker count={unread.byTeam.get(t.id) ?? 0} />}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{t.name}</div>
              <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                {[t.level, t.instructorNames.length > 0 ? t.instructorNames.join(", ") : "instructor not yet assigned", `${t.dancerCount} ${t.dancerCount === 1 ? "dancer" : "dancers"}`].filter(Boolean).join(" · ")}
              </div>
            </Row>
          ))
        )}
      </Section>

      <Section title={`Comp Teams · Solo/Duo/Trio/Group · ${compTeams.length}`}>
        {compTeams.length === 0 ? (
          <EmptyRow text="No Comp Teams yet." />
        ) : (
          compTeams.map((c, i) => (
            <Row key={c.id} to={`/comp-team/${c.id}`} i={i} initials={c.name} trailing={unread && <UnreadMarker count={unread.byCompTeam.get(c.id) ?? 0} />}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{c.name}</div>
              <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                {[c.choreographerNames.length > 0 ? c.choreographerNames.join(", ") : "not yet assigned", `${c.dancerCount} ${c.dancerCount === 1 ? "dancer" : "dancers"}`].join(" · ")}
              </div>
            </Row>
          ))
        )}
      </Section>

      <Section title={`Dance Competitions · ${competitions.length}`}>
        {competitions.length === 0 ? (
          <EmptyRow text="No Dance Competitions yet." />
        ) : (
          competitions.map((c, i) => (
            <Row key={c.id} to={`/competition/${c.id}`} i={i} initials={c.name}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{c.name}</div>
              <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                {[c.venue_name, formatShortDate(c.starts_on), `${c.enteredCompTeamNames.length} entered`].filter(Boolean).join(" · ")}
              </div>
            </Row>
          ))
        )}
        <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 10, lineHeight: 1.5 }}>
          Entries, call times, and creating a new competition still open the full web console — this is for checking in, not managing.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 10.5, letterSpacing: "0.11em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 700 }}>{title}</div>
      <div style={{ marginTop: 11, borderRadius: 18, background: "var(--surface)", boxShadow: "0 4px 14px -6px rgba(44,32,12,.22)", overflow: "hidden" }}>{children}</div>
    </div>
  );
}

function Row({ to, i, initials, trailing, children }: { to: string; i: number; initials: string; trailing?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link to={to} style={{ display: "flex", alignItems: "center", gap: 13, padding: "13px 16px", borderTop: i === 0 ? "none" : "1px solid var(--sand)", color: "inherit", textDecoration: "none" }}>
      <Swatch bg="var(--sand)" color="var(--ink-2)">
        {initials
          .split(/\s+/)
          .slice(0, 2)
          .map((w) => w[0])
          .join("")
          .toUpperCase()}
      </Swatch>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      {trailing}
      <ChevronIcon />
    </Link>
  );
}

function UnreadMarker({ count }: { count: number }) {
  return count > 0 ? (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 700, color: "var(--signal-deep)", flexShrink: 0, whiteSpace: "nowrap" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--signal-deep)" }} />
      {count} new
    </span>
  ) : (
    <span style={{ fontSize: 10.5, color: "var(--ink-3)", flexShrink: 0, whiteSpace: "nowrap" }}>All read</span>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p style={{ padding: "13px 16px", color: "var(--ink-2)", fontSize: 13 }}>{text}</p>;
}

function Swatch({ bg, color, children }: { bg: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ width: 44, height: 44, borderRadius: 13, flexShrink: 0, background: bg, color, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13 }}>
      {children}
    </div>
  );
}

function BackIcon() {
  return (
    <svg style={{ width: 20, height: 20 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg style={{ width: 16, height: 16, color: "var(--ink-3)", flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function StudioIcon() {
  return (
    <svg style={{ width: 21, height: 21 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round">
      <path d="M4 21V9l8-6 8 6v12" />
      <path d="M9 21v-7h6v7" />
    </svg>
  );
}

function ChevronIcon({ color = "var(--ink-3)" }: { color?: string }) {
  return (
    <svg style={{ width: 16, height: 16, color, flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}
