import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthProvider";
import { ageFromDob, formatShortDate } from "../lib/format";
import { Avatar } from "../components/Avatar";

interface DestRow {
  id: string;
  name: string;
  kind: "team" | "comp_team";
  meta: string;
}

interface DancerData {
  id: string;
  full_name: string;
  date_of_birth: string | null;
  height_cm: number | null;
  media_consent: boolean;
  styleNames: string;
  destinations: DestRow[];
  canEdit: boolean;
}

// Ports design-reference/DancerProfile.dc.html — the parent-facing
// counterpart to PersonDetail.dc.html (Task 5): same profile facts, no
// Deactivate control, and media consent is directly editable here since
// the viewer is the dancer's guardian. Team placement, dance styles and
// removal all stay Director-owned — see the footer note and
// docs/PROJECT_KNOWLEDGE.md. See BUILD_PLAN.md Task 16.
export function DancerProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { person: currentPerson } = useAuth();
  const [data, setData] = useState<DancerData | null>(null);
  const [editingDob, setEditingDob] = useState(false);
  const [editingHeight, setEditingHeight] = useState(false);
  const [dobDraft, setDobDraft] = useState("");
  const [heightDraft, setHeightDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!id || !currentPerson) return;

    const [{ data: personRow }, { data: guardianLinkRow }, { data: styleRows }, { data: teamRows }, { data: castRows }] = await Promise.all([
      supabase.from("person").select("id, full_name, date_of_birth, height_cm, media_consent").eq("id", id).single(),
      supabase.from("guardian_link").select("can_edit").eq("guardian_id", currentPerson.id).eq("dancer_id", id).maybeSingle(),
      supabase.from("person_dance_style").select("dance_style:dance_style_id(name)").eq("person_id", id),
      supabase.from("team_member").select("team_id, team:team_id(id, name, level)").eq("person_id", id).eq("role", "dancer"),
      supabase.from("comp_team_cast").select("comp_team_id, comp_team:comp_team_id(id, name, comp_team_type)").eq("person_id", id).eq("role", "dancer"),
    ]);
    if (!personRow) {
      setData(null);
      return;
    }

    const styleNames = (styleRows ?? [])
      .map((r) => (r as unknown as { dance_style: { name: string } | null }).dance_style?.name)
      .filter((n): n is string => !!n)
      .join(", ");

    const destinations: DestRow[] = [
      ...(teamRows ?? [])
        .map((r) => r.team as unknown as { id: string; name: string; level: string | null } | null)
        .filter((t): t is { id: string; name: string; level: string | null } => !!t)
        .map((t) => ({ id: t.id, name: t.name, kind: "team" as const, meta: `Team${t.level ? " · " + t.level : ""}` })),
      ...(castRows ?? [])
        .map((r) => r.comp_team as unknown as { id: string; name: string; comp_team_type: string } | null)
        .filter((c): c is { id: string; name: string; comp_team_type: string } => !!c)
        .map((c) => ({ id: c.id, name: c.name, kind: "comp_team" as const, meta: `Comp Team · ${c.comp_team_type}` })),
    ];

    setData({
      id: personRow.id,
      full_name: personRow.full_name,
      date_of_birth: personRow.date_of_birth,
      height_cm: personRow.height_cm,
      media_consent: personRow.media_consent,
      styleNames,
      destinations,
      canEdit: !!guardianLinkRow?.can_edit,
    });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, currentPerson]);

  async function saveDob() {
    if (!data) return;
    setSaving(true);
    await supabase.from("person").update({ date_of_birth: dobDraft || null }).eq("id", data.id);
    setSaving(false);
    setEditingDob(false);
    await load();
  }

  async function saveHeight() {
    if (!data) return;
    setSaving(true);
    const cm = heightDraft.trim() ? Number(heightDraft) : null;
    await supabase.from("person").update({ height_cm: cm }).eq("id", data.id);
    setSaving(false);
    setEditingHeight(false);
    await load();
  }

  async function toggleConsent() {
    if (!data || !data.canEdit) return;
    await supabase.from("person").update({ media_consent: !data.media_consent }).eq("id", data.id);
    await load();
  }

  if (!data) return null;
  const age = ageFromDob(data.date_of_birth);

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ padding: "16px 20px 14px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid var(--hairline)" }}>
        <div role="button" onClick={() => navigate(-1)} style={{ cursor: "pointer", color: "var(--ink-2)" }}>
          <BackIcon />
        </div>
        <div className="font-display" style={{ fontWeight: 700, fontSize: 16 }}>
          {data.full_name}
        </div>
      </div>

      <div style={{ padding: "20px 20px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Avatar name={data.full_name} size={52} />
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div style={{ fontSize: 17, fontWeight: 700 }}>{data.full_name}</div>
              <span style={chipStyle}>Dancer</span>
            </div>
            {data.destinations.length > 0 && (
              <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 3 }}>{data.destinations.map((d) => d.name).join(" · ")}</div>
            )}
          </div>
        </div>

        <Eyebrow style={{ marginTop: 22 }}>Profile</Eyebrow>
        <div className="card" style={{ marginTop: 10, border: "1px solid var(--hairline)", borderRadius: 18, padding: "16px 18px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <KvLabel>Date of birth</KvLabel>
            {editingDob ? (
              <div style={{ display: "flex", gap: 8 }}>
                <input type="date" value={dobDraft} onChange={(e) => setDobDraft(e.target.value)} style={fieldInputStyle} />
                <button type="button" onClick={saveDob} disabled={saving} style={saveBtnStyle}>
                  Save
                </button>
              </div>
            ) : (
              <div
                role="button"
                onClick={() => {
                  setDobDraft(data.date_of_birth ?? "");
                  setEditingDob(true);
                }}
                style={fieldStyle}
              >
                <span style={{ color: data.date_of_birth ? "var(--ink)" : "var(--ink-3)" }}>
                  {data.date_of_birth ? `${formatShortDate(data.date_of_birth)}${age !== null ? ` · ${age} yrs` : ""}` : "Not provided"}
                </span>
                <PencilIcon />
              </div>
            )}
          </div>

          <div>
            <KvLabel>Height</KvLabel>
            {editingHeight ? (
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="number"
                  value={heightDraft}
                  onChange={(e) => setHeightDraft(e.target.value)}
                  placeholder="cm"
                  style={fieldInputStyle}
                />
                <button type="button" onClick={saveHeight} disabled={saving} style={saveBtnStyle}>
                  Save
                </button>
              </div>
            ) : (
              <div
                role="button"
                onClick={() => {
                  setHeightDraft(data.height_cm != null ? String(data.height_cm) : "");
                  setEditingHeight(true);
                }}
                style={fieldStyle}
              >
                <span style={{ color: data.height_cm != null ? "var(--ink)" : "var(--ink-3)" }}>
                  {data.height_cm != null ? `${data.height_cm} cm` : "Not provided"}
                </span>
                <PencilIcon />
              </div>
            )}
          </div>

          <div>
            <KvLabel>Dance styles</KvLabel>
            <div style={{ ...fieldStyle, background: "var(--paper)", border: "1px solid var(--hairline)" }}>
              <span>{data.styleNames || "None set yet"}</span>
            </div>
            <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 6, lineHeight: 1.4 }}>
              Follows Team &amp; Comp Team placement — message your Director to change this.
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <div className="card" style={{ border: "1px solid var(--hairline)", borderRadius: 18, padding: "15px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>Media consent</div>
              <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 3, maxWidth: 260, lineHeight: 1.4 }}>
                {data.canEdit
                  ? `Ok to appear in Studio & Team photos/video posted in the app. You're ${data.full_name.split(" ")[0]}'s guardian, so this is yours to set.`
                  : "Set by this dancer's guardian."}
              </div>
            </div>
            <div
              role={data.canEdit ? "button" : undefined}
              onClick={toggleConsent}
              title={data.canEdit ? undefined : "Only this dancer's guardian can change this"}
              style={{
                width: 40,
                height: 23,
                borderRadius: 999,
                background: data.media_consent ? "var(--signal)" : "var(--hairline)",
                position: "relative",
                flexShrink: 0,
                cursor: data.canEdit ? "pointer" : "default",
                opacity: data.canEdit ? 1 : 0.7,
              }}
            >
              <div style={{ position: "absolute", top: 2.5, left: data.media_consent ? 19.5 : 2.5, width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.25)", transition: "left 120ms ease" }} />
            </div>
          </div>
        </div>

        <Eyebrow style={{ marginTop: 22 }}>Teams &amp; Comp Teams</Eyebrow>
        <div className="card" style={{ marginTop: 10, border: "1px solid var(--hairline)", borderRadius: 18, overflow: "hidden" }}>
          {data.destinations.length === 0 ? (
            <div style={{ padding: "15px 18px", fontSize: 13, color: "var(--ink-2)" }}>Not on any Team or Comp Team yet.</div>
          ) : (
            data.destinations.map((d, i) => (
              <Link
                key={`${d.kind}:${d.id}`}
                to={d.kind === "team" ? `/team/${d.id}` : `/comp-team/${d.id}`}
                style={{ display: "flex", alignItems: "center", gap: 13, padding: "14px 18px", borderTop: i === 0 ? "none" : "1px solid var(--hairline)", color: "inherit" }}
              >
                <Avatar name={d.name} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>{d.name}</div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 1 }}>{d.meta}</div>
                </div>
                <ChevronIcon />
              </Link>
            ))
          )}
        </div>

        <p style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.55, marginTop: 20 }}>
          Team placement, join codes, and removing {data.full_name.split(" ")[0]} from the roster all stay with your
          Director.
        </p>
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

function KvLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>{children}</div>;
}

const chipStyle: React.CSSProperties = { display: "inline-flex", alignItems: "center", padding: "5px 12px", borderRadius: 999, background: "var(--sand)", color: "var(--ink-2)", fontSize: 11.5, fontWeight: 600 };

const fieldStyle: React.CSSProperties = {
  background: "var(--sand)",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13.5,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  cursor: "pointer",
};

const fieldInputStyle: React.CSSProperties = {
  flex: 1,
  background: "var(--sand)",
  border: "none",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13.5,
  color: "var(--ink)",
};

const saveBtnStyle: React.CSSProperties = {
  padding: "0 14px",
  borderRadius: 10,
  background: "var(--signal)",
  color: "var(--signal-ink)",
  fontSize: 12.5,
  fontWeight: 700,
  border: "none",
  cursor: "pointer",
};

function BackIcon() {
  return (
    <svg style={{ width: 18, height: 18 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg style={{ width: 14, height: 14, color: "var(--ink-3)", flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg style={{ width: 16, height: 16, color: "var(--ink-3)", flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}
