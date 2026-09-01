import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase, callApp } from "../lib/supabase";
import { useAuth, hasRole } from "../lib/AuthProvider";
import { useStudio } from "../lib/useStudio";
import { formatTimeInZone } from "../lib/format";
import { DestinationHeader } from "../components/DestinationHeader";
import { DestinationSubNav } from "../components/DestinationSubNav";
import { ToolsRow } from "../components/ToolsRow";
import { BulletinPreview, type PostPreview } from "../components/BulletinPreview";
import { MediaGallery, type MediaPreviewItem } from "../components/MediaGallery";
import { Avatar } from "../components/Avatar";

interface CompTeamInfo {
  name: string;
  comp_team_type: string;
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

// Ports design-reference/CompHome.dc.html — see BUILD_PLAN.md Task 15.
// The competition hero (countdown, call time, venue) stays absent —
// "No competition booked yet" — until Task 24 activates it; this comp
// team's `comp_team_type` and cast count stand in for the artboard's
// fabricated "Level 2" (comp_team has no level column).
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

  useEffect(() => {
    if (!compTeamId || !person) return;
    let cancelled = false;

    callApp<string[]>("comp_teams_i_choreograph").then(({ data }) => {
      if (!cancelled) setChoreographs((data ?? []).includes(compTeamId));
    });

    async function load() {
      const [{ data: compTeamRow }, { data: castRows }] = await Promise.all([
        supabase.from("comp_team").select("name, comp_team_type").eq("id", compTeamId!).single(),
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

  if (!person || !studio || !compTeam || !compTeamId) return null;

  const canUseTools = isDirector || choreographs;
  const base = `/comp-team/${compTeamId}`;

  return (
    <div>
      <DestinationHeader name={compTeam.name} subtitle={`${compTeamTypeLabel(compTeam.comp_team_type)} · ${cast?.total ?? 0} dancers`} />
      <DestinationSubNav base={base} />

      <div style={{ padding: "20px 20px 40px", maxWidth: 620, display: "flex", flexDirection: "column", gap: 24 }}>
        <div className="card" style={{ padding: "14px 16px", border: "1px solid var(--hairline)", borderRadius: 16 }}>
          <Eyebrow>Competing at</Eyebrow>
          <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 8 }}>No competition booked yet.</p>
        </div>

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
