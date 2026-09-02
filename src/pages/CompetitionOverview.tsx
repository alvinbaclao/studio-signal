import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthProvider";
import { useStudio } from "../lib/useStudio";
import { formatTimeInZone } from "../lib/format";
import { Avatar } from "../components/Avatar";
import type { Database } from "../lib/database.types";

type CompTeamType = Database["public"]["Enums"]["comp_team_type"];

const TYPE_LABEL: Record<CompTeamType, string> = {
  solo: "Solo",
  duo: "Duo",
  trio: "Trio",
  small_group: "Small Group",
  large_group: "Large Group",
  production: "Production",
};

interface CompetitionInfo {
  id: string;
  name: string;
  venue_name: string | null;
  venue_address: string | null;
  starts_on: string;
  registration_note: string | null;
  created_by_name: string | null;
}

interface EntryRow {
  comp_team_id: string;
  name: string;
  comp_team_type: CompTeamType;
  call_time: string | null;
}

// Ports design-reference/CompetitionOverview.dc.html — a competition's own
// summary page, one scrolling page, no sub-nav. See BUILD_PLAN.md Task 24.
//
// Two of the artboard's sections have no real schema behind them and are
// dropped rather than faked: `post` has no competition_id at all (only
// team_id/comp_team_id — a competition-scoped "Updates" feed can't exist),
// and `media_item` likewise has no competition_id, on top of no Storage
// bucket existing for this studio anyway (Deficiency #2). Since both
// target sections are gone, so are the "Add/Upload controls for Director/
// entered-Comp-Team's-choreographer" BUILD_PLAN mentions — there's
// nothing left to add or upload to. The page is read-only for everyone;
// see docs/DEFICIENCIES.md for the full account.
//
// `competition_read`'s own RLS already hides an unpublished competition
// from everyone but its Director (confirmed live via pg_policies before
// writing this) — no client-side published_at check needed here either.
export function CompetitionOverview() {
  const { id: competitionId } = useParams<{ id: string }>();
  const { person } = useAuth();
  const studio = useStudio();

  const [competition, setCompetition] = useState<CompetitionInfo | null | undefined>(undefined);
  const [entries, setEntries] = useState<EntryRow[] | null>(null);

  useEffect(() => {
    if (!competitionId || !person) return;
    let cancelled = false;

    async function load() {
      const { data: compRow } = await supabase
        .from("competition")
        .select("id, name, venue_name, venue_address, starts_on, registration_note, created_by")
        .eq("id", competitionId!)
        .maybeSingle();
      if (cancelled) return;
      if (!compRow) {
        setCompetition(null);
        return;
      }

      const { data: creatorRow } = compRow.created_by
        ? await supabase.from("person").select("full_name").eq("id", compRow.created_by).maybeSingle()
        : { data: null as { full_name: string } | null };
      if (cancelled) return;
      setCompetition({ ...compRow, created_by_name: creatorRow?.full_name ?? null });

      const { data: entryRows } = await supabase
        .from("competition_entry")
        .select("comp_team_id, call_time, comp_team:comp_team_id(name, comp_team_type)")
        .eq("competition_id", competitionId!)
        .not("accepted_at", "is", null);
      if (cancelled) return;
      setEntries(
        (entryRows ?? [])
          .map((e) => {
            const ct = e.comp_team as unknown as { name: string; comp_team_type: CompTeamType } | null;
            return ct ? { comp_team_id: e.comp_team_id, call_time: e.call_time, name: ct.name, comp_team_type: ct.comp_team_type } : null;
          })
          .filter((e): e is EntryRow => !!e)
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [competitionId, person]);

  if (!person) return null;
  if (competition === undefined) return null;
  if (competition === null) {
    return (
      <div style={{ padding: 24 }}>
        <p className="font-display" style={{ fontSize: 18 }}>
          Competition not found
        </p>
        <p style={{ color: "var(--ink-3)", fontSize: 13 }}>This competition doesn't exist, or isn't published yet.</p>
      </div>
    );
  }

  const dateLabel = new Date(competition.starts_on).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ padding: "16px 20px 14px", borderBottom: "1px solid var(--hairline)" }}>
        <div className="font-display" style={{ fontWeight: 700, fontSize: 16 }}>
          {competition.name}
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 1 }}>
          Dance competition · {dateLabel}
          {competition.venue_name ? ` · ${competition.venue_name}` : ""}
        </div>
      </div>

      <div style={{ padding: "18px 20px 40px" }}>
        <div style={{ borderRadius: 18, overflow: "hidden", boxShadow: "0 4px 14px -6px rgba(44,32,12,.22)" }}>
          <div style={{ background: "var(--band)", color: "var(--band-ink)", padding: "18px 18px" }}>
            <div className="font-display" style={{ fontWeight: 800, fontSize: 18 }}>{competition.name}</div>
            <div style={{ fontSize: 11, color: "var(--band-ink-2)", marginTop: 3 }}>
              {competition.venue_name ?? "Venue TBD"} · {dateLabel}
            </div>
          </div>
          <div style={{ background: "var(--surface)", padding: "14px 16px", display: "flex", gap: 14 }}>
            <div style={{ flex: 1 }}>
              <Eyebrow>Date</Eyebrow>
              <div className="font-display" style={{ fontWeight: 800, fontSize: 15, marginTop: 3 }}>{dateLabel}</div>
            </div>
            <div style={{ width: 1, background: "var(--sand)" }} />
            <div style={{ flex: 1.6 }}>
              <Eyebrow>Venue</Eyebrow>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 3 }}>{competition.venue_name ?? "Not set yet"}</div>
              {competition.venue_address && <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{competition.venue_address}</div>}
            </div>
          </div>
        </div>

        {competition.registration_note && (
          <div style={{ marginTop: 22 }}>
            <Eyebrow>Notes from {competition.created_by_name ?? "the Director"}</Eyebrow>
            <div className="card" style={{ marginTop: 10, border: "1px solid var(--hairline)", borderRadius: 16, padding: "14px 16px" }}>
              <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55 }}>{competition.registration_note}</div>
            </div>
          </div>
        )}

        <div style={{ marginTop: 22 }}>
          <Eyebrow>Our Comp Teams here · {entries?.length ?? 0}</Eyebrow>
          <div className="card" style={{ marginTop: 10, border: "1px solid var(--hairline)", borderRadius: 16, padding: "2px 16px" }}>
            {entries === null ? (
              <p style={{ padding: "13px 0", color: "var(--ink-2)", fontSize: 13 }}>Loading…</p>
            ) : entries.length === 0 ? (
              <p style={{ padding: "13px 0", color: "var(--ink-2)", fontSize: 13 }}>No Comp Teams entered yet.</p>
            ) : (
              entries.map((e, i) => (
                <Link
                  key={e.comp_team_id}
                  to={`/comp-team/${e.comp_team_id}`}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: i === 0 ? "none" : "1px solid var(--sand)", color: "inherit" }}
                >
                  <Avatar name={e.name} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>{e.name}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{TYPE_LABEL[e.comp_team_type]}</div>
                  </div>
                  {e.call_time && studio ? (
                    <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 12.5, background: "var(--sand)", borderRadius: 8, padding: "6px 11px", flexShrink: 0 }}>
                      {formatTimeInZone(e.call_time, studio.timezone).main}
                      {formatTimeInZone(e.call_time, studio.timezone).meridiem.toUpperCase()}
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-3)", border: "1.5px dashed var(--hairline)", borderRadius: 8, padding: "5px 10px", flexShrink: 0 }}>Not set yet</span>
                  )}
                  <ChevronIcon />
                </Link>
              ))
            )}
          </div>
          <p style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 8 }}>
            Tap a Comp Team to open its own Home, Schedule, roster &amp; rehearsals — this page only covers what's specific to the event itself.
          </p>
        </div>

        <p style={{ fontSize: 11, color: "var(--ink-3)", textAlign: "center", lineHeight: 1.5, marginTop: 30 }}>
          Questions about a call time or rehearsal? Message the Comp Team directly — this page is for what's shared across everyone competing here.
        </p>
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

function ChevronIcon() {
  return (
    <svg style={{ width: 15, height: 15, color: "var(--ink-3)", flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}
