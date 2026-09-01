import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthProvider";
import { useStudio } from "../lib/useStudio";
import { Avatar } from "../components/Avatar";

interface MediaRef {
  id: string;
  caption: string | null;
  kind: string;
}

interface PostRow {
  id: string;
  body: string;
  important: boolean;
  createdAt: string;
  authorId: string;
  authorName: string;
  authorRoleLabel: string | null;
  media: MediaRef[];
  reactorIds: string[];
}

type Scope = "studio" | "team" | "comp_team";

// Shared Bulletin reader — one component, reused for Studio/Team/Comp Team
// (StudioBulletin.dc.html/TeamBulletin.dc.html/CompBulletin.dc.html are the
// same reader pattern with different scoping). Selects `post` for exactly
// this destination's scope/team_id/comp_team_id, newest first,
// deleted_at is null — no extra client-side filtering beyond that; RLS
// (the "post_read" policy) is what actually narrows a Comp Team's posts to
// cast + choreographer + Director, verified live rather than assumed. See
// BUILD_PLAN.md Task 17.
//
// "Seen by X of Y" from the artboards has no backing table (no post-read-
// tracking exists anywhere in the schema) — omitted rather than faked, see
// docs/DEFICIENCIES.md. Reactions are a single fixed kind ("👍"), one tap
// upserts/deletes your own row; no artboard shows a multi-emoji picker.
export function BulletinFeed({
  scope,
  destinationId,
  canPost,
  composerLink,
  fabNote,
  roleResolver,
}: {
  scope: Scope;
  destinationId: string | null;
  canPost: boolean;
  composerLink: string;
  fabNote: string;
  /** Given a person id, the label to suffix onto their name for this destination ("Instructor"/"Choreographer"), or null. */
  roleResolver?: (personId: string) => string | null;
}) {
  const { person } = useAuth();
  const studio = useStudio();
  const [posts, setPosts] = useState<PostRow[] | null>(null);
  const [expandedReactors, setExpandedReactors] = useState<string | null>(null);
  const [reactorNames, setReactorNames] = useState<Map<string, string>>(new Map());
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!person || !studio) return;
    let cancelled = false;
    async function load() {
      let q = supabase.from("post").select("id, body, important, created_at, author_id").eq("scope", scope).is("deleted_at", null);
      if (scope === "team") q = q.eq("team_id", destinationId!);
      else if (scope === "comp_team") q = q.eq("comp_team_id", destinationId!);
      const { data: postRows } = await q.order("created_at", { ascending: false });
      if (cancelled) return;
      if (!postRows || postRows.length === 0) {
        setPosts([]);
        return;
      }

      const postIds = postRows.map((p) => p.id);
      const authorIds = [...new Set(postRows.map((p) => p.author_id))];
      const [{ data: authorRows }, { data: mediaRows }, { data: reactionRows }] = await Promise.all([
        supabase.from("person").select("id, full_name").in("id", authorIds),
        supabase.from("post_media").select("post_id, media_item:media_item_id(id, caption, kind)").in("post_id", postIds),
        supabase.from("reaction").select("post_id, person_id").in("post_id", postIds),
      ]);
      const authorName = new Map((authorRows ?? []).map((a) => [a.id, a.full_name]));
      const mediaByPost = new Map<string, MediaRef[]>();
      for (const r of mediaRows ?? []) {
        const m = r.media_item as unknown as MediaRef | null;
        if (!m) continue;
        const arr = mediaByPost.get(r.post_id) ?? [];
        arr.push(m);
        mediaByPost.set(r.post_id, arr);
      }
      const reactorsByPost = new Map<string, string[]>();
      for (const r of reactionRows ?? []) {
        const arr = reactorsByPost.get(r.post_id) ?? [];
        arr.push(r.person_id);
        reactorsByPost.set(r.post_id, arr);
      }

      if (cancelled) return;
      setPosts(
        postRows.map((p) => ({
          id: p.id,
          body: p.body,
          important: p.important,
          createdAt: p.created_at,
          authorId: p.author_id,
          authorName: scope === "studio" ? studio!.name : authorName.get(p.author_id) ?? "Someone",
          authorRoleLabel: scope === "studio" ? null : roleResolver?.(p.author_id) ?? null,
          media: mediaByPost.get(p.id) ?? [],
          reactorIds: reactorsByPost.get(p.id) ?? [],
        }))
      );
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [person, studio, scope, destinationId, reloadKey, roleResolver]);

  async function toggleReaction(post: PostRow) {
    if (!person) return;
    const mine = post.reactorIds.includes(person.id);
    if (mine) {
      await supabase.from("reaction").delete().eq("post_id", post.id).eq("person_id", person.id);
    } else {
      await supabase.from("reaction").insert({ post_id: post.id, person_id: person.id, studio_id: person.studio_id, kind: "👍" });
    }
    setReloadKey((k) => k + 1);
  }

  async function showReactors(post: PostRow) {
    if (expandedReactors === post.id) {
      setExpandedReactors(null);
      return;
    }
    setExpandedReactors(post.id);
    const missing = post.reactorIds.filter((id) => !reactorNames.has(id));
    if (missing.length > 0) {
      const { data } = await supabase.from("person").select("id, full_name").in("id", missing);
      setReactorNames((prev) => {
        const next = new Map(prev);
        for (const r of data ?? []) next.set(r.id, r.full_name);
        return next;
      });
    }
  }

  if (!person || !studio) return null;

  return (
    <div style={{ position: "relative", padding: "18px 20px 90px", maxWidth: 620 }}>
      {posts === null ? (
        <p style={{ fontSize: 13, color: "var(--ink-2)" }}>Loading…</p>
      ) : posts.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--ink-2)" }}>No posts yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {posts.map((post) => {
            const mine = post.reactorIds.includes(person.id);
            return (
              <div
                key={post.id}
                className="card"
                style={{
                  border: post.important ? "1.5px solid var(--signal-deep)" : "1px solid var(--hairline)",
                  borderRadius: 16,
                  overflow: "hidden",
                }}
              >
                {post.important && (
                  <div style={{ background: "var(--signal-tint)", padding: "12px 16px" }}>
                    <span style={{ fontWeight: 700, fontSize: 9.5, padding: "3px 9px", borderRadius: 999, background: "var(--band)", color: "var(--signal)", letterSpacing: "0.04em" }}>
                      IMPORTANT
                    </span>
                  </div>
                )}
                <div style={{ padding: "14px 16px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <Avatar name={post.authorName} size={30} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>
                        {post.authorName}
                        {post.authorRoleLabel ? ` · ${post.authorRoleLabel}` : ""}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--ink-3)" }}>Posted {timeAgo(post.createdAt)}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.55, marginTop: 11, whiteSpace: "pre-wrap" }}>{post.body}</div>
                  {post.media.map((m) => (
                    <div key={m.id} style={{ width: "100%", height: 150, borderRadius: 12, background: "var(--sand)", marginTop: 11, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11.5, color: "var(--ink-3)" }}>
                      {m.caption ?? m.kind}
                    </div>
                  ))}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 13, paddingTop: 12, borderTop: "1px solid var(--hairline)" }}>
                    <button
                      type="button"
                      onClick={() => toggleReaction(post)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 12px",
                        borderRadius: 999,
                        background: mine ? "var(--band)" : "var(--sand)",
                        color: mine ? "var(--signal)" : "var(--ink-2)",
                        fontSize: 12,
                        fontWeight: 700,
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      👍 {post.reactorIds.length}
                    </button>
                    {post.reactorIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => showReactors(post)}
                        style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}
                      >
                        {expandedReactors === post.id ? "Hide" : `${post.reactorIds.length} reacted`} →
                      </button>
                    )}
                  </div>
                  {expandedReactors === post.id && (
                    <div style={{ marginTop: 9, fontSize: 12, color: "var(--ink-2)" }}>
                      {post.reactorIds.map((id) => reactorNames.get(id) ?? "…").join(", ")}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {canPost && (
        <div style={{ position: "fixed", right: 20, bottom: 84, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, zIndex: 10 }}>
          <span style={{ fontSize: 10, color: "var(--ink-3)", background: "var(--paper)", padding: "3px 8px", borderRadius: 8, border: "1px dashed var(--hairline)" }}>
            {fabNote}
          </span>
          <Link
            to={composerLink}
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: "var(--signal)",
              color: "var(--signal-ink)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 6px 16px rgba(28,23,20,.18)",
            }}
          >
            <PlusIcon />
          </Link>
        </div>
      )}
    </div>
  );
}

function PlusIcon() {
  return (
    <svg style={{ width: 22, height: 22 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
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
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
