import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, callApp } from "../lib/supabase";
import { useAuth, type Role } from "../lib/AuthProvider";
import { useStudio } from "../lib/useStudio";
import { Avatar } from "../components/Avatar";

interface DancerRow {
  id: string;
  full_name: string;
  destinations: string;
}

interface DestRow {
  kind: "team" | "comp_team";
  id: string;
  name: string;
  label: string; // "You teach this team" / "You choreograph this dance" / "You dance here"
  chip: "Instructor" | "Choreographer" | "Dancer";
}

const ROLE_LABEL: Record<Role, string> = {
  director: "Director",
  instructor: "Instructor",
  dancer: "Dancer",
  parent: "Parent",
};

const NOTIFICATION_PREFS_KEY = "notification-prefs";

interface NotificationPrefs {
  importantPosts: boolean;
  newMessages: boolean;
  scheduleChanges: boolean;
}

function loadPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(NOTIFICATION_PREFS_KEY);
    if (raw) return { importantPosts: true, newMessages: true, scheduleChanges: true, ...JSON.parse(raw) };
  } catch {
    // ignore malformed storage
  }
  return { importantPosts: true, newMessages: true, scheduleChanges: true };
}

// Ports design-reference/ProfileAccount.dc.html — see BUILD_PLAN.md Task 16.
// Notification toggles are collected into localStorage only: there is no
// notification-preference table anywhere in the schema (see
// docs/DEFICIENCIES.md #17/#22), so nothing server-side reads these yet —
// this is real, persisted UI state, not a stub, but it doesn't drive any
// actual push/email delivery.
export function ProfileAccount() {
  const { person } = useAuth();
  const studio = useStudio();
  const [email, setEmail] = useState<string | null>(null);
  const [dancers, setDancers] = useState<DancerRow[] | null>(null);
  const [destinations, setDestinations] = useState<DestRow[] | null>(null);
  const [prefs, setPrefs] = useState<NotificationPrefs>(loadPrefs);
  const [changingPassword, setChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  useEffect(() => {
    if (!person) return;
    const personId = person.id;
    let cancelled = false;
    async function load() {
      const [{ data: guardianRows }, { data: teachIds }, { data: choreographIds }, { data: myTeamRows }, { data: myCastRows }] = await Promise.all([
        supabase.from("guardian_link").select("dancer_id, dancer:dancer_id(full_name)").eq("guardian_id", personId),
        callApp<string[]>("teams_i_teach"),
        callApp<string[]>("comp_teams_i_choreograph"),
        supabase.from("team_member").select("team_id").eq("person_id", personId).eq("role", "dancer"),
        supabase.from("comp_team_cast").select("comp_team_id").eq("person_id", personId).eq("role", "dancer"),
      ]);

      const dancerIds = (guardianRows ?? []).map((g) => g.dancer_id);
      let dancerRows: DancerRow[] = [];
      if (dancerIds.length > 0) {
        const [{ data: dTeamRows }, { data: dCastRows }] = await Promise.all([
          supabase.from("team_member").select("person_id, team:team_id(name)").in("person_id", dancerIds).eq("role", "dancer"),
          supabase.from("comp_team_cast").select("person_id, comp_team:comp_team_id(name)").in("person_id", dancerIds).eq("role", "dancer"),
        ]);
        const destByDancer = new Map<string, string[]>();
        for (const r of dTeamRows ?? []) {
          const name = (r.team as unknown as { name: string } | null)?.name;
          if (!name) continue;
          const arr = destByDancer.get(r.person_id) ?? [];
          arr.push(name);
          destByDancer.set(r.person_id, arr);
        }
        for (const r of dCastRows ?? []) {
          const name = (r.comp_team as unknown as { name: string } | null)?.name;
          if (!name) continue;
          const arr = destByDancer.get(r.person_id) ?? [];
          arr.push(name);
          destByDancer.set(r.person_id, arr);
        }
        dancerRows = (guardianRows ?? []).map((g) => ({
          id: g.dancer_id,
          full_name: (g.dancer as unknown as { full_name: string } | null)?.full_name ?? "Dancer",
          destinations: (destByDancer.get(g.dancer_id) ?? []).join(", "),
        }));
      }

      const destRows: DestRow[] = [];
      const teachSet = new Set(teachIds ?? []);
      const choreographSet = new Set(choreographIds ?? []);
      if (teachSet.size > 0) {
        const { data: teamRows } = await supabase.from("team").select("id, name").in("id", [...teachSet]);
        for (const t of teamRows ?? []) destRows.push({ kind: "team", id: t.id, name: t.name, label: "You teach this team", chip: "Instructor" });
      }
      if (choreographSet.size > 0) {
        const { data: compTeamRows } = await supabase.from("comp_team").select("id, name").in("id", [...choreographSet]);
        for (const c of compTeamRows ?? []) destRows.push({ kind: "comp_team", id: c.id, name: c.name, label: "You choreograph this dance", chip: "Choreographer" });
      }
      const myTeamIds = (myTeamRows ?? []).map((r) => r.team_id);
      if (myTeamIds.length > 0) {
        const { data: teamRows } = await supabase.from("team").select("id, name").in("id", myTeamIds);
        for (const t of teamRows ?? []) destRows.push({ kind: "team", id: t.id, name: t.name, label: "You dance here", chip: "Dancer" });
      }
      const myCastIds = (myCastRows ?? []).map((r) => r.comp_team_id);
      if (myCastIds.length > 0) {
        const { data: compTeamRows } = await supabase.from("comp_team").select("id, name").in("id", myCastIds);
        for (const c of compTeamRows ?? []) destRows.push({ kind: "comp_team", id: c.id, name: c.name, label: "You dance here", chip: "Dancer" });
      }

      if (cancelled) return;
      setDancers(dancerRows);
      setDestinations(destRows);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [person]);

  function togglePref(key: keyof NotificationPrefs) {
    setPrefs((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(next));
      return next;
    });
  }

  async function savePassword() {
    if (newPassword.length < 8) {
      setPasswordMsg("Password needs to be at least 8 characters.");
      return;
    }
    setPasswordBusy(true);
    setPasswordMsg(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordBusy(false);
    if (error) {
      setPasswordMsg(error.message);
      return;
    }
    setPasswordMsg("Password updated.");
    setNewPassword("");
    setTimeout(() => setChangingPassword(false), 1200);
  }

  if (!person || !studio) return null;

  return (
    <div style={{ padding: "22px 20px 40px", maxWidth: 560 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Avatar name={person.full_name} size={52} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{person.full_name}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            {person.roles.map((r) => (
              <RoleChip key={r} label={ROLE_LABEL[r]} instructorTone={r === "instructor" || r === "director"} />
            ))}
          </div>
        </div>
      </div>

      <Eyebrow style={{ marginTop: 26 }}>Your roles at {studio.name}</Eyebrow>
      <p style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 3, lineHeight: 1.5 }}>
        What feeds your Home and Schedule — a role chip like these travels with every item that belongs to it.
      </p>
      <div className="card" style={{ marginTop: 10, border: "1px solid var(--hairline)", borderRadius: 18, overflow: "hidden" }}>
        {dancers === null || destinations === null ? (
          <div style={rowStyle}>
            <span style={{ fontSize: 13, color: "var(--ink-2)" }}>Loading…</span>
          </div>
        ) : dancers.length === 0 && destinations.length === 0 ? (
          <div style={rowStyle}>
            <span style={{ fontSize: 13, color: "var(--ink-2)" }}>Nothing yet.</span>
          </div>
        ) : (
          <>
            {dancers.map((d, i) => (
              <Link key={d.id} to={`/dancer/${d.id}`} style={{ ...rowStyle, borderTop: i === 0 ? "none" : "1px solid var(--hairline)", color: "inherit" }}>
                <Avatar name={d.full_name} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{d.full_name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                    Your dancer{d.destinations ? ` · ${d.destinations}` : ""}
                  </div>
                </div>
                <RoleChip label="Parent" instructorTone={false} />
                <ChevronIcon />
              </Link>
            ))}
            {destinations.map((dest, i) => (
              <div key={`${dest.kind}:${dest.id}`} style={{ ...rowStyle, borderTop: dancers.length === 0 && i === 0 ? "none" : "1px solid var(--hairline)" }}>
                <Avatar name={dest.name} size={34} tone={dest.chip === "Dancer" ? "default" : "band"} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{dest.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>{dest.label}</div>
                </div>
                <RoleChip label={dest.chip} instructorTone={dest.chip !== "Dancer"} />
              </div>
            ))}
          </>
        )}
      </div>

      <Eyebrow style={{ marginTop: 22 }}>Notifications</Eyebrow>
      <div className="card" style={{ marginTop: 10, border: "1px solid var(--hairline)", borderRadius: 18, overflow: "hidden" }}>
        <PrefRow label="Important posts" sublabel="Pushed even if messages are muted" on={prefs.importantPosts} onToggle={() => togglePref("importantPosts")} first />
        <PrefRow label="New messages" on={prefs.newMessages} onToggle={() => togglePref("newMessages")} />
        <PrefRow label="Schedule changes" on={prefs.scheduleChanges} onToggle={() => togglePref("scheduleChanges")} />
      </div>

      <Eyebrow style={{ marginTop: 22 }}>Studio codes</Eyebrow>
      <div className="card" style={{ marginTop: 10, border: "1px solid var(--hairline)", borderRadius: 18, overflow: "hidden" }}>
        <Link to="/join" style={{ ...rowStyle, color: "inherit" }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--sand)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <CodeIcon />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Add another code</div>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>Got a code for a different role, like instructor? Add it any time.</div>
          </div>
          <ChevronIcon />
        </Link>
      </div>

      <Eyebrow style={{ marginTop: 22 }}>Account</Eyebrow>
      <div className="card" style={{ marginTop: 10, border: "1px solid var(--hairline)", borderRadius: 18, overflow: "hidden" }}>
        <div style={rowStyle}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Email</div>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>{email ?? "…"}</div>
          </div>
        </div>
        <div style={{ borderTop: "1px solid var(--hairline)" }}>
          <div role="button" onClick={() => setChangingPassword((v) => !v)} style={{ ...rowStyle, cursor: "pointer" }}>
            <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600 }}>Change password</div>
            <ChevronIcon />
          </div>
          {changingPassword && (
            <div style={{ padding: "0 18px 16px" }}>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password (min. 8 characters)"
                style={{ width: "100%", background: "var(--sand)", border: "none", borderRadius: 10, padding: "10px 12px", fontSize: 13.5, color: "var(--ink)" }}
              />
              {passwordMsg && <div style={{ fontSize: 12, color: passwordMsg === "Password updated." ? "var(--ok)" : "var(--busy)", marginTop: 8 }}>{passwordMsg}</div>}
              <button
                type="button"
                onClick={savePassword}
                disabled={passwordBusy}
                style={{ marginTop: 10, padding: "9px 16px", borderRadius: 9, background: "var(--signal)", color: "var(--signal-ink)", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer" }}
              >
                {passwordBusy ? "Saving…" : "Save password"}
              </button>
            </div>
          )}
        </div>
        <div role="button" onClick={() => supabase.auth.signOut()} style={{ ...rowStyle, borderTop: "1px solid var(--hairline)", cursor: "pointer" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--busy)" }}>Sign out</div>
        </div>
      </div>
    </div>
  );
}

function RoleChip({ label, instructorTone }: { label: string; instructorTone: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "5px 12px",
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: 600,
        flexShrink: 0,
        background: instructorTone ? "var(--band)" : "var(--sand)",
        color: instructorTone ? "var(--signal)" : "var(--ink-2)",
      }}
    >
      {label}
    </span>
  );
}

function PrefRow({ label, sublabel, on, onToggle, first }: { label: string; sublabel?: string; on: boolean; onToggle: () => void; first?: boolean }) {
  return (
    <div role="button" onClick={onToggle} style={{ ...rowStyle, borderTop: first ? "none" : "1px solid var(--hairline)", cursor: "pointer" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
        {sublabel && <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>{sublabel}</div>}
      </div>
      <div style={{ width: 40, height: 23, borderRadius: 999, background: on ? "var(--signal)" : "var(--hairline)", position: "relative", flexShrink: 0 }}>
        <div style={{ position: "absolute", top: 2.5, left: on ? 19.5 : 2.5, width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.25)", transition: "left 120ms ease" }} />
      </div>
    </div>
  );
}

function Eyebrow({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ fontFamily: "var(--font-display)", fontSize: 10.5, letterSpacing: "0.11em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600, ...style }}>
      {children}
    </div>
  );
}

const rowStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, padding: "15px 18px", textDecoration: "none" };

function ChevronIcon() {
  return (
    <svg style={{ width: 16, height: 16, color: "var(--ink-3)", flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg style={{ width: 18, height: 18, color: "var(--ink-2)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
      <path d="M4 8V5a1 1 0 011-1h3M20 8V5a1 1 0 00-1-1h-3M4 16v3a1 1 0 001 1h3M20 16v3a1 1 0 01-1 1h-3" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  );
}
