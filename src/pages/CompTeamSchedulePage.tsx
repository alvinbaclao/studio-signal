import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth, hasRole } from "../lib/AuthProvider";
import { useStudio } from "../lib/useStudio";
import { ScheduleView, type ScheduleEvent } from "../components/ScheduleView";

// Same pattern as TeamSchedulePage, scoped to comp_team_id instead. See
// BUILD_PLAN.md Task 11.
export function CompTeamSchedulePage() {
  const { id: compTeamId } = useParams<{ id: string }>();
  const { person } = useAuth();
  const studio = useStudio();
  const isDirector = hasRole(person, "director");
  const [compTeam, setCompTeam] = useState<{ name: string; comp_team_type: string } | null>(null);
  const [choreographs, setChoreographs] = useState(false);

  useEffect(() => {
    if (!compTeamId || !person) return;
    supabase
      .from("comp_team")
      .select("name, comp_team_type")
      .eq("id", compTeamId)
      .single()
      .then(({ data }) => setCompTeam(data ?? null));
    supabase
      .from("comp_team_cast")
      .select("person_id")
      .eq("comp_team_id", compTeamId)
      .eq("person_id", person.id)
      .eq("role", "choreographer")
      .maybeSingle()
      .then(({ data }) => setChoreographs(!!data));
  }, [compTeamId, person]);

  const fetchEvents = useCallback(
    async ({ start, end }: { start: Date; end: Date }): Promise<ScheduleEvent[]> => {
      if (!compTeamId) return [];
      const { data, error } = await supabase
        .from("event")
        .select("id, title, event_type, starts_at, ends_at")
        .eq("comp_team_id", compTeamId)
        .is("cancelled_at", null)
        .gte("starts_at", start.toISOString())
        .lt("starts_at", end.toISOString())
        .order("starts_at");
      if (error) throw error;
      return data ?? [];
    },
    [compTeamId]
  );

  if (!person || !studio || !compTeam) return null;

  return (
    <div style={{ padding: "18px 34px 30px", maxWidth: 480 }}>
      <Link to="/teams" style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)" }}>
        ← Teams &amp; Competitions
      </Link>
      <div style={{ marginTop: 8 }}>
        <h2 style={{ fontSize: 20 }}>{compTeam.name}</h2>
        <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{compTeam.comp_team_type} · Schedule</div>
      </div>
      <div style={{ marginTop: 16 }}>
        <ScheduleView
          timeZone={studio.timezone}
          fetchEvents={fetchEvents}
          emptyText="Nothing scheduled this week."
          addEvent={
            choreographs || isDirector ? { to: `/add-event?compTeam=${compTeamId}`, label: "Add rehearsal" } : undefined
          }
        />
      </div>
    </div>
  );
}
