import { Link } from "react-router-dom";

export interface PostPreview {
  id: string;
  body: string;
  important: boolean;
  createdAt: string;
  authorName: string;
}

// The single most recent post, full-bleed if important — reused on every
// destination's Home (Team/Comp Team/Studio), all pointing at the same
// Bulletin tab. `post` is real and queried live; it's simply empty until
// Task 17 builds a composer. See BUILD_PLAN.md Task 15.
export function BulletinPreview({ post, bulletinLink }: { post: PostPreview | null | undefined; bulletinLink: string }) {
  if (post === undefined) {
    return <p style={{ fontSize: 13, color: "var(--ink-2)" }}>Loading…</p>;
  }
  if (post === null) {
    return <p style={{ fontSize: 13, color: "var(--ink-2)" }}>No posts yet.</p>;
  }
  return (
    <div className="card" style={{ border: post.important ? "none" : "1px solid var(--hairline)", borderTop: post.important ? "3px solid var(--signal)" : undefined, borderRadius: 18, overflow: "hidden" }}>
      {post.important && (
        <div style={{ background: "var(--signal-tint)", padding: "11px 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 9.5, padding: "3px 9px", borderRadius: 999, background: "var(--band)", color: "var(--signal)", letterSpacing: "0.04em" }}>
            IMPORTANT
          </span>
          <span style={{ fontSize: 11, color: "var(--signal-ink)" }}>
            {post.authorName} · {timeAgo(post.createdAt)}
          </span>
        </div>
      )}
      <div style={{ padding: "13px 16px 15px" }}>
        {!post.important && (
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 4 }}>
            {post.authorName} · {timeAgo(post.createdAt)}
          </div>
        )}
        <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>{post.body}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 9 }}>
          <Link to={bulletinLink} style={{ fontSize: 12, fontWeight: 700, color: "var(--signal-deep)" }}>
            Open in Bulletin →
          </Link>
        </div>
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
