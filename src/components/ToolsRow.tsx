import { Link } from "react-router-dom";

// Post to Bulletin / Add to Essentials / Upload Media — the same three
// tools on every destination, gated per-button (Studio's Media is
// Director-only while its Bulletin/Essentials are open to any confirmed
// instructor — a narrower gate than Team/Comp Team, where all three tools
// share one gate). Renders nothing at all if every tool is hidden, same
// null-render discipline as <Band>. The composer screens themselves
// (BulletinComposer/EssentialsComposer/MediaUpload) land in Tasks 17–19 —
// these links already point at their real future home, currently a
// Placeholder. See BUILD_PLAN.md Task 15 and docs/PROJECT_KNOWLEDGE.md's
// Bulletin/Media/Essentials scoping rules.
export function ToolsRow({
  base,
  accessNote,
  canPostBulletin,
  canAddEssentials,
  canUploadMedia,
}: {
  base: string;
  accessNote: string;
  canPostBulletin: boolean;
  canAddEssentials: boolean;
  canUploadMedia: boolean;
}) {
  if (!canPostBulletin && !canAddEssentials && !canUploadMedia) return null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <Eyebrow>Instructor tools</Eyebrow>
        <span
          style={{
            fontSize: 9.5,
            color: "var(--ink-3)",
            fontWeight: 600,
            background: "var(--surface)",
            boxShadow: "0 4px 14px -6px rgba(44,32,12,.22)",
            padding: "3px 8px",
            borderRadius: 8,
          }}
        >
          {accessNote}
        </span>
      </div>
      <div style={{ display: "flex", gap: 9, marginTop: 9, overflowX: "auto", paddingBottom: 2 }}>
        {canPostBulletin && (
          <Link to={`${base}/bulletin/new`} style={toolBtnStyle(true)}>
            <PlusIcon />
            Post to Bulletin
          </Link>
        )}
        {canAddEssentials && (
          <Link to={`${base}/essentials/new`} style={toolBtnStyle(false)}>
            <FileIcon />
            Add to Essentials
          </Link>
        )}
        {canUploadMedia && (
          <Link to={`${base}/media/new`} style={toolBtnStyle(false)}>
            <UploadIcon />
            Upload Media
          </Link>
        )}
      </div>
    </div>
  );
}

function toolBtnStyle(primary: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "11px 15px",
    borderRadius: 11,
    background: primary ? "var(--band)" : "var(--surface)",
    color: primary ? "var(--signal)" : "var(--ink)",
    fontSize: 12.5,
    fontWeight: 700,
    whiteSpace: "nowrap",
    boxShadow: "0 4px 14px -6px rgba(44,32,12,.22)",
  };
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-display)",
        fontSize: 10.5,
        letterSpacing: "0.11em",
        textTransform: "uppercase",
        color: "var(--ink-2)",
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}

function PlusIcon() {
  return (
    <svg style={{ width: 14, height: 14 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg style={{ width: 14, height: 14 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg style={{ width: 14, height: 14 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}
