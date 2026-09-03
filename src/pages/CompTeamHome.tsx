import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase, callApp } from "../lib/supabase";
import { useAuth, hasRole } from "../lib/AuthProvider";
import { useStudio } from "../lib/useStudio";
import { formatTimeInZone } from "../lib/format";
import { Sheet } from "../components/Sheet";
import { DestinationHeader } from "../components/DestinationHeader";
import { DestinationSubNav } from "../components/DestinationSubNav";
import { ToolsRow } from "../components/ToolsRow";
import { BulletinPreview, type PostPreview } from "../components/BulletinPreview";
import { MediaGallery, type MediaPreviewItem } from "../components/MediaGallery";
import { Avatar } from "../components/Avatar";

interface CompTeamInfo {
  name: string;
  comp_team_type: string;
  level: string | null;
}

interface UpcomingRow {
  id: string;
  title: string | null;
  starts_at: string;
  spaceName: string | null;
}

interface CastRow {
  id: string;
  full_name: string;
  sourceTeamName: string | null;
}

interface CompetingAt {
  competitionId: string;
  competitionName: string;
  venueName: string | null;
  startsOn: string;
  callTime: string | null;
}

// Ports design-reference/CompHome.dc.html — see BUILD_PLAN.md Task 15,
// hero activated for real in Task 24. This comp team's `comp_team_type`
// and cast count stand in for the artboard's fabricated "Level 2"
// (comp_team has no level column — same gap as Deficiency #24).
//
// The photo/gradient/countdown-pill treatment is dropped — no Storage
// bucket exists for this studio (Deficiency #2) — same honest-subset
// choice this whole build already makes everywhere else a photo would've
// gone. "Competing at" only ever shows a published competition:
// competition_read's own RLS already hides an unpublished one from
// everyone but the Director, so this query naturally returns nothing for
// a draft — no extra client-side check needed.
export function CompTeamHome() {
  const { id: compTeamId } = useParams<{ id: string }>();
  const { person } = useAuth();
  const studio = useStudio();
  const isDirector = hasRole(person, "director");

  const [compTeam, setCompTeam] = useState<CompTeamInfo | null>(null);
  const [choreographs, setChoreographs] = useState(false);
  const [choreographerName, setChoreographerName] = useState<string | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingRow[] | null>(null);
  const [cast, setCast] = useState<{ rows: CastRow[]; total: number } | null>(null);
  const [post, setPost] = useState<PostPreview | null | undefined>(undefined);
  const [media, setMedia] = useState<MediaPreviewItem[] | null>(null);
  const [competingAt, setCompetingAt] = useState<CompetingAt | null | undefined>(undefined);
  const [pendingProposal, setPendingProposal] = useState<{ competitionName: string } | null | undefined>(undefined);
  const [proposeSheetOpen, setProposeSheetOpen] = useState(false);
  const [availableCompetitions, setAvailableCompetitions] = useState<{ id: string; name: string }[] | null>(null);
  const [proposing, setProposing] = useState(false);
  const [proposeError, setProposeError] = useState<string | null>(null);

  useEffect(() => {
    if (!compTeamId || !person) return;
    let cancelled = false;

    callApp<string[]>("comp_teams_i_choreograph").then(({ data }) => {
      if (!cancelled) setChoreographs((data ?? []).includes(compTeamId));
    });

    async function load() {
      const [{ data: compTeamRow }, { data: castRows }] = await Promise.all([
        supabase.from("comp_team").select("name, comp_team_type, level").eq("id", compTeamId!).single(),
        supabase.from("comp_team_cast").select("person_id, role, person:person_id(id, full_name)").eq("comp_team_id", compTeamId!),
      ]);
      if (cancelled || !compTeamRow) return;
      setCompTeam(compTeamRow);

      const choreographer = (castRows ?? []).find((r) => r.role === "choreographer");
      setChoreographerName((choreographer?.person as unknown as { full_name: string } | null)?.full_name ?? null);

      const dancerRows = (castRows ?? []).filter((r) => r.role === "dancer");
      const dancerIds = dancerRows.map((r) => r.person_id);
      const { data: sourceTeamRows } = dancerIds.length > 0
        ? await supabase.from("team_member").select("person_id, team:team_id(name)").in("person_id", dancerIds).eq("role", "dancer")
        : { data: [] as { person_id: string; team: { name: string } | null }[] };
      const sourceTeamByDancer = new Map<string, string>();
      for (const r of sourceTeamRows ?? []) {
        if (!sourceTeamByDancer.has(r.person_id) && r.team) sourceTeamByDancer.set(r.person_id, (r.team as unknown as { name: string }).name);
      }
      const castList: CastRow[] = dancerRows.map((r) => {
        const p = r.person as unknown as { id: string; full_name: string };
        return { id: p.id, full_name: p.full_name, sourceTeamName: sourceTeamByDancer.get(p.id) ?? null };
      });
      if (cancelled) return;
      setCast({ rows: castList.slice(0, 4), total: castList.length });

      const { data: eventRows } = await supabase
        .from("event")
        .select("id, title, starts_at, studio_space_id")
        .eq("comp_team_id", compTeamId!)
        .is("cancelled_at", null)
        .gte("starts_at", new Date().toISOString())
        .order("starts_at")
        .limit(3);
      const spaceIds = [...new Set((eventRows ?? []).map((e) => e.studio_space_id).filter((v): v is string => !!v))];
      const { data: spaceRows } = spaceIds.length > 0 ? await supabase.from("studio_space").select("id, name").in("id", spaceIds) : { data: [] as { id: string; name: string }[] };
      const spaceName = new Map((spaceRows ?? []).map((s) => [s.id, s.name]));
      if (cancelled) return;
      setUpcoming((eventRows ?? []).map((e) => ({ id: e.id, title: e.title, starts_at: e.starts_at, spaceName: e.studio_space_id ? spaceName.get(e.studio_space_id) ?? null : null })));

      const { data: entryRow } = await supabase
        .from("competition_entry")
        .select("call_time, competition:competition_id(id, name, venue_name, starts_on, published_at)")
        .eq("comp_team_id", compTeamId!)
        .not("accepted_at", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      const competition = entryRow?.competition as unknown as { id: string; name: string; venue_name: string | null; starts_on: string; published_at: string | null } | null;
      setCompetingAt(
        competition && competition.published_at
          ? { competitionId: competition.id, competitionName: competition.name, venueName: competition.venue_name, startsOn: competition.starts_on, callTime: entryRow!.call_time }
          : null
      );

      // A choreographer's own proposed-but-not-yet-accepted entry
      // (docs/DEFICIENCIES.md #33) — separate from competingAt above,
      // which only ever reflects an accepted one.
      const { data: pendingRow } = await supabase
        .from("competition_entry")
        .select("competition:competition_id(name)")
        .eq("comp_team_id", compTeamId!)
        .is("accepted_at", null)
        .not("proposed_by", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      const pendingCompetition = pendingRow?.competition as unknown as { name: string } | null;
      setPendingProposal(pendingCompetition ? { competitionName: pendingCompetition.name } : null);

      const { data: postRow } = await supabase
        .from("post")
        .select("id, body, important, created_at, author:author_id(full_name)")
        .eq("scope", "comp_team")
        .eq("comp_team_id", compTeamId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setPost(
        postRow
          ? { id: postRow.id, body: postRow.body, important: postRow.important, createdAt: postRow.created_at, authorName: (postRow.author as unknown as { full_name: string } | null)?.full_name ?? "Someone" }
          : null
      );

      const { data: mediaRows } = await supabase.from("media_item").select("id, caption, kind").eq("comp_team_id", compTeamId!).order("created_at", { ascending: false }).limit(3);
      if (!cancelled) setMedia(mediaRows ?? []);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [compTeamId, person]);

  async function openProposeSheet() {
    setProposeError(null);
    setProposeSheetOpen(true);
    // Published competitions this comp_team isn't already entered (accepted
    // or pending) in — competition_read's own RLS already limits this to
    // published ones for a non-Director, so no extra filter needed here.
    const { data: existingRows } = await supabase.from("competition_entry").select("competition_id").eq("comp_team_id", compTeamId!);
    const excludeIds = (existingRows ?? []).map((r) => r.competition_id);
    let q = supabase.from("competition").select("id, name").order("starts_on");
    if (excludeIds.length > 0) q = q.not("id", "in", `(${excludeIds.join(",")})`);
    const { data } = await q;
    setAvailableCompetitions(data ?? []);
  }

  async function submitProposal(competitionId: string) {
    if (!person || !compTeamId) return;
    setProposing(true);
    setProposeError(null);
    const { error } = await supabase.from("competition_entry").insert({
      studio_id: person.studio_id,
      competition_id: competitionId,
      comp_team_id: compTeamId,
      proposed_by: person.id,
    });
    setProposing(false);
    if (error) {
      setProposeError("Something went wrong sending that proposal — try again.");
      return;
    }
    setProposeSheetOpen(false);
    setPendingProposal({ competitionName: availableCompetitions?.find((c) => c.id === competitionId)?.name ?? "that competition" });
  }

  if (!person || !studio || !compTeam || !compTeamId) return null;

  const canUseTools = isDirector || choreographs;
  const canPropose = choreographs && !isDirector && competingAt === null && pendingProposal === null;
  const base = `/comp-team/${compTeamId}`;

  return (
    <div>
      <DestinationHeader
        name={compTeam.name}
        subtitle={[compTeamTypeLabel(compTeam.comp_team_type), compTeam.level, `${cast?.total ?? 0} dancers`].filter(Boolean).join(" · ")}
      />
      <DestinationSubNav base={base} />

      <div style={{ padding: "20px 20px 40px", maxWidth: 620, display: "flex", flexDirection: "column", gap: 24 }}>
        {competingAt === undefined ? (
          <div className="card" style={{ padding: "14px 16px", border: "1px solid var(--hairline)", borderRadius: 16 }}>
            <Eyebrow>Competing at</Eyebrow>
            <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 8 }}>Loading…</p>
          </div>
        ) : competingAt === null ? (
          <div className="card" style={{ padding: "14px 16px", border: "1px solid var(--hairline)", borderRadius: 16 }}>
            <Eyebrow>Competing at</Eyebrow>
            <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 8 }}>No competition booked yet.</p>
          </div>
        ) : (
          <div style={{ borderRadius: 18, overflow: "hidden", boxShadow: "0 4px 14px -6px rgba(44,32,12,.22)" }}>
            <div style={{ background: "var(--band)", color: "var(--band-ink)", padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 999, background: "var(--signal)", color: "var(--signal-ink)", fontSize: 10.5, fontWeight: 700 }}>
                  {daysToGo(competingAt.startsOn)}
                </span>
              </div>
              <div className="font-display" style={{ fontWeight: 800, fontSize: 17, marginTop: 10 }}>{compTeam.name}</div>
              <div style={{ fontSize: 11, color: "var(--band-ink-2)", marginTop: 2 }}>
                Entered in {competingAt.competitionName} · {new Date(competingAt.startsOn).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </div>
            </div>
            <div style={{ background: "var(--surface)", padding: "13px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Eyebrow>Competing at</Eyebrow>
                <Link to={`/competition/${competingAt.competitionId}`} style={{ fontSize: 11, fontWeight: 700, color: "var(--signal-deep)" }}>
                  {competingAt.competitionName} →
                </Link>
              </div>
              <div style={{ display: "flex", gap: 14, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--sand)" }}>
                <div style={{ flex: 1 }}>
                  <Eyebrow>Call time</Eyebrow>
                  <div className="font-display" style={{ fontWeight: 800, fontSize: 15, marginTop: 3 }}>
                    {competingAt.callTime && studio
                      ? `${formatTimeInZone(competingAt.callTime, studio.timezone).main}${formatTimeInZone(competingAt.callTime, studio.timezone).meridiem.toUpperCase()}`
                      : "TBD"}
                  </div>
                </div>
                <div style={{ width: 1, background: "var(--sand)" }} />
                <div style={{ flex: 1.4 }}>
                  <Eyebrow>Venue</Eyebrow>
                  <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 3 }}>{competingAt.venueName ?? "Not set yet"}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {pendingProposal && (
          <div className="card" style={{ padding: "14px 16px", border: "1px solid var(--hairline)", borderRadius: 16, background: "var(--sand)" }}>
            <Eyebrow>Proposal pending</Eyebrow>
            <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 8 }}>
              Waiting on the Director to accept or decline entering {pendingProposal.competitionName}.
            </p>
          </div>
        )}

        {canPropose && (
          <div>
            <button
              type="button"
              onClick={openProposeSheet}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 9,
                padding: "13px 16px",
                borderRadius: 12,
                border: "1.5px dashed var(--hairline)",
                color: "var(--ink-2)",
                fontSize: 13,
                fontWeight: 600,
                background: "none",
                cursor: "pointer",
              }}
            >
              + Propose entering a competition
            </button>
          </div>
        )}

        <ToolsRow
          base={base}
          accessNote="Director / assigned Instructor only"
          canPostBulletin={canUseTools}
          canAddEssentials={canUseTools}
          canUploadMedia={canUseTools}
        />

        <div>
          <Eyebrow>Bulletin</Eyebrow>
          <div style={{ marginTop: 10 }}>
            <BulletinPreview post={post} bulletinLink={`${base}/bulletin`} />
          </div>
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <Eyebrow>Rehearsals</Eyebrow>
            <Link to={`${base}/schedule`} style={seeAllStyle}>
              View full schedule →
            </Link>
          </div>
          {upcoming === null ? (
            <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 11 }}>Loading…</p>
          ) : upcoming.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 11 }}>Nothing scheduled yet.</p>
          ) : (
            <div className="card" style={{ marginTop: 10, padding: "2px 16px", border: "1px solid var(--hairline)", borderRadius: 16 }}>
              {upcoming.map((e) => (
                <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0", borderTop: "1px solid var(--sand)" }}>
                  <div className="font-display" style={{ fontWeight: 700, fontSize: 12.5, color: "var(--ink-2)", width: 60, flexShrink: 0, lineHeight: 1.3 }}>
                    {dayLabel(e.starts_at, studio.timezone)}
                    <br />
                    {formatTimeInZone(e.starts_at, studio.timezone).main}
                    {formatTimeInZone(e.starts_at, studio.timezone).meridiem.toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600 }}>{e.title ?? "Rehearsal"}</div>
                  {e.spaceName && <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{e.spaceName}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <Eyebrow>
              Cast · {cast?.total ?? 0}
              {choreographerName ? ` · choreographed by ${choreographerName}` : ""}
            </Eyebrow>
            <Link to={`${base}/roster`} style={seeAllStyle}>
              See full cast →
            </Link>
          </div>
          {cast === null ? (
            <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 11 }}>Loading…</p>
          ) : cast.rows.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 11 }}>No dancers cast yet.</p>
          ) : (
            <div className="card" style={{ marginTop: 10, padding: "2px 16px", border: "1px solid var(--hairline)", borderRadius: 16 }}>
              {cast.rows.map((r) => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0", borderTop: "1px solid var(--sand)" }}>
                  <Avatar name={r.full_name} size={32} />
                  <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600 }}>{r.full_name}</div>
                  {r.sourceTeamName && <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{r.sourceTeamName}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <Eyebrow>Music, video &amp; photos</Eyebrow>
            <Link to={`${base}/media`} style={seeAllStyle}>
              See all →
            </Link>
          </div>
          <div style={{ marginTop: 11 }}>
            <MediaGallery items={media} emptyText="No music, video, or photos yet." />
          </div>
        </div>

        <Link to="/messages" style={messageBtnStyle}>
          <MessagingIcon />
          Message the cast
        </Link>
      </div>

      <Sheet
        open={proposeSheetOpen}
        onClose={() => setProposeSheetOpen(false)}
        title="Propose entering a competition"
        subtitle="Sent to the Director to accept or decline — nothing books until they confirm it."
      >
        {availableCompetitions === null ? (
          <p style={{ fontSize: 13, color: "var(--ink-2)", padding: "8px 0" }}>Loading…</p>
        ) : availableCompetitions.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--ink-2)", padding: "8px 0" }}>
            No published competitions to propose right now — check back once your studio's Director publishes one.
          </p>
        ) : (
          availableCompetitions.map((c, i) => (
            <div
              key={c.id}
              role="button"
              onClick={() => !proposing && submitProposal(c.id)}
              className="hairline"
              style={{ padding: "13px 0", borderTop: i === 0 ? "none" : "1px solid var(--hairline)", cursor: proposing ? "default" : "pointer", fontSize: 13.5, fontWeight: 700, opacity: proposing ? 0.6 : 1 }}
            >
              {c.name}
            </div>
          ))
        )}
        {proposeError && <p style={{ fontSize: 12.5, color: "var(--busy)", marginTop: 10 }}>{proposeError}</p>}
      </Sheet>
    </div>
  );
}

