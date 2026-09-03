import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthProvider";
import { Avatar } from "../components/Avatar";
import { Chip } from "../components/Chip";
import { PrimaryButton } from "../components/PrimaryButton";
import { SecondaryButton } from "../components/SecondaryButton";
import { formatShortDate } from "../lib/format";
import { useTeamsIndexData } from "../lib/useTeamsIndexData";

// Ports design-reference/DirectorTeamsIndex.dc.html — three separate
// entities, three separate create actions. Only Teams gets a real create
// flow here; Comp Teams and Dance Competitions get their own wizards in
// Tasks 10 and 22, so those buttons link to a placeholder for now. See
// BUILD_PLAN.md Task 8. Data now comes from useTeamsIndexData, shared with
// DirectorTeamsMobile (Task 25) so both show the exact same real data.
export function TeamsIndex() {
  const { person } = useAuth();
  const { data, currentSeasonId, reload } = useTeamsIndexData();
  const [showNewTeamForm, setShowNewTeamForm] = useState(false);

  if (!person || !data) return null;

  return (
    <div style={{ padding: "18px 34px 30px" }}>
      <h2 style={{ fontSize: 24, letterSpacing: "-0.01em" }}>Teams &amp; Competitions</h2>

      <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Section
            eyebrow={`Teams · ongoing class placement, the level a dancer is in · ${data.teams.length}`}
            createLabel="+ New Team"
            onCreate={() => setShowNewTeamForm((v) => !v)}
            primary={false}
          >
            {showNewTeamForm && (
              <NewTeamForm
                studioId={person.studio_id}
                seasonId={currentSeasonId}
                onCancel={() => setShowNewTeamForm(false)}
                onCreated={async () => {
                  setShowNewTeamForm(false);
                  await reload();
                }}
              />
            )}
            {data.teams.length === 0 ? (
              <EmptyRow text="No Teams yet — create your first one above." />
            ) : (
              data.teams.map((t) => (
                <Row key={t.id} avatarLabel={t.name}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                    {[
                      t.level,
                      `Instructor: ${t.instructorNames.length > 0 ? t.instructorNames.join(", ") : "not yet assigned"}`,
                      `${t.dancerCount} ${t.dancerCount === 1 ? "dancer" : "dancers"}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  <GhostLink to={`/team/${t.id}/roster`}>Manage roster ›</GhostLink>
                </Row>
              ))
            )}
          </Section>

          <Section
            eyebrow={`Comp Teams · Solo/Duo/Trio/Group, who competes together · ${data.compTeams.length}`}
            createLabel="+ New Comp Team"
            onCreate={undefined}
            createTo="/comp-teams/new"
            primary={false}
          >
            {data.compTeams.length === 0 ? (
              <EmptyRow text="No Comp Teams yet." />
            ) : (
              data.compTeams.map((c) => (
                <Row key={c.id} avatarLabel={c.name}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{c.name}</span>
                    <Chip label={c.comp_team_type} />
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                    {[
                      c.level,
                      `Choreographed by ${c.choreographerNames.length > 0 ? c.choreographerNames.join(", ") : "not yet assigned"}`,
                      c.sourceTeamNames.length > 0 ? `roster from ${c.sourceTeamNames.join(" + ")}` : "",
                      `${c.dancerCount} ${c.dancerCount === 1 ? "dancer" : "dancers"}`,
                      c.competitionNames.length > 0
                        ? `entered in ${c.competitionNames.join(", ")}`
                        : "not currently entered in a competition",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  <GhostLink to={`/comp-team/${c.id}/roster`}>Manage roster ›</GhostLink>
                </Row>
              ))
            )}
          </Section>

          <div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              <Eyebrow>
                Dance Competitions · the events the studio's Comp Teams travel to · {data.competitions.length}
              </Eyebrow>
              <Link to="/competitions/new" style={primaryPillStyle}>
                + New Competition
              </Link>
            </div>
            <div className="card" style={{ marginTop: 11, border: "1px solid var(--hairline)", borderRadius: 16, padding: "2px 20px" }}>
              {data.competitions.length === 0 ? (
                <EmptyRow text="No Dance Competitions yet." />
              ) : (
                data.competitions.map((c) => (
                  <Row key={c.id} avatarLabel={c.name}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                      {[
                        c.venue_name,
                        formatShortDate(c.starts_on),
                        c.enteredCompTeamNames.length > 0
                          ? `${c.enteredCompTeamNames.length} Comp ${c.enteredCompTeamNames.length === 1 ? "Team" : "Teams"} entered so far (${c.enteredCompTeamNames.join(", ")})`
                          : "no Comp Teams entered yet",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                    <Link to={`/competition/${c.id}`} style={{ fontSize: 11.5, fontWeight: 700, color: "var(--signal-deep)", flexShrink: 0 }}>
                      View summary
                    </Link>
                    <GhostLink to={`/competition/${c.id}/manage`}>Manage entries &amp; call times ›</GhostLink>
                  </Row>
                ))
              )}
            </div>
            {data.compTeams.some((c) => c.competitionNames.length === 0) && (
              <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 9, lineHeight: 1.5 }}>
                A Comp Team is created once and can enter more than one competition over a season
                — one exists but isn't entered anywhere yet, which is normal right after it's
                created.
              </p>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card" style={{ border: "1px solid var(--hairline)", borderRadius: 16, padding: "18px 20px" }}>
            <Eyebrow>Three different things</Eyebrow>
            <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.6 }}>
              <b style={{ color: "var(--ink)" }}>A Team</b> is the level a dancer is placed in for
              class — ongoing, one or more instructors, holds all season.
              <br />
              <br />
              <b style={{ color: "var(--ink)" }}>A Comp Team</b> (Solo/Duo/Trio/Group) is who
              competes together on one piece. Its own roster, often cast across Teams and levels.
              Exists on its own, independent of any competition.
              <br />
              <br />
              <b style={{ color: "var(--ink)" }}>A Competition</b> is the actual event — a venue
              and a date. Comp Teams get entered into it, sometimes more than one.
            </div>
          </div>

          <div className="card" style={{ border: "1px solid var(--hairline)", borderRadius: 16, padding: "18px 20px" }}>
            <Eyebrow>Sequence</Eyebrow>
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 9 }}>
              <SequenceStep label="Create Teams, assign roster to them" done={data.teams.length > 0} />
              <SequenceStep label="Create Comp Teams, build their rosters" done={data.compTeams.length > 0} />
              <SequenceStep
                label="Create a Competition, enter Comp Teams"
                done={data.competitions.length > 0}
              />
              <SequenceStep
                label="Update call times as the date nears"
                done={data.compTeams.some((c) => c.competitionNames.length > 0)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NewTeamForm({
  studioId,
  seasonId,
  onCancel,
  onCreated,
}: {
  studioId: string;
  seasonId: string | null;
  onCancel: () => void;
  onCreated: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [level, setLevel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!seasonId) {
      setError("No current season is set up for this studio.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: insertError } = await supabase
      .from("team")
      .insert({ studio_id: studioId, season_id: seasonId, name, level: level || null });
    setSubmitting(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    await onCreated();
  };

  return (
    <form
      onSubmit={onSubmit}
      style={{
        margin: "11px 0",
        padding: "16px 20px",
        background: "var(--sand)",
        borderRadius: 14,
        display: "flex",
        gap: 12,
        alignItems: "flex-end",
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: "1 1 200px" }}>
        <FieldLabel>Team name</FieldLabel>
        <input value={name} onChange={(e) => setName(e.target.value)} required style={{ width: "100%" }} />
      </div>
      <div style={{ flex: "0 1 160px" }}>
        <FieldLabel>Level (optional)</FieldLabel>
        <input value={level} onChange={(e) => setLevel(e.target.value)} placeholder="Level 2" style={{ width: "100%" }} />
      </div>
      {error && <p style={{ color: "var(--busy)", fontSize: 12.5, flexBasis: "100%" }}>{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <SecondaryButton type="button" onClick={onCancel}>
          Cancel
        </SecondaryButton>
        <PrimaryButton type="submit" disabled={submitting}>
          {submitting ? "Creating…" : "Create"}
        </PrimaryButton>
      </div>
    </form>
  );
}

function Section({
  eyebrow,
  createLabel,
  onCreate,
  createTo,
  children,
}: {
  eyebrow: string;
  createLabel: string;
  onCreate?: () => void;
  createTo?: string;
  primary: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <Eyebrow>{eyebrow}</Eyebrow>
        {createTo ? (
          <Link to={createTo} style={ghostPillStyle}>
            {createLabel}
          </Link>
        ) : (
          <button type="button" onClick={onCreate} style={{ ...ghostPillStyle, border: "none", cursor: "pointer" }}>
            {createLabel}
          </button>
        )}
      </div>
      <div className="card" style={{ marginTop: 11, border: "1px solid var(--hairline)", borderRadius: 16, padding: "2px 20px" }}>
        {children}
      </div>
    </div>
  );
}

function Row({ avatarLabel, children }: { avatarLabel: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "15px 0", borderTop: "1px solid var(--hairline)" }}>
      <Avatar name={avatarLabel} />
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p style={{ padding: "15px 0", fontSize: 13, color: "var(--ink-2)" }}>{text}</p>;
}

function GhostLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} style={ghostPillStyle}>
      {children}
    </Link>
  );
}

function SequenceStep({ label, done }: { label: string; done: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, color: "var(--ink-2)" }}>
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          fontWeight: 700,
          background: done ? "var(--ink)" : "transparent",
          color: done ? "var(--paper)" : "var(--ink-3)",
          border: done ? "none" : "1.5px solid var(--hairline)",
        }}
      >
        {done ? "✓" : ""}
      </span>
      {label}
    </div>
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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-2)", marginBottom: 7, display: "block" }}>
      {children}
    </span>
  );
}

const ghostPillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "6px 12px",
  borderRadius: 9,
  background: "var(--sand)",
  color: "var(--ink)",
  fontSize: 11.5,
  fontWeight: 600,
  textDecoration: "none",
  whiteSpace: "nowrap",
  flexShrink: 0,
};

const primaryPillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "6px 12px",
  borderRadius: 9,
  background: "var(--signal)",
  color: "var(--signal-ink)",
  fontSize: 11.5,
  fontWeight: 700,
  textDecoration: "none",
  whiteSpace: "nowrap",
};
