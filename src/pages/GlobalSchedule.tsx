import { useCallback, useEffect, useState } from "react";
import { supabase, callApp } from "../lib/supabase";
import { useAuth, hasRole } from "../lib/AuthProvider";
import { useStudio } from "../lib/useStudio";
import { ScheduleView, type ScheduleEvent } from "../components/ScheduleView";

interface Destination {
  id: string;
  kind: "team" | "comp_team";
  name: string;
}

interface RawEvent extends ScheduleEvent {
  team_id: string | null;
  comp_team_id: string | null;
  studio_wide: boolean;
}

// The signed-in person's own week/month across everything they belong to.
// No scoping filter of our own by default — event_read's RLS policy
// already returns exactly the right rows for this person; the Filter
// sheet (docs/DEFICIENCIES.md #9) narrows what's *displayed* client-side,
// on top of that, never widens it. Destination list mirrors
// HomeUnified's own Director-vs-not branching (a Director isn't
// personally a member of anything, so teams_i_can_see() is empty for
// them — see Deficiency #18's fix) rather than assuming teams_i_can_see()
// always works. See BUILD_PLAN.md Task 11.
export function GlobalSchedule() {
  const { person } = useAuth();
  const studio = useStudio();
  const isDirector = hasRole(person, "director");

  const [destinations, setDestinations] = useState<Destination[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string> | null>(null); // null = no filter applied (show everything)
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draftIds, setDraftIds] = useState<Set<string>>(new Set());
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!person) return;
    let cancelled = false;
    async function load() {
      let teamRows: { id: string; name: string }[] = [];
      let compTeamRows: { id: string; name: string }[] = [];
      if (isDirector) {
        const [{ data: teams }, { data: compTeams }] = await Promise.all([
          supabase.from("team").select("id, name").eq("studio_id", person!.studio_id).eq("is_active", true).order("name"),
          supabase.from("comp_team").select("id, name").eq("studio_id", person!.studio_id).eq("is_active", true).order("name"),
        ]);
        teamRows = teams ?? [];
        compTeamRows = compTeams ?? [];
      } else {
        const [{ data: teamIds }, { data: compTeamIds }] = await Promise.all([
          callApp<string[]>("teams_i_can_see"),
          callApp<string[]>("comp_teams_i_can_see"),
        ]);
        const [{ data: teams }, { data: compTeams }] = await Promise.all([
          (teamIds ?? []).length > 0 ? supabase.from("team").select("id, name").in("id", teamIds!).order("name") : Promise.resolve({ data: [] as { id: string; name: string }[] }),
          (compTeamIds ?? []).length > 0 ? supabase.from("comp_team").select("id, name").in("id", compTeamIds!).order("name") : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        ]);
        teamRows = teams ?? [];
        compTeamRows = compTeams ?? [];
      }
      if (cancelled) return;
      setDestinations([
        ...teamRows.map((t) => ({ id: t.id, kind: "team" as const, name: t.name })),
        ...compTeamRows.map((c) => ({ id: c.id, kind: "comp_team" as const, name: c.name })),
      ]);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [person, isDirector]);

  const fetchEvents = useCallback(
    async ({ start, end }: { start: Date; end: Date }): Promise<ScheduleEvent[]> => {
      const { data, error } = await supabase
        .from("event")
        .select("id, title, event_type, starts_at, ends_at, team_id, comp_team_id, studio_wide")
        .is("cancelled_at", null)
        .gte("starts_at", start.toISOString())
        .lt("starts_at", end.toISOString())
        .order("starts_at");
      if (error) throw error;
      const rows = (data ?? []) as RawEvent[];
      if (!selectedIds) return rows;
      return rows.filter((e) => e.studio_wide || (e.team_id && selectedIds.has(e.team_id)) || (e.comp_team_id && selectedIds.has(e.comp_team_id)));
    },
    [selectedIds]
  );

  if (!person || !studio) return null;

  const openSheet = () => {
    setDraftIds(selectedIds ?? new Set(destinations?.map((d) => d.id) ?? []));
    setSheetOpen(true);
  };

  const applyFilter = () => {
    setSelectedIds(draftIds.size === (destinations?.length ?? 0) ? null : new Set(draftIds));
    setSheetOpen(false);
    setReloadKey((k) => k + 1);
  };

  const showingAll = selectedIds === null;
  const selectedCount = selectedIds?.size ?? destinations?.length ?? 0;
  const totalCount = destinations?.length ?? 0;

  return (
    <div style={{ padding: "18px 20px 30px", maxWidth: 480 }}>
      <h1 className="font-display" style={{ fontSize: 25 }}>
        Schedule
      </h1>
      <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>
        Your own schedule — everything you belong to, in one place.
      </p>

      {destinations && destinations.length > 0 && (
        <>
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <FilterChip
              active={showingAll}
              onClick={() => {
                setSelectedIds(null);
                setReloadKey((k) => k + 1);
              }}
            >
              All
            </FilterChip>
            <FilterChip active={!showingAll} onClick={openSheet}>
              <FunnelIcon />
              Filter
              {!showingAll && <CountBadge n={selectedCount} />}
            </FilterChip>
          </div>
          {!showingAll && (
            <p style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 6 }}>
              Filtering: {[...(destinations ?? [])].filter((d) => selectedIds!.has(d.id)).map((d) => d.name).slice(0, 2).join(", ")}
              {selectedCount > 2 ? ` +${selectedCount - 2} more` : ""} ({selectedCount} of {totalCount}) — tap Filter to adjust
            </p>
          )}
        </>
      )}

      <div style={{ marginTop: 16 }}>
        <ScheduleView
          key={reloadKey}
          timeZone={studio.timezone}
          fetchEvents={fetchEvents}
          emptyText="Nothing scheduled this week."
          addEvent={{ to: "/add-event", label: "Add event" }}
        />
      </div>

      {sheetOpen && destinations && (
        <FilterSheetUI
          destinations={destinations}
          draftIds={draftIds}
          setDraftIds={setDraftIds}
          onClose={() => setSheetOpen(false)}
          onApply={applyFilter}
        />
      )}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "7px 14px",
        borderRadius: 999,
        background: active ? "var(--band)" : "var(--surface)",
        border: `1px solid ${active ? "var(--band)" : "var(--hairline)"}`,
        color: active ? "var(--band-ink)" : "var(--ink-2)",
        fontSize: 12.5,
        fontWeight: 700,
        whiteSpace: "nowrap",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function CountBadge({ n }: { n: number }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 16,
        height: 16,
        padding: "0 4px",
        borderRadius: 999,
        background: "var(--signal)",
        color: "var(--signal-ink)",
        fontSize: 9.5,
        fontWeight: 800,
      }}
    >
      {n}
    </span>
  );
}