function compTeamTypeLabel(type: string): string {
  const map: Record<string, string> = {
    solo: "Solo",
    duo: "Duo",
    trio: "Trio",
    small_group: "Small group",
    large_group: "Large group",
    production: "Production",
  };
  return map[type] ?? type;
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

function daysToGo(startsOnYMD: string): string {
  const today = new Date();
  const todayYMD = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(today);
  const msPerDay = 86400000;
  const diffDays = Math.round((new Date(startsOnYMD + "T00:00:00Z").getTime() - new Date(todayYMD + "T00:00:00Z").getTime()) / msPerDay);
  if (diffDays < 0) return "Past";
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "1 day to go";
  return `${diffDays} days to go`;
}

function dayLabel(iso: string, timeZone: string): string {
  const key = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  if (key === todayKey) return "Today";
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(new Date(iso));
}

const seeAllStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "var(--signal-deep)" };

const messageBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 9,
  padding: "14px 20px",
  borderRadius: 12,
  background: "var(--sand)",
  color: "var(--ink)",
  fontSize: 14.5,
  fontWeight: 600,
};

function MessagingIcon() {
  return (
    <svg style={{ width: 17, height: 17 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <path d="M21 11.5a8.4 8.4 0 01-9 8.4 8.5 8.5 0 01-3.8-.9L3 21l1.9-5.2A8.4 8.4 0 0121 11.5z" />
    </svg>
  );
}
