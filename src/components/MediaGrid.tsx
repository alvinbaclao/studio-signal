import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useStudio } from "../lib/useStudio";
import { weekRangeInZone } from "../lib/format";

export interface MediaItemFull {
  id: string;
  caption: string | null;
  kind: string;
  processing_status: string;
  created_at: string;
  uploaded_by: string | null;
}

type Scope = "studio" | "team" | "comp_team";

// Shared Media reader — one grouped, 2-up grid reused across Studio/Team/
// Comp Team (StudioMedia.dc.html/TeamMedia.dc.html/CompMedia.dc.html are
// the same pattern, differently scoped). Selects `media_item` for exactly
// this destination (media_read RLS narrows further, same trust-RLS
// discipline as BulletinFeed). Every non-'ready' item shows "Still
// processing," never a broken thumbnail. Thumbnail-first, tap-to-play
// (opens a detail sheet), never autoplay — see BUILD_PLAN.md Task 18.
//
// There's no Supabase Storage bucket for this studio yet (see
// docs/DEFICIENCIES.md #2 and friends), so every tile renders an honest
// placeholder swatch instead of a real photo/video frame — the grouping,
// RLS scoping, and processing-status handling are all real and
// live-verified; only the pixels are missing.
export function MediaGrid({ scope, destinationId }: { scope: Scope; destinationId: string | null }) {
  const studio = useStudio();
  const [items, setItems] = useState<MediaItemFull[] | null>(null);
  const [uploaderNames, setUploaderNames] = useState<Map<string, string>>(new Map());
  const [openItem, setOpenItem] = useState<MediaItemFull | null>(null);

  useEffect(() => {
    if (!studio) return;
    let cancelled = false;
    async function load() {
      let q = supabase.from("media_item").select("id, caption, kind, processing_status, created_at, uploaded_by");
      if (scope === "team") q = q.eq("team_id", destinationId!);
      else if (scope === "comp_team") q = q.eq("comp_team_id", destinationId!);
      else q = q.is("team_id", null).is("comp_team_id", null);
      const { data } = await q.order("created_at", { ascending: false });
      if (cancelled) return;
      setItems(data ?? []);
      const uploaderIds = [...new Set((data ?? []).map((i) => i.uploaded_by).filter((v): v is string => !!v))];
      if (uploaderIds.length > 0) {
        const { data: people } = await supabase.from("person").select("id, full_name").in("id", uploaderIds);
        setUploaderNames(new Map((people ?? []).map((p) => [p.id, p.full_name])));
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [scope, destinationId, studio]);

  if (!studio) return null;

  if (items === null) return <p style={{ fontSize: 13, color: "var(--ink-2)", padding: "18px 20px" }}>Loading…</p>;
  if (items.length === 0) {
    return (
      <p style={{ fontSize: 13, color: "var(--ink-2)", padding: "18px 20px" }}>
        No photos, video, or music yet.
      </p>
    );
  }

  const { start: weekStart } = weekRangeInZone(new Date(), studio.timezone);
  const music = items.filter((i) => i.kind === "audio");
  const nonMusic = items.filter((i) => i.kind !== "audio");
  const thisWeek = nonMusic.filter((i) => new Date(i.created_at) >= weekStart);
  const earlier = nonMusic.filter((i) => new Date(i.created_at) < weekStart);

  return (
    <div style={{ padding: "18px 20px 90px", maxWidth: 620 }}>
      {thisWeek.length > 0 && <MediaSection title="This week" items={thisWeek} uploaderNames={uploaderNames} onOpen={setOpenItem} />}
      {music.length > 0 && <MediaSection title="Music" items={music} uploaderNames={uploaderNames} onOpen={setOpenItem} style={{ marginTop: thisWeek.length > 0 ? 22 : 0 }} />}
      {earlier.length > 0 && (
        <MediaSection title="Earlier this season" items={earlier} uploaderNames={uploaderNames} onOpen={setOpenItem} style={{ marginTop: thisWeek.length > 0 || music.length > 0 ? 22 : 0 }} />
      )}

      {openItem && <MediaDetailSheet item={openItem} uploaderName={openItem.uploaded_by ? uploaderNames.get(openItem.uploaded_by) ?? null : null} onClose={() => setOpenItem(null)} />}
    </div>
  );
}

function MediaSection({
  title,
  items,
  uploaderNames,
  onOpen,
  style,
}: {
  title: string;
  items: MediaItemFull[];
  uploaderNames: Map<string, string>;
  onOpen: (item: MediaItemFull) => void;
  style?: React.CSSProperties;
}) {
  return (
    <div style={style}>
      <Eyebrow>{title}</Eyebrow>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 11 }}>
        {items.map((item) => (
          <div key={item.id}>
            <div
              role="button"
              onClick={() => onOpen(item)}
              style={{
                position: "relative",
                borderRadius: 14,
                overflow: "hidden",
                boxShadow: "0 4px 14px -6px rgba(44,32,12,.22)",
                height: 150,
                background: "var(--sand)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <TileIcon kind={item.kind} />
              {item.processing_status !== "ready" && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgba(28,23,20,.55)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontSize: 11.5,
                    fontWeight: 600,
                  }}
                >
                  Still processing
                </div>
              )}
              {item.processing_status === "ready" && item.kind === "video" && (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <PlayIcon />
                  </div>
                </div>
              )}
              {item.processing_status === "ready" && item.kind === "video" && (
                <span style={{ position: "absolute", top: 8, left: 8, background: "var(--band)", color: "var(--signal)", fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 999, letterSpacing: "0.03em" }}>
                  VIDEO
                </span>
              )}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 6, lineHeight: 1.4 }}>
              {item.caption ?? kindLabel(item.kind)}
              {item.uploaded_by && uploaderNames.get(item.uploaded_by) ? ` · ${uploaderNames.get(item.uploaded_by)}` : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MediaDetailSheet({ item, uploaderName, onClose }: { item: MediaItemFull; uploaderName: string | null; onClose: () => void }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(28,23,20,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 }}
      onClick={onClose}
    >
      <div style={{ width: "100%", maxWidth: 420, background: "var(--paper)", borderRadius: 20, overflow: "hidden", boxShadow: "0 24px 60px -18px rgba(28,23,20,.35)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ height: 220, background: "var(--sand)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
          <TileIcon kind={item.kind} large />
          {item.processing_status !== "ready" && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(28,23,20,.55)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12.5, fontWeight: 600 }}>
              Still processing
            </div>
          )}
        </div>
        <div style={{ padding: "16px 18px 18px" }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{item.caption ?? kindLabel(item.kind)}</div>
          <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 4 }}>
            {kindLabel(item.kind)}
            {uploaderName ? ` · uploaded by ${uploaderName}` : ""}
          </div>
        </div>
      </div>
    </div>
  );
}

