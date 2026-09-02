import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthProvider";
import { useTeamsIndexData } from "../lib/useTeamsIndexData";

type Scope = "studio" | "team" | "comp_team";
interface Destination {
  scope: Scope;
  id: string | null;
  name: string;
}

// Ports design-reference/DirectorBroadcastComposer.dc.html — mobile
// counterpart to DirectorHome's "Broadcast to studio" quick action
// (both now point at this same /broadcast route — see BUILD_PLAN.md
// Task 25). Posts to the same Bulletin feed every destination already
// has (BulletinComposer, Task 17) — the only real difference is this
// screen picks the destination itself first, rather than being opened
// already pre-scoped from inside that destination. Director-only in
// practice (no nav path here for anyone else), so no per-destination
// postable check is needed the way BulletinComposer's own instructor/
// choreographer gate needs — a Director can already post anywhere.
export function DirectorBroadcastComposer() {
  const { person } = useAuth();
  const navigate = useNavigate();
  const { data } = useTeamsIndexData();

  const [destination, setDestination] = useState<Destination>({ scope: "studio", id: null, name: "Studio-wide" });
  const [body, setBody] = useState("");
  const [important, setImportant] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!person || !data) return null;

  const destinations: Destination[] = [
    { scope: "studio", id: null, name: "Studio-wide" },
    ...data.teams.map((t) => ({ scope: "team" as const, id: t.id, name: t.name })),
    ...data.compTeams.map((c) => ({ scope: "comp_team" as const, id: c.id, name: c.name })),
  ];

  async function submit() {
    if (!person || !body.trim()) return;
    setSubmitting(true);
    setError(null);
    const { data: season } = await supabase.from("season").select("id").eq("studio_id", person.studio_id).eq("is_current", true).single();
    const { error: insertErr } = await supabase.from("post").insert({
      studio_id: person.studio_id,
      author_id: person.id,
      season_id: season!.id,
      scope: destination.scope,
      team_id: destination.scope === "team" ? destination.id : null,
      comp_team_id: destination.scope === "comp_team" ? destination.id : null,
      important,
      body: body.trim(),
    });
    setSubmitting(false);
    if (insertErr) {
      setError("Something went wrong posting this — try again.");
      return;
    }
    navigate(-1);
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ padding: "16px 20px 14px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid var(--hairline)" }}>
        <div role="button" onClick={() => navigate(-1)} style={{ cursor: "pointer", color: "var(--ink-2)" }}>
          <CloseIcon />
        </div>
        <div className="font-display" style={{ fontWeight: 700, fontSize: 16 }}>
          New broadcast
        </div>
      </div>

      <div style={{ padding: "20px 20px 40px" }}>
        <Eyebrow>Post to</Eyebrow>
        <div style={{ marginTop: 10, display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
          {destinations.map((d) => (
            <button
              key={`${d.scope}:${d.id ?? "studio"}`}
              type="button"
              onClick={() => setDestination(d)}
              style={{
                padding: "8px 15px",
                borderRadius: 999,
                border: "none",
                fontSize: 12.5,
                fontWeight: 700,
                whiteSpace: "nowrap",
                cursor: "pointer",
                background: destination.scope === d.scope && destination.id === d.id ? "var(--ink)" : "var(--sand)",
                color: destination.scope === d.scope && destination.id === d.id ? "var(--paper)" : "var(--ink-2)",
              }}
            >
              {d.name}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 8 }}>
          {destination.scope === "studio"
            ? "Reaches everyone at the studio — parents, dancers, instructors, and anyone else confirmed on the roster."
            : `Reaches everyone on ${destination.name}.`}
        </p>

        <div style={{ marginTop: 22 }}>
          <Eyebrow>Message</Eyebrow>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write what everyone needs to know…"
            rows={5}
            style={{ width: "100%", marginTop: 10, background: "var(--sand)", border: "none", borderRadius: 12, padding: 14, fontSize: 13.5, color: "var(--ink)", lineHeight: 1.6, fontFamily: "inherit", resize: "vertical" }}
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <div className="card" style={{ border: "1px solid var(--hairline)", borderRadius: 16 }}>
            <div
              role="button"
              onClick={() => setImportant((v) => !v)}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", cursor: "pointer" }}
            >
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>Mark Important</div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2, maxWidth: 250, lineHeight: 1.4 }}>
                  Pushes a notification instead of just a feed badge — save it for things people need to see today.
                </div>
              </div>
              <div style={{ width: 38, height: 22, borderRadius: 999, background: important ? "var(--signal)" : "var(--hairline)", position: "relative", flexShrink: 0 }}>
                <div style={{ position: "absolute", top: 2, left: important ? 18 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.25)", transition: "left 120ms ease" }} />
              </div>
            </div>
          </div>
        </div>

        {error && <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--busy)" }}>{error}</div>}

        <div style={{ marginTop: 26 }}>
          <button
            type="button"
            onClick={submit}
            disabled={!body.trim() || submitting}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "15px 20px",
              borderRadius: 12,
              background: "var(--signal)",
              color: "var(--signal-ink)",
              fontSize: 14.5,
              fontWeight: 700,
              border: "none",
              opacity: !body.trim() || submitting ? 0.6 : 1,
              cursor: !body.trim() || submitting ? "default" : "pointer",
            }}
          >
            {submitting ? "Sending…" : `Send to ${destination.name}`}
          </button>
          <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 10, textAlign: "center" }}>
            Posted by {person.full_name}, Director · visible in {destination.name} › Bulletin right after sending
          </div>
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
