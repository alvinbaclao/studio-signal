import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase, callApp } from "../lib/supabase";
import { useAuth, hasRole } from "../lib/AuthProvider";
import { Placeholder } from "./Placeholder";
import type { Database } from "../lib/database.types";

type JoinCodeScope = Database["public"]["Enums"]["join_code_scope"];
type JoinCodeRow = Database["public"]["Tables"]["studio_join_code"]["Row"];
type StudioRow = Database["public"]["Tables"]["studio"]["Row"];
type SpaceRow = Database["public"]["Tables"]["studio_space"]["Row"];
type StyleRow = Database["public"]["Tables"]["dance_style"]["Row"];

// Ports design-reference/JoinCodeManagement.dc.html, the "Join codes" tab
// of the Settings destination — "Studio & dance styles" is Task 26, which
// shares this same tab bar. See BUILD_PLAN.md Task 3.
export function Settings() {
  const { person } = useAuth();
  const [tab, setTab] = useState<"join-codes" | "studio">("join-codes");

  if (!hasRole(person, "director")) {
    return <Placeholder title="Settings" />;
  }

  return (
    <div style={{ padding: "18px 34px 30px" }}>
      <h2 style={{ fontSize: 24, letterSpacing: "-0.01em" }}>Settings</h2>

      <div style={{ display: "flex", gap: 6, borderBottom: "1px solid var(--hairline)", marginTop: 16 }}>
        <TabButton active={tab === "join-codes"} onClick={() => setTab("join-codes")}>
          Join codes
        </TabButton>
        <TabButton active={tab === "studio"} onClick={() => setTab("studio")}>
          Studio &amp; dance styles
        </TabButton>
      </div>

      {tab === "join-codes" ? (
        <>
          <p style={{ fontSize: 13, color: "var(--ink-2)", margin: "16px 0 0", maxWidth: 640, lineHeight: 1.6 }}>
            Share the QR or the code — both open the same join link. Rotating invalidates the old
            one immediately; anyone who already joined keeps their account.
          </p>

          <div style={{ marginTop: 22, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <JoinCodePanel
              studioId={person!.studio_id}
              scope="parent_dancer"
              eyebrow="Parent & dancer code"
              note={null}
            />
            <JoinCodePanel
              studioId={person!.studio_id}
              scope="instructor"
              eyebrow="Instructor code"
              note="Higher-trust code — a leaked link here reaches roster and posting access once assigned."
            />
          </div>
        </>
      ) : (
        <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 20, maxWidth: 720 }}>
          <StudioProfileCard studioId={person!.studio_id} />
          <StudioSpacesCard studioId={person!.studio_id} />
          <DanceStylesCard studioId={person!.studio_id} />
        </div>
      )}
    </div>
  );
}

const TIMEZONES = [
  { value: "America/Toronto", label: "Eastern Time (Toronto)" },
  { value: "America/New_York", label: "Eastern Time (New York)" },
  { value: "America/Winnipeg", label: "Central Time (Winnipeg)" },
  { value: "America/Chicago", label: "Central Time (Chicago)" },
  { value: "America/Edmonton", label: "Mountain Time (Edmonton)" },
  { value: "America/Denver", label: "Mountain Time (Denver)" },
  { value: "America/Vancouver", label: "Pacific Time (Vancouver)" },
  { value: "America/Los_Angeles", label: "Pacific Time (Los Angeles)" },
  { value: "America/Halifax", label: "Atlantic Time (Halifax)" },
  { value: "America/St_Johns", label: "Newfoundland Time (St. John's)" },
];

