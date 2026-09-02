import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth, hasRole } from "../lib/AuthProvider";
import { useStudio } from "../lib/useStudio";
import { Avatar } from "../components/Avatar";

interface MessageRow {
  id: string;
  author_id: string | null;
  body: string;
  created_at: string;
  is_pinned: boolean;
  is_urgent: boolean;
}

type Scope = "team" | "comp_team" | "studio" | "direct";

// Ports design-reference/MessagingThread.dc.html. See BUILD_PLAN.md Task 21.
//
// Who may post is scope-dependent per BUILD_PLAN's own text, not the
// BulletinComposer pattern it superficially resembles: studio-wide is
// Director-only, but Team/Comp Team is "anyone who can see it" — since
// reaching this screen with a real thread row already means RLS granted
// that visibility, canPost for those two scopes is just "signed in,"
// unlike Bulletin's instructor/choreographer-only posting. Urgent/pin are
// restricted further (Director, or that channel's assigned instructor/
// choreographer) — real per-scope queries below, same shape as
// BulletinComposer's canPost check. The database enforces both regardless
// of what this screen shows or hides (CLAUDE.md rule 2).
//
// message_thread has no INSERT path for any scope (docs/DEFICIENCIES.md
// #1, reconfirmed for Task 20 and again here) — and message/
// thread_participant/thread_read_state all refuse writes against a
// nonexistent thread too (reconfirmed live for Task 21). Since Task 20's
// Inbox can therefore never link to a real thread id, this screen can
// never be reached with real data today. Built the honest, correct shell
// anyway: real queries, real per-scope composer/urgent/pin gating, real
// mark-as-read, and a real Realtime subscription — all ready to work the
// moment the thread-creation gap is fixed. See DEFICIENCIES.md #1 for the
// full account of what could and couldn't be verified live.
export function MessagingThread() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { person } = useAuth();
  const studio = useStudio();
  const isDirector = hasRole(person, "director");

  const [notFound, setNotFound] = useState(false);
  const [headerName, setHeaderName] = useState("");
  const [headerSubtitle, setHeaderSubtitle] = useState("");
  const [messages, setMessages] = useState<MessageRow[] | null>(null);
  const [personName, setPersonName] = useState<Map<string, string>>(new Map());
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [lastReadAtByPerson, setLastReadAtByPerson] = useState<Map<string, string>>(new Map());
  const [canPost, setCanPost] = useState(false);
  const [canFlag, setCanFlag] = useState(false);
  const [body, setBody] = useState("");
  const [markUrgent, setMarkUrgent] = useState(false);
  const [markPinned, setMarkPinned] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (!person || !id) return;
    let cancelled = false;

    async function load() {
      const { data: t } = await supabase
        .from("message_thread")
        .select("id, scope, team_id, comp_team_id, subject")
        .eq("id", id!)
        .maybeSingle();
      if (cancelled) return;
      if (!t) {
        setNotFound(true);
        return;
      }

      const [{ data: msgRows }, { data: partRows }, { data: readRows }] = await Promise.all([
        supabase.from("message").select("id, author_id, body, created_at, is_pinned, is_urgent").eq("thread_id", t.id).is("deleted_at", null).order("created_at", { ascending: true }),
        supabase.from("thread_participant").select("person_id").eq("thread_id", t.id),
        supabase.from("thread_read_state").select("person_id, last_read_at").eq("thread_id", t.id),
      ]);
      if (cancelled) return;

      const pIds = (partRows ?? []).map((p) => p.person_id);
      const authorIds = [...new Set((msgRows ?? []).map((m) => m.author_id).filter((v): v is string => !!v))];
      const allIds = [...new Set([...pIds, ...authorIds])];
      const { data: peopleRows } = allIds.length > 0 ? await supabase.from("person").select("id, full_name").in("id", allIds) : { data: [] as { id: string; full_name: string }[] };
      if (cancelled) return;
      const nameMap = new Map((peopleRows ?? []).map((p) => [p.id, p.full_name]));

      // thread_participant is only ever populated for direct-scope threads
      // (see docs/DEFICIENCIES.md #1's resolution) — team/comp_team/studio
      // membership is dynamic, so the real audience for "N people" and
      // "Seen by X of Y" comes from team_member/comp_team_cast/confirmed
      // studio members instead, not from pIds.
      let name = t.subject ?? "";
      let subtitle = "";
      let audienceIds = pIds;
      if (t.scope === "team") {
        const [{ data: team }, { data: teamMemberRows }] = await Promise.all([
          supabase.from("team").select("name").eq("id", t.team_id!).single(),
          supabase.from("team_member").select("person_id").eq("team_id", t.team_id!),
        ]);
        name = team?.name ? `${team.name} · Team chat` : "Team chat";
        audienceIds = (teamMemberRows ?? []).map((r) => r.person_id);
        subtitle = `${audienceIds.length} ${audienceIds.length === 1 ? "person" : "people"}`;
      } else if (t.scope === "comp_team") {
        const [{ data: compTeam }, { data: castRows }] = await Promise.all([
          supabase.from("comp_team").select("name").eq("id", t.comp_team_id!).single(),
          supabase.from("comp_team_cast").select("person_id").eq("comp_team_id", t.comp_team_id!),
        ]);
        name = compTeam?.name ? `${compTeam.name} · Cast` : "Cast";
        audienceIds = (castRows ?? []).map((r) => r.person_id);
        subtitle = `${audienceIds.length} ${audienceIds.length === 1 ? "person" : "people"}`;
      } else if (t.scope === "studio") {
        name = t.subject ?? "Studio";
        const { data: confirmedRows } = await supabase.from("person_with_login").select("id").eq("status", "confirmed").eq("is_active", true);
        audienceIds = (confirmedRows ?? []).map((r) => r.id).filter((v): v is string => !!v);
        subtitle = studio ? `Everyone at ${studio.name}` : "Studio-wide";
      } else {
        const otherId = pIds.find((pid) => pid !== person!.id);
        name = (otherId && nameMap.get(otherId)) ?? t.subject ?? "Direct message";
        subtitle = "Direct message";
      }
      if (cancelled) return;

      setHeaderName(name);
      setHeaderSubtitle(subtitle);
      setMessages(msgRows ?? []);
      setParticipantIds(audienceIds);
      setPersonName(nameMap);
      setLastReadAtByPerson(new Map((readRows ?? []).map((r) => [r.person_id, r.last_read_at])));

      const scope = t.scope as Scope;
      if (scope === "studio") {
        setCanPost(isDirector);
        setCanFlag(isDirector);
      } else if (scope === "direct") {
        setCanPost(pIds.includes(person!.id));
        setCanFlag(false);
      } else if (scope === "team") {
        setCanPost(true);
        if (isDirector) {
          setCanFlag(true);
        } else {
          const { data: teachRow } = await supabase.from("team_member").select("person_id").eq("team_id", t.team_id!).eq("person_id", person!.id).eq("role", "instructor").maybeSingle();
          if (!cancelled) setCanFlag(!!teachRow);
        }
      } else if (scope === "comp_team") {
        setCanPost(true);
        if (isDirector) {
          setCanFlag(true);
        } else {
          const { data: choreoRow } = await supabase.from("comp_team_cast").select("person_id").eq("comp_team_id", t.comp_team_id!).eq("person_id", person!.id).eq("role", "choreographer").maybeSingle();
          if (!cancelled) setCanFlag(!!choreoRow);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id, person, isDirector, studio]);

  async function markAsRead() {
    if (!person || !id) return;
    await supabase.from("thread_read_state").upsert({ thread_id: id, person_id: person.id, last_read_at: new Date().toISOString() });
  }

  useEffect(() => {
    if (!person || messages === null) return;
    markAsRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, messages !== null]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible" && messages !== null) markAsRead();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, id, person]);

  // Real Realtime subscription — requires `message` to be added to the
  // supabase_realtime publication server-side (BUILD_PLAN.md's own Task 21
  // instruction). That's an ALTER PUBLICATION statement this codebase has
  // no credentials to run (only the anon key) and shouldn't run anyway —
  // it's DDL against the database, same category CLAUDE.md's four rules
  // keep out of this codebase. Documented as an open step in
  // DEFICIENCIES.md rather than attempted here.
  useEffect(() => {
    if (!id || !person) return;
    const channel = supabase
      .channel(`message-thread-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message", filter: `thread_id=eq.${id}` }, (payload) => {
        const row = payload.new as MessageRow;
        setMessages((prev) => {
          if (!prev) return [row];
          if (prev.some((m) => m.id === row.id)) return prev;
          return [...prev, row];
        });
        if (row.author_id) {
          setPersonName((prev) => {
            if (prev.has(row.author_id!)) return prev;
            supabase
              .from("person")
              .select("id, full_name")
              .eq("id", row.author_id!)
              .maybeSingle()
              .then(({ data }) => {
                if (data) setPersonName((p) => new Map(p).set(data.id, data.full_name));
              });
            return prev;
          });
        }
        markAsRead();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, person]);

  async function send() {
    if (!person || !id || !body.trim()) return;
    setSending(true);
    setError(null);
    const { data: inserted, error: insertErr } = await supabase
      .from("message")
      .insert({
        studio_id: person.studio_id,
        thread_id: id,
        author_id: person.id,
        body: body.trim(),
        is_urgent: canFlag ? markUrgent : false,
        is_pinned: canFlag ? markPinned : false,
      })
      .select()
      .single();
    setSending(false);
    if (insertErr) {
      setError((insertErr as { code?: string }).code === "42501" ? "Messaging isn't set up yet for this studio — check back soon." : "Something went wrong sending that — try again.");
      return;
    }
    setMessages((prev) => {
      if (!prev) return [inserted];
      if (prev.some((m) => m.id === inserted.id)) return prev;
      return [...prev, inserted];
    });
    setBody("");
    setMarkUrgent(false);
    setMarkPinned(false);
    markAsRead();
  }

  const pinnedMessage = useMemo(() => {
    if (!messages) return null;
    const pinned = messages.filter((m) => m.is_pinned);
    return pinned.length > 0 ? pinned[pinned.length - 1] : null;
  }, [messages]);

  const ownLastMessageId = useMemo(() => {
    if (!messages || !person) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].author_id === person.id) return messages[i].id;
    }
    return null;
  }, [messages, person]);

  const grouped = useMemo(() => {
    if (!messages) return [];
    const groups: { label: string; items: MessageRow[] }[] = [];
    for (const m of messages) {
      const label = dayLabel(m.created_at);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(m);
      else groups.push({ label, items: [m] });
    }
    return groups;
  }, [messages]);

  function seenLabel(m: MessageRow): string | null {
    if (m.id !== ownLastMessageId || participantIds.length === 0) return null;
    const seenCount = participantIds.filter((pid) => {
      const readAt = lastReadAtByPerson.get(pid);
      return !!readAt && readAt >= m.created_at;
    }).length;
    return `Seen by ${seenCount} of ${participantIds.length}`;
  }

  function scrollToMessage(msgId: string) {
    messageRefs.current.get(msgId)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (!person) return null;

  if (notFound) {
    return (
      <div style={{ padding: 24 }}>
        <p className="font-display" style={{ fontSize: 18 }}>
          Conversation not found
        </p>
        <p style={{ color: "var(--ink-3)", fontSize: 13 }}>This conversation doesn't exist, or you don't have access to it.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560, display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <div style={{ padding: "16px 20px 13px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid var(--hairline)" }}>
        <div role="button" onClick={() => navigate("/messages")} style={{ cursor: "pointer", color: "var(--ink-2)" }}>
          <BackIcon />
        </div>
        <Avatar name={headerName || "…"} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{headerName || "Loading…"}</div>
          <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{headerSubtitle}</div>
        </div>
      </div>

      {pinnedMessage && (
        <div style={{ padding: "11px 20px 0" }}>
          <div
            role="button"
            onClick={() => scrollToMessage(pinnedMessage.id)}
            style={{ display: "flex", alignItems: "center", gap: 9, background: "var(--signal-tint)", borderRadius: 12, padding: "9px 12px", cursor: "pointer" }}
          >
            <PinIcon />
            <div style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: "var(--signal-ink)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Pinned: {pinnedMessage.body}
            </div>
            <span style={{ fontSize: 11, color: "var(--signal-deep)", fontWeight: 700, flexShrink: 0 }}>Open →</span>
          </div>
        </div>
      )}

      <div style={{ flex: 1, padding: "18px 20px 10px" }}>
        {messages === null ? (
          <p style={{ fontSize: 13, color: "var(--ink-2)" }}>Loading…</p>
        ) : messages.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--ink-2)" }}>No messages yet — say hello.</p>
        ) : (
          grouped.map((g) => (
            <div key={g.label}>
              <div style={{ textAlign: "center", fontSize: 10.5, color: "var(--ink-3)", fontWeight: 600, margin: "14px 0" }}>{g.label}</div>
              {g.items.map((m) => {
                const mine = m.author_id === person.id;
                const seen = seenLabel(m);
                return (
                  <div
                    key={m.id}
                    ref={(el) => {
                      if (el) messageRefs.current.set(m.id, el);
                    }}
                    style={{ display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start", marginTop: 14 }}
                  >
                    {!mine && (
                      <div style={{ fontSize: 10.5, color: "var(--ink-3)", fontWeight: 600, marginBottom: 3, marginLeft: 2 }}>{personName.get(m.author_id ?? "") ?? "Someone"}</div>
                    )}
                    <div
                      style={{
                        maxWidth: "72%",
                        padding: "10px 14px",
                        borderRadius: 16,
                        fontSize: 13.5,
                        lineHeight: 1.45,
                        ...(mine
                          ? { background: "var(--band)", color: "var(--band-ink)", borderBottomRightRadius: 5 }
                          : { background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--hairline)", borderBottomLeftRadius: 5 }),
                      }}
                    >
                      {m.is_urgent && (
                        <div style={{ fontWeight: 700, fontSize: 8.5, padding: "2px 7px", borderRadius: 999, background: "var(--band-card)", color: "var(--signal)", letterSpacing: "0.04em", display: "inline-block", marginBottom: 5 }}>
                          IMPORTANT
                        </div>
                      )}
                      <div>{m.body}</div>
                    </div>
                    <div style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 4 }}>
                      {formatTime(m.created_at)}
                      {seen ? ` · ${seen}` : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      <div style={{ padding: "11px 20px 16px", borderTop: "1px solid var(--hairline)" }}>
        {!canPost ? (
          <p style={{ textAlign: "center", fontSize: 12, color: "var(--ink-3)" }}>You can't post in this conversation.</p>
        ) : (
          <>
            {canFlag && (
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <ToggleChip active={markUrgent} onClick={() => setMarkUrgent((v) => !v)} label="Urgent" />
                <ToggleChip active={markPinned} onClick={() => setMarkPinned((v) => !v)} label="Pin" />
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={`Message ${headerName || "…"}…`}
                style={{ flex: 1, background: "var(--sand)", border: "none", borderRadius: 999, padding: "10px 16px", fontSize: 13, color: "var(--ink)", outline: "none" }}
              />
              <button
                type="button"
                onClick={send}
                disabled={!body.trim() || sending}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  background: "var(--signal)",
                  color: "var(--signal-ink)",
                  border: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  cursor: !body.trim() || sending ? "default" : "pointer",
                  opacity: !body.trim() || sending ? 0.6 : 1,
                }}
              >
                <SendIcon />
              </button>
            </div>
            {error && <div style={{ marginTop: 8, fontSize: 12, color: "var(--busy)" }}>{error}</div>}
          </>
        )}
      </div>
    </div>
  );
}

function ToggleChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "6px 13px",
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: 700,
        border: "none",
        cursor: "pointer",
        background: active ? "var(--signal)" : "var(--sand)",
        color: active ? "var(--signal-ink)" : "var(--ink-2)",
      }}
    >
      {label}
    </button>
  );
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function BackIcon() {
  return (
    <svg style={{ width: 20, height: 20 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg style={{ width: 14, height: 14, color: "var(--signal-deep)", flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M16 3l5 5-6 2-3 7-4-4 7-3 2-6z" />
      <path d="M4 20l4.5-4.5" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg style={{ width: 15, height: 15 }} viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 20l18-8-18-8v6l13 2-13 2z" />
    </svg>
  );
}
