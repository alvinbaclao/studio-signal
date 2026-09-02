import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase, callApp } from "../lib/supabase";
import { useAuth } from "../lib/AuthProvider";
import { useStudioDirectory, ROLE_PRIORITY, ROLE_LABEL } from "../lib/useStudioDirectory";
import { Avatar } from "../components/Avatar";

interface ExistingThread {
  id: string;
  scope: string;
  name: string;
}

// Ports design-reference/NewMessage.dc.html — deliberately one-to-one
// only. Team/Comp Team/Studio threads already exist in the inbox list, so
// this screen doesn't duplicate them, just links out to open one. See
// BUILD_PLAN.md Task 20.
//
// Tapping a person calls app.start_direct_thread — not a raw client
// insert. A freshly-created direct thread is invisible to everyone,
// including its own creator, until a thread_participant row exists for
// it, but creating that row requires the thread to already be visible —
// a raw client can never resolve that on its own (see
// docs/DEFICIENCIES.md #1, resolved). The RPC is SECURITY DEFINER, so it
// creates the thread and both participant rows atomically and is
// idempotent — calling it again for the same pair reopens the same
// thread instead of creating a duplicate.
export function NewMessage() {
  const { person } = useAuth();
  const navigate = useNavigate();
  const { people, metaByPerson } = useStudioDirectory();
  const [existingThreads, setExistingThreads] = useState<ExistingThread[] | null>(null);
  const [search, setSearch] = useState("");
  const [startingId, setStartingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!person) return;
    let cancelled = false;
    async function load() {
      const { data: threadIds } = await callApp<string[]>("threads_i_can_see");
      const ids = threadIds ?? [];
      if (ids.length === 0) {
        if (!cancelled) setExistingThreads([]);
        return;
      }
      const { data: threadRows } = await supabase.from("message_thread").select("id, scope, team_id, comp_team_id, subject").in("id", ids).neq("scope", "direct");
      const teamIds = [...new Set((threadRows ?? []).filter((t) => t.team_id).map((t) => t.team_id!))];
      const compTeamIds = [...new Set((threadRows ?? []).filter((t) => t.comp_team_id).map((t) => t.comp_team_id!))];
      const [{ data: teamRows }, { data: compTeamRows }] = await Promise.all([
        teamIds.length > 0 ? supabase.from("team").select("id, name").in("id", teamIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        compTeamIds.length > 0 ? supabase.from("comp_team").select("id, name").in("id", compTeamIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      ]);
      const teamName = new Map((teamRows ?? []).map((t) => [t.id, t.name]));
      const compTeamName = new Map((compTeamRows ?? []).map((c) => [c.id, c.name]));
      if (cancelled) return;
      setExistingThreads(
        (threadRows ?? []).map((t) => ({
          id: t.id,
          scope: t.scope,
          name:
            t.scope === "team" ? `${teamName.get(t.team_id!) ?? "Team"} · Team chat` : t.scope === "comp_team" ? `${compTeamName.get(t.comp_team_id!) ?? "Comp Team"} · Cast` : t.subject ?? "Studio",
        }))
      );
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [person]);

  const q = search.trim().toLowerCase();
  const filteredPeople = useMemo(() => (people ?? []).filter((p) => p.id !== person?.id && (!q || p.full_name.toLowerCase().includes(q))), [people, person, q]);

  async function startDirect(otherId: string) {
    if (!person) return;
    setStartingId(otherId);
    setError(null);
    const { data: threadId, error: rpcErr } = await callApp<string>("start_direct_thread", { p_other_person_id: otherId });
    setStartingId(null);
    if (rpcErr || !threadId) {
      setError("Something went wrong starting this conversation — try again.");
      return;
    }
    navigate(`/messages/thread/${threadId}`);
  }

  if (!person) return null;

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ padding: "16px 20px 14px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid var(--hairline)" }}>
        <div role="button" onClick={() => navigate(-1)} style={{ cursor: "pointer", color: "var(--ink-2)" }}>
          <CloseIcon />
        </div>
        <div className="font-display" style={{ fontWeight: 700, fontSize: 16 }}>
          New message
        </div>
      </div>

      <div style={{ padding: "18px 20px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, background: "var(--sand)", borderRadius: 12, padding: "11px 14px" }}>
          <SearchIcon />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search people…"
            style={{ border: "none", background: "none", outline: "none", fontSize: 13, flex: 1, color: "var(--ink)" }}
          />
        </div>

        {error && (
          <div style={{ marginTop: 16, background: "var(--busy-tint)", color: "var(--busy)", borderRadius: 12, padding: "11px 14px", fontSize: 12.5 }}>{error}</div>
        )}

        {(existingThreads === null || existingThreads.length > 0) && (
          <div style={{ marginTop: 20 }}>
            <Eyebrow>Team &amp; group threads</Eyebrow>
            <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4, lineHeight: 1.5 }}>
              Already exist — open one from your inbox instead of starting a new one.
            </p>
            {existingThreads === null ? (
              <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 10 }}>Loading…</p>
            ) : (
              <div className="card" style={{ marginTop: 10, border: "1px solid var(--hairline)", borderRadius: 16, padding: "2px 16px" }}>
                {existingThreads.map((t, i) => (
                  <Link key={t.id} to={`/messages/thread/${t.id}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0", borderTop: i === 0 ? "none" : "1px solid var(--hairline)", color: "inherit" }}>
                    <Avatar name={t.name} size={34} />
                    <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700 }}>{t.name}</div>
                    <ChevronIcon />
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 22 }}>
          <Eyebrow>People</Eyebrow>
          <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4, lineHeight: 1.5 }}>Pick someone to start a new one-to-one.</p>
          {people === null ? (
            <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 10 }}>Loading…</p>
          ) : filteredPeople.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 10 }}>No matches.</p>
          ) : (
            <div className="card" style={{ marginTop: 10, border: "1px solid var(--hairline)", borderRadius: 16, padding: "2px 16px" }}>
              {filteredPeople.map((p, i) => {
                const primary = ROLE_PRIORITY.find((r) => p.roles.includes(r));
                const isInk = primary === "director" || primary === "instructor";
                return (
                  <div
                    key={p.id}
                    role="button"
                    onClick={() => startDirect(p.id)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0", borderTop: i === 0 ? "none" : "1px solid var(--hairline)", cursor: "pointer", opacity: startingId && startingId !== p.id ? 0.5 : 1 }}
                  >
                    <Avatar name={p.full_name} size={34} tone={isInk ? "band" : "default"} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700 }}>{p.full_name}</div>
                      <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 1 }}>{metaByPerson.get(p.id) ?? ""}</div>
                    </div>
                    {primary && (
                      <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 999, background: isInk ? "var(--band)" : "var(--sand)", color: isInk ? "var(--signal)" : "var(--ink-2)", fontSize: 10.5, fontWeight: 600, flexShrink: 0 }}>
                        {startingId === p.id ? "…" : ROLE_LABEL[primary]}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "var(--font-display)", fontSize: 10.5, letterSpacing: "0.11em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>
      {children}
    </div>
  );
}

function CloseIcon() {
  return (
    <svg style={{ width: 18, height: 18 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg style={{ width: 16, height: 16, color: "var(--ink-3)", flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg style={{ width: 15, height: 15, color: "var(--ink-3)", flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}
