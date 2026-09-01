import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { supabase, callApp } from "../lib/supabase";
import { useAuth, type Role } from "../lib/AuthProvider";
import { Avatar } from "../components/Avatar";
import { Chip } from "../components/Chip";
import { PrimaryButton } from "../components/PrimaryButton";
import { SecondaryButton } from "../components/SecondaryButton";
import type { Database } from "../lib/database.types";

type InstructorTitle = Database["public"]["Enums"]["instructor_title"];
type PersonStatus = Database["public"]["Enums"]["person_status"];
type PersonUpdate = Database["public"]["Tables"]["person"]["Update"];

interface DanceStyleOption {
  id: string;
  name: string;
}

interface FullPerson {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  title: InstructorTitle | null;
  bio: string | null;
}

interface DancerRow {
  id: string;
  full_name: string;
  date_of_birth: string | null;
  styleIds: string[];
}

const shellStyle: React.CSSProperties = {
  minHeight: "100dvh",
  display: "flex",
  justifyContent: "center",
  padding: "24px 16px 40px",
};

const innerStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 420,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "var(--ink-2)",
  marginBottom: 7,
  display: "block",
};

// The one-time "tell us about you" step every fresh redeem_invite /
// redeem_join_code lands on before Waiting or their home screen — see
// AuthProvider's needsProfileCompletion and BUILD_PLAN.md Task 4. Branches
// by role, not by which door the person came through.
export function CompleteProfile() {
  const { person, session, setNeedsProfileCompletion, refreshPerson } = useAuth();
  const [fullPerson, setFullPerson] = useState<FullPerson | null>(null);
  const [styles, setStyles] = useState<DanceStyleOption[]>([]);

  useEffect(() => {
    if (!person) return;
    let cancelled = false;
    Promise.all([
      supabase
        .from("person")
        .select("id, full_name, phone, email, title, bio")
        .eq("id", person.id)
        .single(),
      supabase
        .from("dance_style")
        .select("id, name")
        .eq("studio_id", person.studio_id)
        .order("name"),
    ]).then(([personRes, stylesRes]) => {
      if (cancelled) return;
      if (personRes.data) setFullPerson(personRes.data);
      setStyles(stylesRes.data ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [person]);

  if (!person || !fullPerson) return null;

  const finish = async () => {
    setNeedsProfileCompletion(false);
    await refreshPerson();
  };

  const isParent = person.roles.includes("parent");

  return isParent ? (
    <ParentBranch
      person={fullPerson}
      email={fullPerson.email ?? session?.user.email ?? ""}
      status={person.status}
      styles={styles}
      onFinish={finish}
    />
  ) : (
    <AdultBranch person={fullPerson} roles={person.roles} styles={styles} onFinish={finish} />
  );
}

function AdultBranch({
  person,
  roles,
  styles,
  onFinish,
}: {
  person: FullPerson;
  roles: Role[];
  styles: DanceStyleOption[];
  onFinish: () => Promise<void>;
}) {
  const isInstructor = roles.includes("instructor");
  const isDancer = roles.includes("dancer");

  const [fullName, setFullName] = useState(person.full_name);
  const [phone, setPhone] = useState(person.phone ?? "");
  const [title, setTitle] = useState<InstructorTitle | "">(person.title ?? "");
  const [bio, setBio] = useState(person.bio ?? "");
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const updates: PersonUpdate = { full_name: fullName, phone: phone || null };
    if (isInstructor) {
      updates.title = title || null;
      updates.bio = bio || null;
    }

    const { error: updateError } = await supabase.from("person").update(updates).eq("id", person.id);
    if (updateError) {
      setError(updateError.message);
      setSubmitting(false);
      return;
    }

    if (isDancer && selectedStyles.length > 0) {
      const { error: styleError } = await supabase
        .from("person_dance_style")
        .insert(selectedStyles.map((id) => ({ person_id: person.id, dance_style_id: id })));
      if (styleError) {
        setError(styleError.message);
        setSubmitting(false);
        return;
      }
    }

    await onFinish();
  };

  return (
    <div style={shellStyle}>
      <form onSubmit={onSubmit} style={innerStyle}>
        <p className="font-display" style={{ fontSize: 22 }}>
          Tell us about you
        </p>
        <p style={{ color: "var(--ink-2)", fontSize: 13.5, marginTop: 8, lineHeight: 1.6 }}>
          This is what others at the studio see once you're confirmed.
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 24 }}>
          <Avatar name={fullName || person.full_name} size={52} />
          <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
            Photo uploads arrive with the Media library.
          </span>
        </div>

        <Field label="Full name">
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </Field>
        <Field label="Phone">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 000-0000" />
        </Field>

        {isInstructor && (
          <>
            <Field label="Title">
              <select value={title} onChange={(e) => setTitle(e.target.value as InstructorTitle)}>
                <option value="">Select a title</option>
                <option value="lead">Lead</option>
                <option value="assistant">Assistant</option>
                <option value="choreographer">Choreographer</option>
                <option value="guest">Guest</option>
              </select>
            </Field>
            <Field label="Short bio (optional)">
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} style={{ width: "100%" }} />
            </Field>
          </>
        )}

        {isDancer && (
          <div style={{ marginTop: 16 }}>
            <span style={labelStyle}>Dance styles</span>
            {styles.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                Your studio hasn't added any dance styles yet — you can add these later.
              </p>
            ) : (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {styles.map((s) => (
                  <Chip
                    key={s.id}
                    label={s.name}
                    selected={selectedStyles.includes(s.id)}
                    onClick={() =>
                      setSelectedStyles((prev) =>
                        prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id]
                      )
                    }
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <p style={{ color: "var(--busy)", marginTop: 12, fontSize: 13 }}>{error}</p>
        )}

        <div style={{ marginTop: 26 }}>
          <PrimaryButton type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Continue"}
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}

function ParentBranch({
  person,
  email,
  status,
  styles,
  onFinish,
}: {
  person: FullPerson;
  email: string;
  status: PersonStatus;
  styles: DanceStyleOption[];
  onFinish: () => Promise<void>;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [fullName, setFullName] = useState(person.full_name);
  const [phone, setPhone] = useState(person.phone ?? "");
  const [savingStep1, setSavingStep1] = useState(false);
  const [step1Error, setStep1Error] = useState<string | null>(null);

  const [dancers, setDancers] = useState<DancerRow[] | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  const loadDancers = async () => {
    const { data: links } = await supabase
      .from("guardian_link")
      .select("dancer_id")
      .eq("guardian_id", person.id);
    const dancerIds = (links ?? []).map((l) => l.dancer_id);
    if (dancerIds.length === 0) {
      setDancers([]);
      return;
    }
    const [{ data: rows }, { data: styleRows }] = await Promise.all([
      supabase.from("person").select("id, full_name, date_of_birth").in("id", dancerIds),
      supabase.from("person_dance_style").select("person_id, dance_style_id").in("person_id", dancerIds),
    ]);
    const stylesByPerson = new Map<string, string[]>();
    for (const r of styleRows ?? []) {
      const arr = stylesByPerson.get(r.person_id) ?? [];
      arr.push(r.dance_style_id);
      stylesByPerson.set(r.person_id, arr);
    }
    setDancers((rows ?? []).map((r) => ({ ...r, styleIds: stylesByPerson.get(r.id) ?? [] })));
  };

  useEffect(() => {
    if (step === 2 && dancers === null) loadDancers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const onStep1Submit = async (e: FormEvent) => {
    e.preventDefault();
    setSavingStep1(true);
    setStep1Error(null);
    const { error } = await supabase
      .from("person")
      .update({ full_name: fullName, phone: phone || null })
      .eq("id", person.id);
    setSavingStep1(false);
    if (error) {
      setStep1Error(error.message);
      return;
    }
    setStep(2);
  };

  if (step === 1) {
    return (
      <div style={shellStyle}>
        <form onSubmit={onStep1Submit} style={innerStyle}>
          <StepIndicator step={1} of={2} label="About you" />
          <p className="font-display" style={{ fontSize: 22, marginTop: 12 }}>
            About you
          </p>
          <p style={{ color: "var(--ink-2)", fontSize: 13.5, marginTop: 8, lineHeight: 1.6 }}>
            Tell us about you, then add each dancer — you'll manage their profile from your own
            account.
          </p>

          <Field label="Your name">
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </Field>
          <Field label="Phone">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 000-0000" />
          </Field>
          <Field label="Email">
            <input value={email} disabled />
          </Field>

          {step1Error && (
            <p style={{ color: "var(--busy)", marginTop: 12, fontSize: 13 }}>{step1Error}</p>
          )}

          <div style={{ marginTop: 26 }}>
            <PrimaryButton type="submit" disabled={savingStep1}>
              {savingStep1 ? "Saving…" : "Continue"}
            </PrimaryButton>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div style={shellStyle}>
      <div style={innerStyle}>
        <StepIndicator step={2} of={2} label="Your dancers" />
        <p className="font-display" style={{ fontSize: 22, marginTop: 12 }}>
          Your dancers
        </p>
        <p style={{ color: "var(--ink-2)", fontSize: 13.5, marginTop: 8, lineHeight: 1.6 }}>
          Add another, or move on when you're ready.
        </p>

        {dancers === null ? (
          <p style={{ marginTop: 20, color: "var(--ink-2)" }}>Loading…</p>
        ) : (
          <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
            {dancers.map((d) =>
              editingId === d.id ? (
                <DancerForm
                  key={d.id}
                  styles={styles}
                  initial={d}
                  submitLabel="Save"
                  onCancel={() => setEditingId(null)}
                  onSubmit={async (values) => {
                    const { error } = await supabase
                      .from("person")
                      .update({ full_name: values.full_name, date_of_birth: values.date_of_birth })
                      .eq("id", d.id);
                    if (error) throw new Error(error.message);

                    const toAdd = values.dance_style_ids.filter((id) => !d.styleIds.includes(id));
                    const toRemove = d.styleIds.filter((id) => !values.dance_style_ids.includes(id));
                    if (toAdd.length > 0) {
                      const { error: addError } = await supabase
                        .from("person_dance_style")
                        .insert(toAdd.map((id) => ({ person_id: d.id, dance_style_id: id })));
                      if (addError) throw new Error(addError.message);
                    }
                    if (toRemove.length > 0) {
                      const { error: removeError } = await supabase
                        .from("person_dance_style")
                        .delete()
                        .eq("person_id", d.id)
                        .in("dance_style_id", toRemove);
                      if (removeError) throw new Error(removeError.message);
                    }
                    setEditingId(null);
                    await loadDancers();
                  }}
                />
              ) : (
                <DancerRowCard key={d.id} dancer={d} styles={styles} onEdit={() => setEditingId(d.id)} />
              )
            )}

            {showAddForm ? (
              <DancerForm
                styles={styles}
                submitLabel="Add this dancer"
                onCancel={() => setShowAddForm(false)}
                onSubmit={async (values) => {
                  const { error } = await callApp<string>("register_dancer", {
                    p_parent_person_id: person.id,
                    p_dancer: values,
                  });
                  if (error) throw new Error(error.message);
                  setShowAddForm(false);
                  await loadDancers();
                }}
              />
            ) : (
              <SecondaryButton onClick={() => setShowAddForm(true)}>+ Add another dancer</SecondaryButton>
            )}
          </div>
        )}

        <div
          style={{
            marginTop: 20,
            background: "var(--sand)",
            borderRadius: 14,
            padding: "13px 16px",
            fontSize: 12.5,
            color: "var(--ink-2)",
            lineHeight: 1.55,
          }}
        >
          {status === "pending"
            ? "Nobody here appears on the studio roster until a Director reviews this registration — usually within a day or two."
            : "Dancers under 18 don't get their own login — you see and manage everything on their behalf."}
        </div>

        <div style={{ marginTop: 26, display: "flex", gap: 10 }}>
          <SecondaryButton onClick={() => setStep(1)}>Back</SecondaryButton>
          <div style={{ flex: 1 }}>
            <PrimaryButton
              disabled={finishing}
              onClick={async () => {
                setFinishing(true);
                await onFinish();
              }}
            >
              {finishing ? "Saving…" : status === "pending" ? "Submit for review" : "Continue"}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function DancerRowCard({
  dancer,
  styles,
  onEdit,
}: {
  dancer: DancerRow;
  styles: DanceStyleOption[];
  onEdit: () => void;
}) {
  const ready = !!dancer.date_of_birth;
  const styleNames = dancer.styleIds
    .map((id) => styles.find((s) => s.id === id)?.name)
    .filter((n): n is string => !!n)
    .join(", ");

  return (
    <button
      type="button"
      onClick={onEdit}
      className="card"
      style={{
        textAlign: "left",
        border: "1px solid var(--hairline)",
        borderRadius: 18,
        padding: "16px 18px",
        background: "var(--surface)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        font: "inherit",
        color: "inherit",
        cursor: "pointer",
      }}
    >
      <Avatar name={dancer.full_name} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600 }}>{dancer.full_name}</div>
        <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 2 }}>
          {ready
            ? `Date of birth set${styleNames ? " · " + styleNames : ""}`
            : "Date of birth still needed"}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: ready ? "var(--ink-3)" : "var(--signal-deep)",
          }}
        />
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            color: ready ? "var(--ink-2)" : "var(--signal-deep)",
          }}
        >
          {ready ? "Ready" : "Incomplete"}
        </span>
      </div>
    </button>
  );
}

function DancerForm({
  styles,
  initial,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  styles: DanceStyleOption[];
  initial?: { full_name: string; date_of_birth: string | null; styleIds: string[] };
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (values: {
    full_name: string;
    date_of_birth: string | null;
    dance_style_ids: string[];
  }) => Promise<void>;
}) {
  const [fullName, setFullName] = useState(initial?.full_name ?? "");
  const [dob, setDob] = useState(initial?.date_of_birth ?? "");
  const [selected, setSelected] = useState<string[]>(initial?.styleIds ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ full_name: fullName, date_of_birth: dob || null, dance_style_ids: selected });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="card"
      style={{
        border: "1px solid var(--hairline)",
        borderRadius: 18,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <Field label="Dancer's name">
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
      </Field>
      <Field label="Date of birth">
        <input type="date" value={dob ?? ""} onChange={(e) => setDob(e.target.value)} />
      </Field>
      {styles.length > 0 && (
        <div>
          <span style={labelStyle}>Dance styles</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {styles.map((s) => (
              <Chip
                key={s.id}
                label={s.name}
                selected={selected.includes(s.id)}
                onClick={() =>
                  setSelected((prev) =>
                    prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id]
                  )
                }
              />
            ))}
          </div>
        </div>
      )}
      {error && <p style={{ color: "var(--busy)", fontSize: 12.5 }}>{error}</p>}
      <div style={{ display: "flex", gap: 10 }}>
        <SecondaryButton type="button" onClick={onCancel}>
          Cancel
        </SecondaryButton>
        <div style={{ flex: 1 }}>
          <PrimaryButton type="submit" disabled={submitting}>
            {submitting ? "Saving…" : submitLabel}
          </PrimaryButton>
        </div>
      </div>
    </form>
  );
}

function StepIndicator({ step, of, label }: { step: number; of: number; label: string }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {Array.from({ length: of }).map((_, i) => (
          <span
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              background: i < step ? "var(--ink)" : "var(--hairline)",
            }}
          />
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 9 }}>
        Step {step} of {of} · {label}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: 16 }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </div>
  );
}
