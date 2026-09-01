import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth, hasRole } from "../lib/AuthProvider";
import { useStudio } from "../lib/useStudio";
import { formatTimeInZone } from "../lib/format";
import { DestinationHeader } from "../components/DestinationHeader";
import { DestinationSubNav } from "../components/DestinationSubNav";
import { ToolsRow } from "../components/ToolsRow";
import { BulletinPreview, type PostPreview } from "../components/BulletinPreview";
import { MediaGallery, type MediaPreviewItem } from "../components/MediaGallery";
import { Avatar } from "../components/Avatar";

interface TeamInfo {
  name: string;
  level: string | null;
  dancerCount: number;
}

interface UpcomingRow {
  id: string;
  title: string | null;
  starts_at: string;
  spaceName: string | null;
}

interface RosterRow {
  id: string;
  full_name: string;
}

// Ports design-reference/TeamHome.dc.html — see BUILD_PLAN.md Task 15. All
// three destination homes (Team/Comp Team/Studio) share the same shell:
// DestinationHeader, DestinationSubNav, a role-gated ToolsRow, then
// content specific to the destination.
export function TeamHome() {
  const { id: teamId } = useParams<{ id: string }>();
  const { person } = useAuth();
  const studio = useStudio();
  const isDirector = hasRole(person, "director");

  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [teaches, setTeaches] = useState(false);
  const [upcoming, setUpcoming] = useState<UpcomingRow[] | null>(null);
  const [roster, setRoster] = useState<{ rows: RosterRow[]; total: number } | null>(null);
  const [post, setPost] = useState<PostPreview | null | undefined>(undefined);
  const [media, setMedia] = useState<MediaPreviewItem[] | null>(null);

  useEffect(() => {
    if (!teamId || !person) return;
    let cancelled = false;

    supabase
      .from("team_member")
      .select("person_id")
      .eq("team_id", teamId)
      .eq("person_id", person.id)
      .eq("role", "instructor")
      .maybeSingle()
      .then(({ data }) => !cancelled && setTeaches(!!data));

    async function load() {
      const [{ data: teamRow }, { data: memberRows }] = await Promise.all([
        supabase.from("team").select("name, level").eq("id", teamId!).single(),
        supabase.from("team_member").select("person_id, role, person:person_id(id, full_name)").eq("team_id", teamId!).eq("role", "dancer"),
      ]);
      if (cancelled || !teamRow) return;
      const dancers = (memberRows ?? []).map((r) => r.person as unknown as RosterRow).filter(Boolean);
      setTeam({ name: teamRow.name, level: teamRow.level, dancerCount: dancers.length });
      setRoster({ rows: dancers.slice(0, 4), total: dancers.length });

      const { data: eventRows } = await supabase
        .from("event")
        .select("id, title, starts_at, studio_space_id")
        .eq("team_id", teamId!)
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
        .eq("scope", "team")
        .eq("team_id", teamId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setPost(
        postRow
          ? { id: postRow.id, body: postRow.body, important: postRow.important, createdAt: postRow.created_at, authorName: (postRow.author as unknown as { full_name: string } | null)?.full_name ?? "Someone" }
          : null
      );

      const { data: mediaRows } = await supabase.from("media_item").select("id, caption, kind").eq("team_id", teamId!).order("created_at", { ascending: false }).limit(3);
      if (!cancelled) setMedia(mediaRows ?? []);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [teamId, person]);

  if (!person || !studio || !team || !teamId) return null;

  const canUseTools = isDirector || teaches;
  const base = `/team/${teamId}`;

  return (
    <div>
      <DestinationHeader name={team.name} subtitle={`${team.level ?? "Team"} · ${team.dancerCount} dancers`} />
      <DestinationSubNav base={base} />

      <div style={{ padding: "20px 20px 40px", maxWidth: 620, display: "flex", flexDirection: "column", gap: 24 }}>
        <ToolsRow
          base={base}
          accessNote="Only you & the Director"
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
            <Eyebrow>Upcoming classes</Eyebrow>
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
                  <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600 }}>{e.title ?? "Class"}</div>
                  {e.spaceName && <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{e.spaceName}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <Eyebrow>Roster · {roster?.total ?? 0}</Eyebrow>
            <Link to={`${base}/roster`} style={seeAllStyle}>
              See full roster →
            </Link>
          </div>
          {roster === null ? (
            <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 11 }}>Loading…</p>
          ) : roster.rows.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 11 }}>No dancers on this Team yet.</p>
          ) : (
            <div className="card" style={{ marginTop: 10, padding: "2px 16px", border: "1px solid var(--hairline)", borderRadius: 16 }}>
              {roster.rows.map((r) => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0", borderTop: "1px solid var(--sand)" }}>
                  <Avatar name={r.full_name} size={34} />
                  <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600 }}>{r.full_name}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <Eyebrow>Media</Eyebrow>
            <Link to={`${base}/media`} style={seeAllStyle}>
              See all →
            </Link>
          </div>
          <div style={{ marginTop: 11 }}>
            <MediaGallery items={media} emptyText="No photos or videos yet." />
          </div>
        </div>

        <Link to="/messages" style={messageBtnStyle}>
          <MessagingIcon />
          Message {team.name}
        </Link>
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
