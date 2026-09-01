import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth, hasRole } from "../lib/AuthProvider";
import { useStudio } from "../lib/useStudio";
import { DestinationHeader } from "../components/DestinationHeader";
import { DestinationSubNav } from "../components/DestinationSubNav";
import { ToolsRow } from "../components/ToolsRow";
import { BulletinPreview, type PostPreview } from "../components/BulletinPreview";
import { MediaGallery, type MediaPreviewItem } from "../components/MediaGallery";

interface UpcomingRow {
  id: string;
  title: string | null;
  starts_at: string;
}

interface EssentialRow {
  id: string;
  title: string;
}

// Ports design-reference/StudioHome.dc.html — see BUILD_PLAN.md Task 15.
// Studio's tools are gated per-button, not per-screen: Bulletin/Essentials
// are open to any confirmed instructor, Media stays Director-only, per
// docs/PROJECT_KNOWLEDGE.md's Bulletin/Media/Essentials section.
export function StudioHome() {
  const { person } = useAuth();
  const studio = useStudio();
  const isDirector = hasRole(person, "director");
  const isInstructor = hasRole(person, "instructor");

  const [upcoming, setUpcoming] = useState<UpcomingRow[] | null>(null);
  const [essentials, setEssentials] = useState<EssentialRow[] | null>(null);
  const [post, setPost] = useState<PostPreview | null | undefined>(undefined);
  const [media, setMedia] = useState<MediaPreviewItem[] | null>(null);

  useEffect(() => {
    if (!person) return;
    let cancelled = false;
    async function load() {
      const { data: eventRows } = await supabase
        .from("event")
        .select("id, title, starts_at")
        .eq("studio_wide", true)
        .is("cancelled_at", null)
        .gte("starts_at", new Date().toISOString())
        .order("starts_at")
        .limit(3);
      if (!cancelled) setUpcoming(eventRows ?? []);

      const { data: essentialRows } = await supabase
        .from("essentials_item")
        .select("id, title")
        .eq("scope", "studio")
        .is("archived_at", null)
        .order("sort_order")
        .limit(3);
      if (!cancelled) setEssentials(essentialRows ?? []);

      const { data: postRow } = await supabase
        .from("post")
        .select("id, body, important, created_at, author:author_id(full_name)")
        .eq("scope", "studio")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) {
        setPost(
          postRow
            ? { id: postRow.id, body: postRow.body, important: postRow.important, createdAt: postRow.created_at, authorName: (postRow.author as unknown as { full_name: string } | null)?.full_name ?? "Someone" }
            : null
        );
      }

      const { data: mediaRows } = await supabase.from("media_item").select("id, caption, kind").is("team_id", null).is("comp_team_id", null).order("created_at", { ascending: false }).limit(3);
      if (!cancelled) setMedia(mediaRows ?? []);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [person]);

  if (!person || !studio) return null;

  return (
    <div>
      <DestinationHeader name="Studio" subtitle={`${studio.name} · everyone`} />
      <DestinationSubNav base="/studio" />

      <div style={{ padding: "20px 20px 40px", maxWidth: 620, display: "flex", flexDirection: "column", gap: 24 }}>
        <div>
          <Eyebrow>Bulletin</Eyebrow>
          <div style={{ marginTop: 10 }}>
            <BulletinPreview post={post} bulletinLink="/studio/bulletin" />
          </div>
        </div>

        <ToolsRow
          base="/studio"
          accessNote="Studio-wide · access varies by action"
          canPostBulletin={isDirector || isInstructor}
          canAddEssentials={isDirector || isInstructor}
          canUploadMedia={isDirector}
        />

        <div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <Eyebrow>Upcoming · whole studio</Eyebrow>
            <Link to="/studio/schedule" style={seeAllStyle}>
              View full schedule →
            </Link>
          </div>
          {upcoming === null ? (
            <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 11 }}>Loading…</p>
          ) : upcoming.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 11 }}>Nothing studio-wide scheduled yet.</p>
          ) : (
            <div className="card" style={{ marginTop: 10, padding: "2px 16px", border: "1px solid var(--hairline)", borderRadius: 16 }}>
              {upcoming.map((e) => (
                <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0", borderTop: "1px solid var(--sand)" }}>
                  <div className="font-display" style={{ fontWeight: 700, fontSize: 12.5, color: "var(--ink-2)", width: 60, flexShrink: 0 }}>
                    {compactDateLabel(e.starts_at, studio.timezone)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600 }}>{e.title ?? "Studio event"}</div>
                  <ChevronIcon />
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <Eyebrow>Essentials</Eyebrow>
            <Link to="/studio/essentials" style={seeAllStyle}>
              See all →
            </Link>
          </div>
          {essentials === null ? (
            <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 11 }}>Loading…</p>
          ) : essentials.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 11 }}>Nothing posted yet.</p>
          ) : (
            <div className="card" style={{ marginTop: 10, padding: "2px 16px", border: "1px solid var(--hairline)", borderRadius: 16 }}>
              {essentials.map((e) => (
                <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0", borderTop: "1px solid var(--sand)" }}>
                  <FileIcon />
                  <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600 }}>{e.title}</div>
                  <ChevronIcon />
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <Eyebrow>Media</Eyebrow>
            <Link to="/studio/media" style={seeAllStyle}>
              See all →
            </Link>
          </div>
          <div style={{ marginTop: 11 }}>
            <MediaGallery items={media} emptyText="No photos or videos yet." />
          </div>
        </div>

        <Link to="/messages" style={messageBtnStyle}>
          <MessagingIcon />
          Message the studio
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

function FileIcon() {
  return (
    <svg style={{ width: 17, height: 17, color: "var(--ink-2)", flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function compactDateLabel(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" }).format(new Date(iso));
}

function ChevronIcon() {
  return (
    <svg style={{ width: 15, height: 15, color: "var(--ink-3)", flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}
