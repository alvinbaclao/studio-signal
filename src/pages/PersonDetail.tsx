import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth, hasRole, type Role } from "../lib/AuthProvider";
import { Avatar } from "../components/Avatar";
import { Chip } from "../components/Chip";
import { ageFromDob, formatShortDate } from "../lib/format";
import type { Database } from "../lib/database.types";

type PersonRow = Database["public"]["Tables"]["person"]["Row"];

interface TeamRow {
  id: string;
  name: string;
  kind: "team" | "comp_team";
  meta: string;
}

interface PersonDetailData {
  person: PersonRow;
  roles: Role[];
  styleNames: string;
  guardian: { id: string; full_name: string } | null;
  dancers: { id: string; full_name: string; status: PersonRow["status"] }[];
  teamsAndCompTeams: TeamRow[];
  invitedByName: string | null;
}

const ROLE_LABEL: Record<Role, string> = {
  director: "Director",
  instructor: "Instructor",
  dancer: "Dancer",
  parent: "Parent",
};

// Ports design-reference/PersonDetail.dc.html. The same layout serves every
// role, with cards that only render when they have something to show — a
// minor gets DOB/consent + a guardian card; an adult gets neither; anyone
// with dancers gets a dancers card instead. See BUILD_PLAN.md Task 5.
export function PersonDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { person: currentPerson } = useAuth();
  const [data, setData] = useState<PersonDetailData | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!id) return;

    const { data: personRow } = await supabase.from("person").select("*").eq("id", id).single();
    if (!personRow) {
      setData(null);
      return;
    }

    const [
      { data: roleRows },
      { data: styleRows },
      { data: guardianLinkRow },
      { data: dancerLinkRows },
      { data: teamMemberRows },
      { data: castRows },
      { data: inviteRow },
    ] = await Promise.all([
      supabase.from("person_role_assignment").select("role").eq("person_id", id),
      supabase.from("person_dance_style").select("dance_style:dance_style_id(name)").eq("person_id", id),
      supabase.from("guardian_link").select("guardian_id").eq("dancer_id", id).maybeSingle(),
      supabase.from("guardian_link").select("dancer_id").eq("guardian_id", id),
      supabase.from("team_member").select("team_id, role").eq("person_id", id),
      supabase.from("comp_team_cast").select("comp_team_id, role").eq("person_id", id),
      supabase.from("person_invite").select("invited_by").eq("person_id", id).maybeSingle(),
    ]);

    const roles = (roleRows ?? []).map((r) => r.role as Role);
    const styleNames = (styleRows ?? [])
      .map((r) => (r as unknown as { dance_style: { name: string } | null }).dance_style?.name)
      .filter((n): n is string => !!n)
      .join(", ");

    let guardian: { id: string; full_name: string } | null = null;
    if (guardianLinkRow?.guardian_id) {
      const { data: g } = await supabase
        .from("person")
        .select("id, full_name")
        .eq("id", guardianLinkRow.guardian_id)
        .single();
      guardian = g ?? null;
    }

    let dancers: { id: string; full_name: string; status: PersonRow["status"] }[] = [];
    const dancerIds = (dancerLinkRows ?? []).map((r) => r.dancer_id);
    if (dancerIds.length > 0) {
      const { data: rows } = await supabase.from("person").select("id, full_name, status").in("id", dancerIds);
      dancers = rows ?? [];
    }

    const teamsAndCompTeams: TeamRow[] = [];
    const teamIds = (teamMemberRows ?? []).map((r) => r.team_id);
    if (teamIds.length > 0) {
      const { data: teams } = await supabase.from("team").select("id, name, level").in("id", teamIds);
      for (const t of teams ?? []) {
        teamsAndCompTeams.push({ id: t.id, name: t.name, kind: "team", meta: `Team${t.level ? " · " + t.level : ""}` });
      }
    }
    const compTeamIds = (castRows ?? []).map((r) => r.comp_team_id);
    if (compTeamIds.length > 0) {
      const { data: compTeams } = await supabase
        .from("comp_team")
        .select("id, name, comp_team_type")
        .in("id", compTeamIds);
      for (const c of compTeams ?? []) {
        teamsAndCompTeams.push({ id: c.id, name: c.name, kind: "comp_team", meta: `Comp Team · ${c.comp_team_type}` });
      }
    }

    let invitedByName: string | null = null;
    if (inviteRow?.invited_by) {
      const { data: inviter } = await supabase
        .from("person")
        .select("full_name")
        .eq("id", inviteRow.invited_by)
        .maybeSingle();
      invitedByName = inviter?.full_name ?? "the Director";
    }

    setData({ person: personRow, roles, styleNames, guardian, dancers, teamsAndCompTeams, invitedByName });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!data) return null;
  const { person, roles } = data;

  const isMinorDancer = roles.includes("dancer") && !!data.guardian;
  const age = ageFromDob(person.date_of_birth);

  const toggleActive = async () => {
    const verb = person.is_active ? "Deactivate" : "Reactivate";
    if (!window.confirm(`${verb} ${person.full_name}?`)) return;
    setBusy(true);
    await supabase.from("person").update({ is_active: !person.is_active }).eq("id", person.id);
    await load();
    setBusy(false);
  };

  const joinedViaText = data.invitedByName
    ? `Invited by ${data.invitedByName}`
    : roles.includes("director")
    ? "Studio setup"
    : roles.includes("instructor") && !roles.includes("parent")
    ? "Instructor join code"
    : "Parent & dancer join code";

  return (
    <div style={{ padding: "18px 34px 30px" }}>
      <button
        type="button"
        onClick={() => navigate(-1)}
        style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--ink-2)", fontSize: 12.5, fontWeight: 600 }}
      >
        ‹ Back
      </button>

      <div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Avatar name={person.full_name} size={56} />
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h2 style={{ fontSize: 22, letterSpacing: "-0.01em" }}>{person.full_name}</h2>
              {roles.map((r) => (
                <Chip key={r} label={ROLE_LABEL[r]} />
              ))}
              {!person.is_active && <Chip label="Deactivated" />}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 4 }}>
              {person.status === "confirmed" ? "Confirmed" : person.status === "pending" ? "Pending" : "Declined"}
              {person.status === "confirmed" ? ` ${formatShortDate(person.updated_at)}` : ""}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 9 }}>
          <Link to="/messages" style={ghostBtnStyle}>
            Message
          </Link>
          {hasRole(currentPerson, "director") && currentPerson?.id !== person.id && (
            <button type="button" onClick={toggleActive} disabled={busy} style={dangerBtnStyle}>
              {person.is_active ? "Deactivate" : "Reactivate"}
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="card" style={cardStyle}>
            <Eyebrow>Profile</Eyebrow>
            <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {person.date_of_birth !== null || isMinorDancer || roles.includes("dancer") ? (
                <>
                  <KV label="Date of birth">
                    {person.date_of_birth
                      ? `${formatShortDate(person.date_of_birth)}${age !== null ? ` · ${age} yrs` : ""}`
                      : "Not provided"}
                  </KV>
                  <KV label="Height">{person.height_cm ? `${person.height_cm} cm` : "Not provided"}</KV>
                  {data.styleNames && (
                    <div style={{ gridColumn: "1 / -1" }}>
                      <KV label="Dance styles">{data.styleNames}</KV>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {roles.includes("instructor") && (
                    <>
                      <KV label="Title">{person.title ?? "Not set"}</KV>
                      <div style={{ gridColumn: "1 / -1" }}>
                        <KV label="Bio">{person.bio || "Not set"}</KV>
                      </div>
                    </>
                  )}
                  <KV label="Phone">{person.phone ?? "Not provided"}</KV>
                </>
              )}
            </div>

            {isMinorDancer && (
              <div
                style={{
                  marginTop: 16,
                  paddingTop: 14,
                  borderTop: "1px solid var(--hairline)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Media consent</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2, maxWidth: 320, lineHeight: 1.4 }}>
                    Set by {data.guardian?.full_name} (guardian) ·{" "}
                    {person.media_consent
                      ? "ok to appear in Studio & Team photos/video posted in the app"
                      : "not ok to appear in posted photos/video"}
                  </div>
                </div>
                <div
                  style={{
                    width: 38,
                    height: 22,
                    borderRadius: 999,
                    background: person.media_consent ? "var(--signal)" : "var(--hairline)",
                    position: "relative",
                    flexShrink: 0,
                  }}
                  title="Set by the guardian — not editable from here"
                >
                  <div
                    style={{
                      position: "absolute",
                      top: 2,
                      left: person.media_consent ? 18 : 2,
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: "#fff",
                      boxShadow: "0 1px 3px rgba(0,0,0,.25)",
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="card" style={cardStyle}>
            <Eyebrow>Contact &amp; account</Eyebrow>
            <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <KV label="Login">
                {person.auth_user_id ? "Has their own login" : "No login — added by a guardian"}
              </KV>
              <KV label="Joined via">{joinedViaText}</KV>
            </div>
            {!person.auth_user_id && (
              <p style={{ marginTop: 12, fontSize: 11, color: "var(--ink-3)", lineHeight: 1.5 }}>
                A dancer without a login carries no credentials of their own — their guardian's
                login is what reaches this record.
              </p>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {data.guardian && (
            <div className="card" style={cardStyle}>
              <Eyebrow>Guardian</Eyebrow>
              <RowLink to={`/person/${data.guardian.id}`} title={data.guardian.full_name} subtitle="Guardian" />
            </div>
          )}

          {data.dancers.length > 0 && (
            <div className="card" style={cardStyle}>
              <Eyebrow>Dancers · {data.dancers.length}</Eyebrow>
              {data.dancers.map((d) => (
                <RowLink
                  key={d.id}
                  to={`/person/${d.id}`}
                  title={d.full_name}
                  subtitle={d.status === "pending" ? "Pending" : d.status === "confirmed" ? "Confirmed" : "Declined"}
                />
              ))}
            </div>
          )}

          <div className="card" style={cardStyle}>
            <Eyebrow>Teams &amp; Comp Teams · {data.teamsAndCompTeams.length}</Eyebrow>
            {data.teamsAndCompTeams.length === 0 ? (
              <p style={{ marginTop: 12, fontSize: 12.5, color: "var(--ink-2)" }}>Not on any Team or Comp Team yet.</p>
            ) : (
              data.teamsAndCompTeams.map((t) => (
                <RowLink key={`${t.kind}-${t.id}`} to="/teams" title={t.name} subtitle={t.meta} />
              ))
            )}
          </div>

          <div className="card" style={{ ...cardStyle, padding: "18px 22px" }}>
            <Eyebrow>Deactivate, not delete</Eyebrow>
            <p style={{ marginTop: 10, fontSize: 12, color: "var(--ink-2)", lineHeight: 1.6 }}>
              Removes {person.full_name.split(" ")[0]} from active rosters and messaging without
              erasing their history — past attendance, cast credits, and posts they appeared in
              stay intact for the studio's records. Reversible from this same screen.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: "var(--ink-3)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 5,
        }}
      >
        {label}
      </div>
      <div style={{ background: "var(--sand)", borderRadius: 10, padding: "9px 12px", fontSize: 13, color: children ? "var(--ink)" : "var(--ink-3)" }}>
        {children}
      </div>
    </div>
  );
}

function RowLink({ to, title, subtitle }: { to: string; title: string; subtitle: string }) {
  return (
    <Link
      to={to}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 13,
        padding: "14px 0",
        borderTop: "1px solid var(--hairline)",
        color: "inherit",
        textDecoration: "none",
      }}
    >
      <Avatar name={title} size={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>{title}</div>
        <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 1 }}>{subtitle}</div>
      </div>
      <span style={{ color: "var(--ink-3)" }}>›</span>
    </Link>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
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
      {children}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid var(--hairline)",
  borderRadius: 16,
  padding: "18px 22px 20px",
};

const ghostBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "9px 16px",
  borderRadius: 9,
  background: "var(--sand)",
  color: "var(--ink)",
  fontSize: 12.5,
  fontWeight: 600,
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const dangerBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "9px 16px",
  borderRadius: 9,
  background: "var(--surface)",
  border: "1px solid var(--busy-tint)",
  color: "var(--busy)",
  fontSize: 12.5,
  fontWeight: 600,
  whiteSpace: "nowrap",
  cursor: "pointer",
};