// Ports design-reference/DirectorSettings.dc.html's "Studio profile" card —
// same record the first-run setup wizard wrote (studio_write RLS, Director
// only), now editable ongoing instead of locked after setup. logo_path
// excluded: no Storage bucket exists yet (docs/DEFICIENCIES.md #2).
function StudioProfileCard({ studioId }: { studioId: string }) {
  const [studio, setStudio] = useState<StudioRow | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Pick<StudioRow, "name" | "address" | "phone" | "email" | "timezone"> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase.from("studio").select("*").eq("id", studioId).single();
    setStudio(data);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studioId]);

  const startEdit = () => {
    if (!studio) return;
    setDraft({ name: studio.name, address: studio.address, phone: studio.phone, email: studio.email, timezone: studio.timezone });
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    if (!draft || !draft.name.trim()) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from("studio")
      .update({
        name: draft.name.trim(),
        address: draft.address?.trim() || null,
        phone: draft.phone?.trim() || null,
        email: draft.email?.trim() || null,
        timezone: draft.timezone,
      })
      .eq("id", studioId);
    setBusy(false);
    if (error) {
      setError("Something went wrong saving this — try again.");
      return;
    }
    setEditing(false);
    await load();
  };

  if (!studio) return null;

  return (
    <div className="card" style={{ border: "1px solid var(--hairline)", borderRadius: 16, padding: "24px 26px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <Eyebrow>Studio profile</Eyebrow>
        {!editing && <SmallButton onClick={startEdit}>Edit</SmallButton>}
      </div>

      {editing && draft ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
            <LabeledInput label="Studio name" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
            <LabeledSelect
              label="Timezone"
              value={draft.timezone}
              options={TIMEZONES}
              onChange={(v) => setDraft({ ...draft, timezone: v })}
            />
            <LabeledInput label="Address" value={draft.address ?? ""} onChange={(v) => setDraft({ ...draft, address: v })} />
            <LabeledInput label="Phone" value={draft.phone ?? ""} onChange={(v) => setDraft({ ...draft, phone: v })} />
            <LabeledInput label="Email" value={draft.email ?? ""} onChange={(v) => setDraft({ ...draft, email: v })} />
          </div>
          {error && <p style={{ fontSize: 12.5, color: "var(--busy)", marginTop: 12 }}>{error}</p>}
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <PrimaryButton onClick={save} disabled={busy || !draft.name.trim()}>
              {busy ? "Saving…" : "Save"}
            </PrimaryButton>
            <SmallButton onClick={() => setEditing(false)}>Cancel</SmallButton>
          </div>
        </>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
          <ReadField label="Studio name" value={studio.name} />
          <ReadField label="Timezone" value={TIMEZONES.find((t) => t.value === studio.timezone)?.label ?? studio.timezone} />
          <ReadField label="Address" value={studio.address ?? "—"} />
          <ReadField label="Phone" value={studio.phone ?? "—"} />
          <ReadField label="Email" value={studio.email ?? "—"} />
        </div>
      )}

      <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px dashed var(--hairline)", fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.5 }}>
        This is what shows on invites, receipts, and the join screen.
      </div>
    </div>
  );
}

