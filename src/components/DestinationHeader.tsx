import { Link, useNavigate } from "react-router-dom";

// Shared header for every destination shell (Team/Comp Team/Studio Home,
// and now their Schedule tabs too) — back chevron, name + subtitle, a
// link into Messaging. See BUILD_PLAN.md Task 15 and
// docs/PROJECT_KNOWLEDGE.md's two-tier navigation architecture.
export function DestinationHeader({ name, subtitle }: { name: string; subtitle: string }) {
  const navigate = useNavigate();
  return (
    <div
      style={{
        padding: "16px 20px 14px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid var(--hairline)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <div role="button" onClick={() => navigate(-1)} style={{ cursor: "pointer", color: "var(--ink-2)", flexShrink: 0 }}>
          <BackIcon />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="font-display" style={{ fontWeight: 700, fontSize: 16, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {name}
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 1 }}>{subtitle}</div>
        </div>
      </div>
      <Link to="/messages" style={{ color: "var(--ink-2)", flexShrink: 0 }}>
        <MessagingIcon />
      </Link>
    </div>
  );
}

function BackIcon() {
  return (
    <svg style={{ width: 18, height: 18 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function MessagingIcon() {
  return (
    <svg style={{ width: 18, height: 18 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
      <path d="M21 11.5a8.4 8.4 0 01-9 8.4 8.5 8.5 0 01-3.8-.9L3 21l1.9-5.2A8.4 8.4 0 0121 11.5z" />
    </svg>
  );
}
