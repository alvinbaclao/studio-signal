import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTeamsIndexData } from "../lib/useTeamsIndexData";
import { formatShortDate } from "../lib/format";

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
// The artboard's "4 new"/"All read" marker has no real data behind it —
// neither Bulletin read-tracking (Deficiency #27) nor DirectorHome's own
// "Messaging oversight" (a static placeholder, never wired to real data)
// exist yet — dropped rather than faked, same as every other
// schema-shaped gap in this build.
export function DirectorTeamsMobile() {
  const { data } = useTeamsIndexData();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

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
          <ChevronIcon color="var(--band-ink-2)" />
        </Link>
      </div>

      <Section title={`Teams · ${teams.length}`}>
        {teams.length === 0 ? (
          <EmptyRow text="No Teams yet." />
        ) : (
          teams.map((t, i) => (
            <Row key={t.id} to={`/team/${t.id}`} i={i} initials={t.name}>
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
            <Row key={c.id} to={`/comp-team/${c.id}`} i={i} initials={c.name}>
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

function Row({ to, i, initials, children }: { to: string; i: number; initials: string; children: React.ReactNode }) {
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
      <ChevronIcon />
    </Link>
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
