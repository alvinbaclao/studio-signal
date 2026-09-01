import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, callApp } from "../lib/supabase";
import { useAuth, hasRole, type Role } from "../lib/AuthProvider";
import { Avatar } from "../components/Avatar";
import { Chip } from "../components/Chip";
import { ageFromDob, formatShortDate } from "../lib/format";
import { Placeholder } from "./Placeholder";

interface PendingPerson {
  id: string;
  full_name: string;
  created_at: string;
  date_of_birth: string | null;
  roles: Role[];
}

interface QueueCard {
  key: string;
  header: PendingPerson;
  headerIsPending: boolean;
  dancers: PendingPerson[];
}

interface QueueData {
  familyCards: QueueCard[];
  instructorOnly: PendingPerson[];
  styleNamesByPerson: Map<string, string>;
  joinCodeSummary: { scope: string; use_count: number }[];
}

// Ports design-reference/DirectorConfirmQueue.dc.html. Confirming and
// declining are per-person, not per-family — see BUILD_PLAN.md Task 5. A
// pending instructor never gets a Confirm button: assignment to a Team or
// Comp Team is what flips their status, enforced by a database trigger,
// not this screen.
export function ConfirmQueue() {
  const { person } = useAuth();
  const [data, setData] = useState<QueueData | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    if (!person) return;
    const studioId = person.studio_id;

    const { data: pendingRows } = await supabase
      .from("person")
      .select("id, full_name, created_at, date_of_birth")
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    const pendingIds = (pendingRows ?? []).map((r) => r.id);
    if (pendingIds.length === 0) {
      setData({ familyCards: [], instructorOnly: [], styleNamesByPerson: new Map(), joinCodeSummary: [] });
      return;
    }

    const [{ data: roleRows }, { data: linkRows }, { data: styleRows }, { data: codeRows }] =
      await Promise.all([
        supabase.from("person_role_assignment").select("person_id, role").in("person_id", pendingIds),
        supabase.from("guardian_link").select("dancer_id, guardian_id").in("dancer_id", pendingIds),
        supabase
          .from("person_dance_style")
          .select("person_id, dance_style:dance_style_id(name)")
          .in("person_id", pendingIds),
        supabase.from("studio_join_code").select("scope, use_count").eq("studio_id", studioId),
      ]);

    const rolesByPerson = new Map<string, Role[]>();
    for (const r of roleRows ?? []) {
      const arr = rolesByPerson.get(r.person_id) ?? [];
      arr.push(r.role as Role);
      rolesByPerson.set(r.person_id, arr);
    }

    const styleNamesByPerson = new Map<string, string>();
    for (const r of styleRows ?? []) {
      const name = (r as unknown as { dance_style: { name: string } | null }).dance_style?.name;
      if (!name) continue;
      const existing = styleNamesByPerson.get(r.person_id);
      styleNamesByPerson.set(r.person_id, existing ? `${existing}, ${name}` : name);
    }

    const people: PendingPerson[] = (pendingRows ?? []).map((r) => ({
      ...r,
      roles: rolesByPerson.get(r.id) ?? [],
    }));
    const byId = new Map(people.map((p) => [p.id, p]));

    const guardianIdByDancer = new Map<string, string>();
    for (const l of linkRows ?? []) guardianIdByDancer.set(l.dancer_id, l.guardian_id);

    // Guardians referenced by a pending dancer but not themselves pending
    // (already confirmed) — fetch just enough to label the card.
    const missingGuardianIds = [...new Set(guardianIdByDancer.values())].filter((id) => !byId.has(id));
    let externalGuardians = new Map<string, { id: string; full_name: string }>();
    if (missingGuardianIds.length > 0) {
      const { data: rows } = await supabase
        .from("person")
        .select("id, full_name")
        .in("id", missingGuardianIds);
      externalGuardians = new Map((rows ?? []).map((r) => [r.id, r]));
    }

    const attachedDancerIds = new Set<string>();
    const familyCards: QueueCard[] = [];

    // Parents (pending) — always their own card, even with zero dancers.
    for (const p of people) {
      if (!p.roles.includes("parent")) continue;
      const dancers = people.filter((d) => guardianIdByDancer.get(d.id) === p.id);
      dancers.forEach((d) => attachedDancerIds.add(d.id));
      familyCards.push({ key: p.id, header: p, headerIsPending: true, dancers });
    }

    // Pending dancers whose guardian isn't in the pending list at all
    // (already confirmed, or missing) — group under an informational,
    // non-actionable header instead of dropping them.
    const externalGroups = new Map<string, PendingPerson[]>();
    for (const p of people) {
      if (!p.roles.includes("dancer") || attachedDancerIds.has(p.id)) continue;
      const guardianId = guardianIdByDancer.get(p.id);
      if (!guardianId) continue; // handled below as standalone
      attachedDancerIds.add(p.id);
      const arr = externalGroups.get(guardianId) ?? [];
      arr.push(p);
      externalGroups.set(guardianId, arr);
    }
    for (const [guardianId, dancers] of externalGroups) {
      const guardian = externalGuardians.get(guardianId);
      if (!guardian) continue;
      familyCards.push({
        key: guardianId,
        header: { id: guardian.id, full_name: guardian.full_name, created_at: "", date_of_birth: null, roles: [] },
        headerIsPending: false,
        dancers,
      });
    }

    // Standalone adult dancers — no guardian_link at all (registered
    // themselves, e.g. "I'm an adult dancer").
    for (const p of people) {
      if (!p.roles.includes("dancer") || p.roles.includes("parent") || attachedDancerIds.has(p.id)) continue;
      familyCards.push({ key: p.id, header: p, headerIsPending: true, dancers: [] });
    }

    const instructorOnly = people.filter(
      (p) => p.roles.includes("instructor") && !p.roles.includes("parent")
    );

    const joinCodeSummary = (codeRows ?? []).map((r) => ({ scope: r.scope, use_count: r.use_count }));

    setData({ familyCards, instructorOnly, styleNamesByPerson, joinCodeSummary });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person]);

  if (!hasRole(person, "director")) {
    return <Placeholder title="Confirm queue" />;
  }

  const confirm = async (id: string) => {
    setBusyId(id);
    await supabase.from("person").update({ status: "confirmed" }).eq("id", id);
    await load();
    setBusyId(null);
  };

  const decline = async (id: string, name: string) => {
    if (!window.confirm(`Decline ${name}?`)) return;
    setBusyId(id);
    await callApp("decline_pending_person", { p_person_id: id });
    await load();
    setBusyId(null);
  };

  if (!data) return null;

  const totalCount = data.familyCards.reduce((n, c) => n + 1 + c.dancers.length, 0) + data.instructorOnly.length;

  return (
    <div style={{ padding: "18px 34px 30px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <h2 style={{ fontSize: 24, letterSpacing: "-0.01em" }}>
          Pending registrations · {totalCount} {totalCount === 1 ? "person" : "people"}
        </h2>
        <Link to="/settings" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--signal-deep)" }}>
          Manage join codes ›
        </Link>
      </div>

      {totalCount === 0 ? (
        <p style={{ marginTop: 20, color: "var(--ink-2)" }}>Nothing waiting on you right now.</p>
      ) : (
        <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {data.familyCards.length > 0 && (
              <>
                <Eyebrow>Families · via parent &amp; dancer code</Eyebrow>
                {data.familyCards.map((card) => (
                  <FamilyCard
                    key={card.key}
                    card={card}
                    styleNamesByPerson={data.styleNamesByPerson}
                    busyId={busyId}
                    onConfirm={confirm}
                    onDecline={decline}
                  />
                ))}
              </>
            )}

            {data.instructorOnly.length > 0 && (
              <>
                <Eyebrow>Instructors · via instructor code — unlock by assigning, not confirming</Eyebrow>
                {data.instructorOnly.map((p) => (
                  <div key={p.id} className="card" style={cardStyle}>
                    <PersonRow
                      person={p}
                      caption={`Registered ${formatShortDate(p.created_at)} · no capability until assigned`}
                      actions={
                        <>
                          <Link to="/teams" style={btnpStyle}>
                            Assign to a Team…
                          </Link>
                          <button
                            type="button"
                            onClick={() => decline(p.id, p.full_name)}
                            disabled={busyId === p.id}
                            style={btndeclineStyle}
                          >
                            Decline
                          </button>
                        </>
                      }
                    />
                  </div>
                ))}
              </>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="card" style={cardStyle}>
              <Eyebrow>How this works</Eyebrow>
              <p style={{ marginTop: 12, fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.6 }}>
                Confirming a person is per-person — you can confirm one dancer while declining
                another, without holding up their parent's own confirmation. Declining sends no
                notice by default. Someone with an instructor role never gets a Confirm button
                here — assigning them to a Team or Comp Team is what unlocks their access.
              </p>
            </div>
            {data.joinCodeSummary.length > 0 && (
              <div className="card" style={cardStyle}>
                <Eyebrow>Join codes</Eyebrow>
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                  {data.joinCodeSummary.map((c) => (
                    <div
                      key={c.scope}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600 }}>
                        {c.scope === "parent_dancer" ? "Parent & dancer" : "Instructor"}
                      </span>
                      <Chip label={`${c.use_count} ${c.use_count === 1 ? "join" : "joins"}`} />
                    </div>
                  ))}
                </div>
                <Link
                  to="/settings"
                  style={{ display: "block", marginTop: 13, fontSize: 12.5, fontWeight: 600, color: "var(--signal-deep)" }}
                >
                  Manage codes ›
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FamilyCard({
  card,
  styleNamesByPerson,
  busyId,
  onConfirm,
  onDecline,
}: {
  card: QueueCard;
  styleNamesByPerson: Map<string, string>;
  busyId: string | null;
  onConfirm: (id: string) => void;
  onDecline: (id: string, name: string) => void;
}) {
  const { header, headerIsPending, dancers } = card;
  const isDualInstructor = header.roles.includes("parent") && header.roles.includes("instructor");
  const isSoloAdultDancer = header.roles.includes("dancer") && dancers.length === 0 && headerIsPending;

  const headerCaption = !headerIsPending
    ? "Already confirmed"
    : isDualInstructor
    ? `Registered ${formatShortDate(header.created_at)} · parent + instructor`
    : isSoloAdultDancer
    ? `Registered ${formatShortDate(header.created_at)} · adult dancer`
    : `Registered ${formatShortDate(header.created_at)} · parent`;

  return (
    <div className="card" style={{ ...cardStyle, borderColor: isDualInstructor ? "var(--signal-deep)" : "var(--hairline)" }}>
      <PersonRow
        person={header}
        caption={headerCaption}
        actions={
          headerIsPending ? (
            <>
              <button
                type="button"
                onClick={() => onConfirm(header.id)}
                disabled={busyId === header.id}
                style={btnpStyle}
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => onDecline(header.id, header.full_name)}
                disabled={busyId === header.id}
                style={btndeclineStyle}
              >
                Decline
              </button>
            </>
          ) : null
        }
      />

      {dancers.length > 0 && (
        <div
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTop: "1px solid var(--hairline)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {dancers.map((d) => (
            <PersonRow
              key={d.id}
              person={d}
              small
              caption={dancerCaption(d, styleNamesByPerson.get(d.id))}
              actions={
                <>
                  <button
                    type="button"
                    onClick={() => onConfirm(d.id)}
                    disabled={busyId === d.id}
                    style={{ ...btnpStyle, padding: "6px 13px" }}
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => onDecline(d.id, d.full_name)}
                    disabled={busyId === d.id}
                    style={{ ...btndeclineStyle, padding: "6px 13px" }}
                  >
                    Decline
                  </button>
                </>
              }
            />
          ))}
        </div>
      )}

      {isDualInstructor && (
        <div
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTop: "1px solid var(--hairline)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>Instructor side — still locked</div>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
              Confirming {header.full_name.split(" ")[0]} above doesn't unlock this — assign her to
              a Team separately, whenever you're ready.
            </div>
          </div>
          <Link to="/teams" style={btnghostStyle}>
            Assign to a Team…
          </Link>
        </div>
      )}
    </div>
  );
}

function PersonRow({
  person,
  caption,
  actions,
  small,
}: {
  person: PendingPerson;
  caption: string;
  actions: React.ReactNode;
  small?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <Link to={`/person/${person.id}`}>
        <Avatar name={person.full_name} size={small ? 30 : 36} />
      </Link>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Link
          to={`/person/${person.id}`}
          style={{ fontSize: small ? 13.5 : 14.5, fontWeight: small ? 600 : 700, color: "var(--ink)" }}
        >
          {person.full_name}
        </Link>
        <div style={{ fontSize: small ? 11.5 : 12, color: "var(--ink-3)", marginTop: 1 }}>{caption}</div>
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>{actions}</div>
    </div>
  );
}

function dancerCaption(d: PendingPerson, styleNames: string | undefined): string {
  const age = ageFromDob(d.date_of_birth);
  const parts = [age !== null ? `Age ${age}` : "Date of birth still needed", styleNames].filter(Boolean);
  return parts.join(" · ");
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
  padding: "18px 20px",
};

const btnpStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "8px 15px",
  borderRadius: 9,
  background: "var(--signal)",
  color: "var(--signal-ink)",
  fontSize: 12.5,
  fontWeight: 700,
  border: "none",
  textDecoration: "none",
  cursor: "pointer",
};

const btndeclineStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "8px 15px",
  borderRadius: 9,
  background: "var(--surface)",
  border: "1px solid var(--hairline)",
  color: "var(--ink-2)",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
};

const btnghostStyle: React.CSSProperties = {
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
