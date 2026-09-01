import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase, callApp } from "../lib/supabase";
import { useAuth } from "../lib/AuthProvider";
import { PrimaryButton } from "../components/PrimaryButton";
import { SecondaryButton } from "../components/SecondaryButton";
import { formatShortDate } from "../lib/format";
import type { Database } from "../lib/database.types";

type InviteRole = "instructor" | "parent" | "dancer";

interface DuplicateResult {
  person_id: string;
  full_name: string;
  status: Database["public"]["Enums"]["person_status"];
}

interface TeamOption {
  id: string;
  name: string;
}

interface PendingInvite {
  id: string;
  person_id: string;
  full_name: string;
  email: string;
  created_at: string;
  expires_at: string;
}

const ROLE_OPTIONS: { value: InviteRole; label: string }[] = [
  { value: "instructor", label: "Instructor" },
  { value: "parent", label: "Parent" },
  { value: "dancer", label: "Adult dancer" },
];

// Ports design-reference/InviteSomeone.dc.html — the Director-first invite
// path for one known contact, alongside join codes for everyone else. The
// artboard has no name field, but person.full_name is NOT NULL and
// app.create_invite requires an existing person_id, so the frontend has to
// create that row itself before inviting — added a required Full name
// field to make that possible. See BUILD_PLAN.md Task 6.
export function InviteSomeone() {
  const { person } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<InviteRole>("instructor");
  const [teamId, setTeamId] = useState("");
  const [teams, setTeams] = useState<TeamOption[]>([]);

  const [duplicate, setDuplicate] = useState<DuplicateResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addRoleDone, setAddRoleDone] = useState(false);
  const [tokenResult, setTokenResult] = useState<{ token: string; email: string } | null>(null);

  const [pendingInvites, setPendingInvites] = useState<PendingInvite[] | null>(null);

  const loadPendingInvites = async () => {
    if (!person) return;
    const { data: rows } = await supabase
      .from("person_invite_status")
      .select("id, person_id, email, created_at, expires_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    const ids = (rows ?? []).map((r) => r.person_id).filter((id): id is string => !!id);
    let namesById = new Map<string, string>();
    if (ids.length > 0) {
      const { data: people } = await supabase.from("person").select("id, full_name").in("id", ids);
      namesById = new Map((people ?? []).map((p) => [p.id, p.full_name]));
    }
    setPendingInvites(
      (rows ?? [])
        .filter((r): r is typeof r & { id: string; person_id: string; email: string; created_at: string; expires_at: string } =>
          !!r.id && !!r.person_id && !!r.email && !!r.created_at && !!r.expires_at
        )
        .map((r) => ({ ...r, full_name: namesById.get(r.person_id) ?? "Unknown" }))
    );
  };

  useEffect(() => {
    if (!person) return;
    supabase
      .from("team")
      .select("id, name")
      .eq("studio_id", person.studio_id)
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setTeams(data ?? []));
    loadPendingInvites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person]);

  const resetDuplicateState = () => {
    setDuplicate(null);
    setAddRoleDone(false);
    setError(null);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!person) return;
    setSubmitting(true);
    setError(null);

    const { data: found, error: findError } = await callApp<DuplicateResult[]>("find_person_by_email", {
      p_studio_id: person.studio_id,
      p_email: email,
    });
    if (findError) {
      setError(findError.message);
      setSubmitting(false);
      return;
    }

    const match = (found ?? [])[0];
    if (match && match.status !== "declined") {
      setDuplicate(match);
      setSubmitting(false);
      return;
    }

    const { data: newPerson, error: insertError } = await supabase
      .from("person")
      .insert({ studio_id: person.studio_id, full_name: fullName, status: "confirmed" })
      .select("id")
      .single();
    if (insertError || !newPerson) {
      setError(insertError?.message ?? "Couldn't create the person record.");
      setSubmitting(false);
      return;
    }

    const { error: roleError } = await supabase
      .from("person_role_assignment")
      .insert({ person_id: newPerson.id, studio_id: person.studio_id, role });
    if (roleError) {
      setError(roleError.message);
      setSubmitting(false);
      return;
    }

    if (role === "instructor" && teamId) {
      await supabase
        .from("team_member")
        .insert({ person_id: newPerson.id, team_id: teamId, studio_id: person.studio_id, role: "instructor" });
    }

    const { data: token, error: inviteError } = await callApp<string>("create_invite", {
      p_person_id: newPerson.id,
      p_email: email,
    });
    if (inviteError) {
      setError(inviteError.message);
      setSubmitting(false);
      return;
    }

    setTokenResult({ token: token!, email });
    setSubmitting(false);
    await loadPendingInvites();
  };

  const onAddRoleInstead = async () => {
    if (!duplicate || !person) return;
    setSubmitting(true);
    setError(null);
    const { error: roleError } = await supabase
      .from("person_role_assignment")
      .insert({ person_id: duplicate.person_id, studio_id: person.studio_id, role });
    setSubmitting(false);
    if (roleError) {
      setError(
        roleError.code === "23505" ? "They already have that role." : roleError.message
      );
      return;
    }
    setAddRoleDone(true);
  };

  const onRevoke = async (invite: PendingInvite) => {
    if (!window.confirm(`Revoke the invite to ${invite.full_name}?`)) return;
    await supabase.from("person_invite").update({ revoked_at: new Date().toISOString() }).eq("id", invite.id);
    await loadPendingInvites();
  };

  const onCopyLink = async () => {
    if (!tokenResult) return;
    const link = `${window.location.origin}/invite?invite=${tokenResult.token}`;
    await navigator.clipboard.writeText(link);
  };

  if (tokenResult) {
    const link = `${window.location.origin}/invite?invite=${tokenResult.token}`;
    return (
      <div style={{ padding: "18px 34px 30px", maxWidth: 540 }}>
        <h2 style={{ fontSize: 20 }}>Invite ready</h2>
        <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 8, lineHeight: 1.6 }}>
          Send this link to {tokenResult.email} yourself — it's shown once here and can't be
          retrieved again. They'll have real access the moment they set a password.
        </p>
        <div
          style={{
            marginTop: 16,
            padding: "12px 14px",
            borderRadius: 10,
            background: "var(--sand)",
            fontSize: 13,
            wordBreak: "break-all",
          }}
        >
          {link}
        </div>
        <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
          <SecondaryButton onClick={onCopyLink}>Copy link</SecondaryButton>
          <PrimaryButton onClick={() => navigate(-1)}>Done</PrimaryButton>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "18px 34px 30px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, maxWidth: 980 }}>
      <div>
        <h2 style={{ fontSize: 20 }}>Invite someone</h2>
        <p style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 8, lineHeight: 1.6 }}>
          For one specific person whose email you already have. Unlike a join code, this doesn't
          land in a pending queue — they get real access the moment they set a password.
        </p>

        <form onSubmit={onSubmit} style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <Field label="Full name">
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              disabled={!!duplicate}
            />
          </Field>

          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (duplicate) resetDuplicateState();
              }}
              required
              disabled={!!duplicate}
            />
          </Field>

          <div>
            <FieldLabel>They're joining as</FieldLabel>
            <div style={{ display: "flex", gap: 8 }}>
              {ROLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={!!duplicate}
                  onClick={() => setRole(opt.value)}
                  style={{
                    flex: 1,
                    padding: "12px 8px",
                    borderRadius: 12,
                    border: "none",
                    background: role === opt.value ? "var(--band)" : "var(--sand)",
                    color: role === opt.value ? "var(--signal)" : "var(--ink-2)",
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: duplicate ? "default" : "pointer",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 8, lineHeight: 1.5 }}>
              A minor never gets their own login, invited or not — a Parent adds their dancer(s)
              after signing in.
            </p>
          </div>

          {role === "instructor" && (
            <div>
              <FieldLabel>Pre-assign to a Team (optional)</FieldLabel>
              {teams.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--ink-3)" }}>
                  Your studio has no Teams yet — skip this and assign later from Roster.
                </p>
              ) : (
                <select value={teamId} onChange={(e) => setTeamId(e.target.value)} disabled={!!duplicate}>
                  <option value="">Don't assign yet</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {duplicate && duplicate.status === "confirmed" && (
            <div style={{ background: "var(--sand)", borderRadius: 12, padding: "14px 16px" }}>
              <p style={{ fontSize: 13, fontWeight: 600 }}>
                {duplicate.full_name} is already confirmed at your studio.
              </p>
              <p style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 4, lineHeight: 1.5 }}>
                No new invite needed — add the {ROLE_OPTIONS.find((r) => r.value === role)?.label}{" "}
                role to their existing record instead.
              </p>
              {addRoleDone ? (
                <p style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 10, fontWeight: 600 }}>
                  Role added.
                </p>
              ) : (
                <div style={{ marginTop: 10 }}>
                  <SecondaryButton type="button" onClick={onAddRoleInstead} disabled={submitting}>
                    Add role instead
                  </SecondaryButton>
                </div>
              )}
            </div>
          )}

          {duplicate && duplicate.status === "pending" && (
            <div style={{ background: "var(--sand)", borderRadius: 12, padding: "14px 16px" }}>
              <p style={{ fontSize: 13, fontWeight: 600 }}>
                {duplicate.full_name} is already pending self-serve confirmation.
              </p>
              <p style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 4, lineHeight: 1.5 }}>
                Review them in the confirm queue instead of creating a competing invite.
              </p>
              <Link
                to="/confirm-queue"
                style={{ display: "inline-block", marginTop: 10, fontSize: 12.5, fontWeight: 600, color: "var(--signal-deep)" }}
              >
                Open confirm queue ›
              </Link>
            </div>
          )}

          {error && <p style={{ color: "var(--busy)", fontSize: 13 }}>{error}</p>}

          {!duplicate && (
            <div style={{ display: "flex", gap: 10 }}>
              <SecondaryButton type="button" onClick={() => navigate(-1)}>
                Cancel
              </SecondaryButton>
              <PrimaryButton type="submit" disabled={submitting}>
                {submitting ? "Sending…" : "Send invite"}
              </PrimaryButton>
            </div>
          )}
          {duplicate && (
            <div>
              <SecondaryButton type="button" onClick={resetDuplicateState}>
                Try a different email
              </SecondaryButton>
            </div>
          )}
        </form>
      </div>

      <div>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--ink-2)" }}>Pending invites</h3>
        {pendingInvites === null ? (
          <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 12 }}>Loading…</p>
        ) : pendingInvites.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 12 }}>No invites waiting on a reply.</p>
        ) : (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {pendingInvites.map((inv) => (
              <div
                key={inv.id}
                className="card"
                style={{
                  border: "1px solid var(--hairline)",
                  borderRadius: 14,
                  padding: "12px 14px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{inv.full_name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                    {inv.email} · sent {formatShortDate(inv.created_at)} · expires{" "}
                    {formatShortDate(inv.expires_at)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRevoke(inv)}
                  style={{
                    border: "1px solid var(--hairline)",
                    background: "var(--surface)",
                    color: "var(--ink-2)",
                    borderRadius: 8,
                    padding: "6px 12px",
                    fontSize: 11.5,
                    fontWeight: 600,
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-2)", marginBottom: 7, display: "block" }}>
      {children}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      {children}
    </div>
  );
}