function FilterSheetUI({
  destinations,
  draftIds,
  setDraftIds,
  onClose,
  onApply,
}: {
  destinations: Destination[];
  draftIds: Set<string>;
  setDraftIds: (ids: Set<string>) => void;
  onClose: () => void;
  onApply: () => void;
}) {
  const toggle = (id: string) => {
    const next = new Set(draftIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDraftIds(next);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(28,23,20,.4)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100 }} onClick={onClose}>
      <div
        style={{ width: "100%", maxWidth: 480, background: "var(--paper)", borderRadius: "22px 22px 0 0", boxShadow: "0 -8px 30px -12px rgba(44,32,12,.28)", maxHeight: "80vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 10 }}>
          <div style={{ width: 36, height: 4, borderRadius: 999, background: "var(--hairline)" }} />
        </div>
        <div style={{ padding: "12px 20px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 17 }}>Filter schedule</h2>
          <button
            type="button"
            onClick={() => setDraftIds(new Set())}
            style={{ fontSize: 12.5, fontWeight: 700, color: "var(--signal-deep)", background: "none", border: "none", cursor: "pointer" }}
          >
            Clear
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px 6px" }}>
          {destinations.map((d) => (
            <div
              key={d.id}
              role="button"
              onClick={() => toggle(d.id)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: "1px solid var(--sand)", cursor: "pointer" }}
            >
              <Checkbox checked={draftIds.has(d.id)} />
              <div style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: draftIds.has(d.id) ? "var(--ink)" : "var(--ink-2)" }}>{d.name}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: "12px 20px 24px", borderTop: "1px solid var(--hairline)" }}>
          <button
            type="button"
            onClick={onApply}
            style={{ width: "100%", background: "var(--band)", color: "var(--signal)", textAlign: "center", padding: 14, borderRadius: 13, fontWeight: 700, fontSize: 13.5, border: "none", cursor: "pointer" }}
          >
            Apply filters · {draftIds.size} selected
          </button>
        </div>
      </div>
    </div>
  );
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <div
      style={{
        width: 21,
        height: 21,
        borderRadius: 6,
        border: `1.5px solid ${checked ? "var(--band)" : "var(--hairline)"}`,
        background: checked ? "var(--band)" : "transparent",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {checked && (
        <svg style={{ width: 12, height: 12, color: "var(--signal)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 13l4 4L19 7" />
        </svg>
      )}
    </div>
  );
}

function FunnelIcon() {
  return (
    <svg style={{ width: 13, height: 13, color: "var(--ink-2)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}
