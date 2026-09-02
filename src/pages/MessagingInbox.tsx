import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, callApp } from "../lib/supabase";
import { useAuth } from "../lib/AuthProvider";
import { Avatar } from "../components/Avatar";

interface ThreadPreview {
  id: string;
  scope: string;
  displayName: string;
  lastMessageBody: string | null;
  lastMessageAt: string | null;
  lastMessageAuthorName: string | null;
  lastMessageIsUrgent: boolean;
  unread: boolean;
}

// Ports design-reference/MessagingInbox.dc.html — threads from
// threads_i_can_see()'s own scoping, no extra filter. Unread is computed
// (newest message vs. thread_read_state.last_read_at), never a stored
// column. See BUILD_PLAN.md Task 20.
//
// message_thread has no INSERT path from the client at all right now, for
// any scope, and threads_i_can_see() returns [] for every account —
// confirmed live, fresh, before writing this screen. That makes this
// Inbox permanently empty until that's fixed outside this codebase (see
// docs/DEFICIENCIES.md #1) — the query below is the real, correct query
// regardless, ready to work the moment a thread can exist.
export function MessagingInbox() {
  const { person } = useAuth();
  const [threads, setThreads] = useState<ThreadPreview[] | null>(null);

  useEffect(() => {
    if (!person) return;
    const personId = person.id;
    let cancelled = false;
    async function load() {
      const { data: threadIds } = await callApp<string[]>("threads_i_can_see");
      const ids = threadIds ?? [];
      if (ids.length === 0) {
        if (!cancelled) setThreads([]);
        return;
      }

      const [{ data: threadRows }, { data: messageRows }, { data: readRows }, { data: participantRows }] = await Promise.all([
        supabase.from("message_thread").select("id, scope, team_id, comp_team_id, subject").in("id", ids),
        supabase.from("message").select("id, thread_id, body, author_id, created_at, is_urgent").in("thread_id", ids).is("deleted_at", null).order("created_at", { ascending: false }).limit(500),
        supabase.from("thread_read_state").select("thread_id, last_read_at").eq("person_id", personId).in("thread_id", ids),
        supabase.from("thread_participant").select("thread_id, person_id").in("thread_id", ids).neq("person_id", personId),
      ]);

      const lastMessageByThread = new Map<string, { body: string; author_id: string | null; created_at: string; is_urgent: boolean }>();
      for (const m of messageRows ?? []) {
        if (!lastMessageByThread.has(m.thread_id)) lastMessageByThread.set(m.thread_id, m);
      }
      const readAtByThread = new Map((readRows ?? []).map((r) => [r.thread_id, r.last_read_at]));
      const otherPersonByThread = new Map<string, string>();
      for (const p of participantRows ?? []) if (!otherPersonByThread.has(p.thread_id)) otherPersonByThread.set(p.thread_id, p.person_id);

      const teamIds = [...new Set((threadRows ?? []).filter((t) => t.team_id).map((t) => t.team_id!))];
      const compTeamIds = [...new Set((threadRows ?? []).filter((t) => t.comp_team_id).map((t) => t.comp_team_id!))];
      const authorIds = [...new Set((messageRows ?? []).map((m) => m.author_id).filter((v): v is string => !!v))];
      const otherPersonIds = [...new Set(otherPersonByThread.values())];
      const personIds = [...new Set([...authorIds, ...otherPersonIds])];

      const [{ data: teamRows }, { data: compTeamRows }, { data: peopleRows }] = await Promise.all([
        teamIds.length > 0 ? supabase.from("team").select("id, name").in("id", teamIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        compTeamIds.length > 0 ? supabase.from("comp_team").select("id, name").in("id", compTeamIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        personIds.length > 0 ? supabase.from("person").select("id, full_name").in("id", personIds) : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      ]);
      const teamName = new Map((teamRows ?? []).map((t) => [t.id, t.name]));
      const compTeamName = new Map((compTeamRows ?? []).map((c) => [c.id, c.name]));
      const personName = new Map((peopleRows ?? []).map((p) => [p.id, p.full_name]));

      if (cancelled) return;
      const previews: ThreadPreview[] = (threadRows ?? []).map((t) => {
        const last = lastMessageByThread.get(t.id);
        const readAt = readAtByThread.get(t.id) ?? "1970-01-01T00:00:00Z";
        const displayName =
          t.scope === "team"
            ? `${teamName.get(t.team_id!) ?? "Team"} · Team chat`
            : t.scope === "comp_team"
              ? `${compTeamName.get(t.comp_team_id!) ?? "Comp Team"} · Cast`
              : t.scope === "studio"
                ? t.subject ?? "Studio"
                : personName.get(otherPersonByThread.get(t.id) ?? "") ?? t.subject ?? "Direct message";
        return {
          id: t.id,
          scope: t.scope,
          displayName,
          lastMessageBody: last?.body ?? null,
          lastMessageAt: last?.created_at ?? null,
          lastMessageAuthorName: last?.author_id ? personName.get(last.author_id) ?? null : null,
          lastMessageIsUrgent: last?.is_urgent ?? false,
          unread: !!last && last.created_at > readAt,
        };
      });
      previews.sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
      setThreads(previews);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [person]);

  if (!person) return null;

  return (
    <div style={{ padding: "18px 20px 40px", maxWidth: 560 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 className="font-display" style={{ fontSize: 25 }}>
          Messages
        </h1>
        <Link
          to="/messages/new"
          style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--sand)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-2)" }}
        >
          <PlusIcon />
        </Link>
      </div>

      <div style={{ marginTop: 18 }}>
        {threads === null ? (
          <p style={{ fontSize: 13, color: "var(--ink-2)" }}>Loading…</p>
        ) : threads.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--ink-2)" }}>No conversations yet.</p>
        ) : (
          <div className="card" style={{ border: "1px solid var(--hairline)", borderRadius: 18, overflow: "hidden" }}>
            {threads.map((t, i) => (
              <Link
                key={t.id}
                to={`/messages/thread/${t.id}`}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderTop: i === 0 ? "none" : "1px solid var(--sand)", color: "inherit" }}
              >
                <Avatar name={t.displayName} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.displayName}</div>
                    {t.lastMessageIsUrgent && (
                      <span style={{ fontWeight: 700, fontSize: 8.5, padding: "2px 7px", borderRadius: 999, background: "var(--band)", color: "var(--signal)", letterSpacing: "0.04em", flexShrink: 0 }}>
                        IMPORTANT
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.lastMessageBody ? `${t.lastMessageAuthorName ? t.lastMessageAuthorName + ": " : ""}${t.lastMessageBody}` : "No messages yet"}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                  <div style={{ fontSize: 10, color: "var(--ink-3)" }}>{t.lastMessageAt ? timeAgo(t.lastMessageAt) : ""}</div>
                  {t.unread && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--busy)" }} />}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function PlusIcon() {
  return (
    <svg style={{ width: 17, height: 17 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