function TileIcon({ kind, large }: { kind: string; large?: boolean }) {
  const size = large ? 30 : 22;
  const style = { width: size, height: size, color: "var(--ink-3)" };
  if (kind === "audio") {
    return (
      <svg style={style} viewBox="0 0 24 24" fill="currentColor">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    );
  }
  if (kind === "video") {
    return (
      <svg style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
        <rect x="3" y="5" width="14" height="14" rx="2" />
        <path d="M17 9l4-2v10l-4-2" />
      </svg>
    );
  }
  if (kind === "doc") {
    return (
      <svg style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <path d="M14 2v6h6" />
      </svg>
    );
  }
  return (
    <svg style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg style={{ width: 13, height: 13, color: "#fff" }} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function kindLabel(kind: string): string {
  if (kind === "video") return "Video";
  if (kind === "audio") return "Audio";
  if (kind === "doc") return "Document";
  return "Photo";
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "var(--font-display)", fontSize: 10.5, letterSpacing: "0.11em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>
      {children}
    </div>
  );
}

export function MediaFab({ to, note }: { to: string; note: string }) {
  return (
    <div style={{ position: "fixed", right: 20, bottom: 84, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, zIndex: 10 }}>
      <span style={{ fontSize: 10, color: "var(--ink-3)", background: "var(--paper)", padding: "3px 8px", borderRadius: 8, border: "1px dashed var(--hairline)" }}>{note}</span>
      <Link
        to={to}
        style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--signal)", color: "var(--signal-ink)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 16px rgba(28,23,20,.18)" }}
      >
        <svg style={{ width: 22, height: 22 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
          <path d="M4 7h3l2-3h6l2 3h3v13H4z" />
          <circle cx="12" cy="13" r="3.5" />
        </svg>
      </Link>
    </div>
  );
}