// Ports the "Studio Spaces" card — deactivate-only, never hard-deleted
// (BUILD_PLAN.md Task 26), since past events still reference a space by id
// (event.studio_space_id). Drag-to-reorder from the artboard is dropped —
// no reorder UI is required by BUILD_PLAN and this list already reads in a
// stable, sensible order (sort_order, then name).
function StudioSpacesCard({ studioId }: { studioId: string }) {
  const [spaces, setSpaces] = useState<SpaceRow[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFloor, setNewFloor] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameFloor, setRenameFloor] = useState("");

  const load = async () => {
    const { data } = await supabase
      .from("studio_space")
      .select("*")
      .eq("studio_id", studioId)
      .order("sort_order")
      .order("name");
    setSpaces(data ?? []);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studioId]);

  const addSpace = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.from("studio_space").insert({
      studio_id: studioId,
      name: newName.trim(),
      floor_type: newFloor.trim() || null,
    });
    setBusy(false);
    if (error) {
      setError("Something went wrong adding this — try again.");
      return;
    }
    setNewName("");
    setNewFloor("");
    setAdding(false);
    await load();
  };

  const startRename = (s: SpaceRow) => {
    setRenamingId(s.id);
    setRenameName(s.name);
    setRenameFloor(s.floor_type ?? "");
    setError(null);
  };

  const saveRename = async (id: string) => {
    if (!renameName.trim()) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from("studio_space")
      .update({ name: renameName.trim(), floor_type: renameFloor.trim() || null })
      .eq("id", id);
    setBusy(false);
    if (error) {
      setError("Something went wrong saving this — try again.");
      return;
    }
    setRenamingId(null);
    await load();
  };

  const toggleActive = async (s: SpaceRow) => {
    setBusy(true);
    await supabase.from("studio_space").update({ is_active: !s.is_active }).eq("id", s.id);
    setBusy(false);
    await load();
  };

  if (!spaces) return null;

  return (
    <div className="card" style={{ border: "1px solid var(--hairline)", borderRadius: 16, padding: "24px 26px 4px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", paddingBottom: 14 }}>
        <Eyebrow>Studio Spaces · {spaces.length}</Eyebrow>
        {!adding && <SmallButton onClick={() => setAdding(true)}>+ Add space</SmallButton>}
      </div>

      {adding && (
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", padding: "0 0 16px", flexWrap: "wrap" }}>
          <LabeledInput label="Name" value={newName} onChange={setNewName} placeholder="Studio C" />
          <LabeledInput label="Floor type (optional)" value={newFloor} onChange={setNewFloor} placeholder="Sprung" />
          <PrimaryButton onClick={addSpace} disabled={busy || !newName.trim()}>
            Add
          </PrimaryButton>
          <SmallButton onClick={() => { setAdding(false); setNewName(""); setNewFloor(""); }}>Cancel</SmallButton>
        </div>
      )}

      {error && <p style={{ fontSize: 12.5, color: "var(--busy)", padding: "0 0 12px" }}>{error}</p>}

      {spaces.length === 0 ? (
        <p style={{ padding: "0 0 18px", fontSize: 13, color: "var(--ink-2)" }}>No spaces yet.</p>
      ) : (
        spaces.map((s, i) => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 13, padding: "14px 0", borderTop: i === 0 ? "none" : "1px solid var(--hairline)", opacity: s.is_active ? 1 : 0.5 }}>
            {renamingId === s.id ? (
              <>
                <div style={{ flex: 1, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <LabeledInput label="Name" value={renameName} onChange={setRenameName} />
                  <LabeledInput label="Floor type" value={renameFloor} onChange={setRenameFloor} />
                </div>
                <PrimaryButton onClick={() => saveRename(s.id)} disabled={busy || !renameName.trim()}>
                  Save
                </PrimaryButton>
                <SmallButton onClick={() => setRenamingId(null)}>Cancel</SmallButton>
              </>
            ) : (
              <>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                    {[s.floor_type, s.capacity ? `capacity ${s.capacity}` : null].filter(Boolean).join(" · ") || "No details set"}
                  </div>
                </div>
                <Chip active={s.is_active} />
                <SmallButton onClick={() => startRename(s)}>Rename</SmallButton>
                <SmallButton onClick={() => toggleActive(s)}>{s.is_active ? "Deactivate" : "Reactivate"}</SmallButton>
              </>
            )}
          </div>
        ))
      )}

      <div style={{ padding: "14px 0 18px", borderTop: "1px solid var(--hairline)", marginTop: 2, fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.5 }}>
        Deactivating hides a space from scheduling without touching history — past classes and events still reference it correctly.
      </div>
    </div>
  );
}

interface StyleUsage {
  teamNames: string[];
  compTeamNames: string[];
}

// Ports the "Dance styles" card — deactivate-only, never hard-deleted, same
// rule as Spaces (dance_style.is_active added this session — see
// docs/DEFICIENCIES.md; the column didn't exist before Task 26). Usage
// captions are real: team/comp_team rows (active only) that reference this
// style by dance_style_id.
function DanceStylesCard({ studioId }: { studioId: string }) {
  const [styles, setStyles] = useState<StyleRow[] | null>(null);
  const [usage, setUsage] = useState<Map<string, StyleUsage>>(new Map());
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");

  const load = async () => {
    const { data: styleRows } = await supabase.from("dance_style").select("*").eq("studio_id", studioId).order("name");
    setStyles(styleRows ?? []);

    const [{ data: teamRows }, { data: compTeamRows }] = await Promise.all([
      supabase.from("team").select("name, dance_style_id").eq("studio_id", studioId).eq("is_active", true),
      supabase.from("comp_team").select("name, dance_style_id").eq("studio_id", studioId).eq("is_active", true),
    ]);
    const next = new Map<string, StyleUsage>();
    for (const s of styleRows ?? []) next.set(s.id, { teamNames: [], compTeamNames: [] });
    for (const t of teamRows ?? []) {
      if (t.dance_style_id && next.has(t.dance_style_id)) next.get(t.dance_style_id)!.teamNames.push(t.name);
    }
    for (const c of compTeamRows ?? []) {
      if (c.dance_style_id && next.has(c.dance_style_id)) next.get(c.dance_style_id)!.compTeamNames.push(c.name);
    }
    setUsage(next);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studioId]);

  const addStyle = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.from("dance_style").insert({ studio_id: studioId, name: newName.trim() });
    setBusy(false);
    if (error) {
      setError("Something went wrong adding this — try again.");
      return;
    }
    setNewName("");
    setAdding(false);
    await load();
  };

  const startRename = (s: StyleRow) => {
    setRenamingId(s.id);
    setRenameName(s.name);
    setError(null);
  };

  const saveRename = async (id: string) => {
    if (!renameName.trim()) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.from("dance_style").update({ name: renameName.trim() }).eq("id", id);
    setBusy(false);
    if (error) {
      setError("Something went wrong saving this — try again.");
      return;
    }
    setRenamingId(null);
    await load();
  };

  const toggleActive = async (s: StyleRow) => {
    setBusy(true);
    await supabase.from("dance_style").update({ is_active: !s.is_active }).eq("id", s.id);
    setBusy(false);
    await load();
  };

  if (!styles) return null;

  return (
    <div className="card" style={{ border: "1px solid var(--hairline)", borderRadius: 16, padding: "24px 26px 4px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", paddingBottom: 14 }}>
        <Eyebrow>Dance styles · {styles.length}</Eyebrow>
        {!adding && <SmallButton onClick={() => setAdding(true)}>+ Add style</SmallButton>}
      </div>

      {adding && (
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", padding: "0 0 16px", flexWrap: "wrap" }}>
          <LabeledInput label="Name" value={newName} onChange={setNewName} placeholder="Hip Hop" />
          <PrimaryButton onClick={addStyle} disabled={busy || !newName.trim()}>
            Add
          </PrimaryButton>
          <SmallButton onClick={() => { setAdding(false); setNewName(""); }}>Cancel</SmallButton>
        </div>
      )}

      {error && <p style={{ fontSize: 12.5, color: "var(--busy)", padding: "0 0 12px" }}>{error}</p>}

      {styles.length === 0 ? (
        <p style={{ padding: "0 0 18px", fontSize: 13, color: "var(--ink-2)" }}>No dance styles yet.</p>
      ) : (
        styles.map((s, i) => {
          const u = usage.get(s.id);
          const names = [...(u?.teamNames ?? []), ...(u?.compTeamNames ?? [])];
          return (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 13, padding: "14px 0", borderTop: i === 0 ? "none" : "1px solid var(--hairline)", opacity: s.is_active ? 1 : 0.5 }}>
              {renamingId === s.id ? (
                <>
                  <div style={{ flex: 1 }}>
                    <LabeledInput label="Name" value={renameName} onChange={setRenameName} />
                  </div>
                  <PrimaryButton onClick={() => saveRename(s.id)} disabled={busy || !renameName.trim()}>
                    Save
                  </PrimaryButton>
                  <SmallButton onClick={() => setRenamingId(null)}>Cancel</SmallButton>
                </>
              ) : (
                <>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                      {names.length > 0 ? names.join(" · ") : "Not assigned to a team or dance yet"}
                    </div>
                  </div>
                  <Chip active={s.is_active} />
                  <SmallButton onClick={() => startRename(s)}>Rename</SmallButton>
                  <SmallButton onClick={() => toggleActive(s)}>{s.is_active ? "Deactivate" : "Reactivate"}</SmallButton>
                </>
              )}
            </div>
          );
        })
      )}

      <div style={{ padding: "14px 0 18px", borderTop: "1px solid var(--hairline)", marginTop: 2, fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.5 }}>
        Same deactivate-only rule as Spaces — a style referenced by a team or dance has to stay findable in history.
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

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>{label}</div>
      <div style={{ background: "var(--sand)", borderRadius: 10, padding: "9px 12px", fontSize: 13, color: "var(--ink)" }}>{value}</div>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>{label}</div>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{ background: "var(--sand)", border: "none", borderRadius: 10, padding: "9px 12px", fontSize: 13, color: "var(--ink)", fontFamily: "inherit", width: "100%", minWidth: 160 }}
      />
    </div>
  );
}

function LabeledSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ background: "var(--sand)", border: "none", borderRadius: 10, padding: "9px 12px", fontSize: 13, color: "var(--ink)", fontFamily: "inherit", width: "100%" }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Chip({ active }: { active: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: "nowrap",
        background: active ? "var(--sand)" : "var(--surface)",
        color: active ? "var(--ink-2)" : "var(--ink-3)",
        border: active ? "none" : "1px dashed var(--hairline)",
      }}
    >
      {active ? "Active" : "Deactivated"}
    </span>
  );
}

function SmallButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ padding: "6px 12px", borderRadius: 8, background: "var(--sand)", color: "var(--ink)", fontSize: 11.5, fontWeight: 600, border: "none", cursor: "pointer", whiteSpace: "nowrap" }}
    >
      {children}
    </button>
  );
}

function PrimaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "9px 16px",
        borderRadius: 9,
        background: "var(--signal)",
        color: "var(--signal-ink)",
        fontSize: 12.5,
        fontWeight: 700,
        border: "none",
        whiteSpace: "nowrap",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "10px 4px",
        marginBottom: -1,
        fontSize: 13,
        fontWeight: 700,
        color: active ? "var(--ink)" : "var(--ink-3)",
        background: "none",
        border: "none",
        borderBottom: active ? "2px solid var(--signal-deep)" : "2px solid transparent",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function JoinCodePanel({
  studioId,
  scope,
  eyebrow,
  note,
}: {
  studioId: string;
  scope: JoinCodeScope;
  eyebrow: string;
  note: string | null;
}) {
  const [row, setRow] = useState<JoinCodeRow | null | undefined>(undefined); // undefined = loading
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("studio_join_code")
      .select("*")
      .eq("studio_id", studioId)
      .eq("scope", scope)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setRow(data);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studioId, scope]);

  const isExpired = row?.expires_at ? new Date(row.expires_at) < new Date() : false;
  const isLive = !!row && !isExpired;

  const onRotate = async () => {
    setBusy(true);
    setError(null);
    const { error } = await callApp<string>("rotate_join_code", {
      p_studio_id: studioId,
      p_scope: scope,
    });
    if (error) setError(error.message);
    else await load();
    setBusy(false);
  };

  const onRevoke = async () => {
    if (!window.confirm("Revoke this code? Anyone who hasn't already joined won't be able to use it.")) {
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await callApp<undefined>("revoke_join_code", {
      p_studio_id: studioId,
      p_scope: scope,
    });
    if (error) setError(error.message);
    else await load();
    setBusy(false);
  };

  const onCopy = async () => {
    if (!row) return;
    await navigator.clipboard.writeText(row.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const joinUrl = row
    ? `${window.location.origin}/join?code=${encodeURIComponent(row.code)}&scope=${scope}`
    : "";

  return (
    <div className="card" style={{ border: "1px solid var(--hairline)", borderRadius: 16, padding: "24px 26px" }}>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 10.5,
          letterSpacing: "0.11em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
          fontWeight: 600,
        }}
      >
        {eyebrow}
      </div>

      {row === undefined ? (
        <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 16 }}>Loading…</p>
      ) : isLive ? (
        <div style={{ display: "flex", gap: 20, marginTop: 16 }}>
          <div style={{ border: "1px solid var(--hairline)", borderRadius: 12, padding: 8, flexShrink: 0 }}>
            <QRCodeSVG value={joinUrl} size={128} />
          </div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 22,
                  letterSpacing: "0.09em",
                  color: "var(--ink)",
                }}
              >
                {row.code}
              </div>
              <button
                type="button"
                onClick={onCopy}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "var(--sand)",
                  color: "var(--ink-2)",
                  fontSize: 12,
                  fontWeight: 700,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 10 }}>
              <b style={{ color: "var(--ink)" }}>{row.use_count}</b>{" "}
              {row.use_count === 1 ? "join" : "joins"} since{" "}
              {new Date(row.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 4 }}>
              {row.expires_at
                ? `Expires ${new Date(row.expires_at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}`
                : "Never expires"}
            </div>
          </div>
        </div>
      ) : (
        <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 16 }}>
          {isExpired ? "The last code for this scope expired." : "No code yet."}
        </p>
      )}

      {error && (
        <p style={{ fontSize: 12.5, color: "var(--busy)", marginTop: 12 }}>{error}</p>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button
          type="button"
          onClick={onRotate}
          disabled={busy}
          style={{
            padding: "9px 16px",
            borderRadius: 9,
            background: "var(--sand)",
            color: "var(--ink)",
            fontSize: 12.5,
            fontWeight: 600,
            border: "none",
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          Rotate code
        </button>
        {isLive && (
          <button
            type="button"
            onClick={onRevoke}
            disabled={busy}
            style={{
              padding: "9px 16px",
              borderRadius: 9,
              background: "var(--surface)",
              border: "1px solid var(--busy-tint)",
              color: "var(--busy)",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.6 : 1,
            }}
          >
            Revoke
          </button>
        )}
      </div>

      {note && (
        <div
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTop: "1px dashed var(--hairline)",
            fontSize: 11.5,
            color: "var(--ink-3)",
            lineHeight: 1.5,
          }}
        >
          {note}
        </div>
      )}
    </div>
  );
}
