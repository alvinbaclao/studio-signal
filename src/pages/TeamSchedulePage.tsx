import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth, hasRole } from "../lib/AuthProvider";
import { useStudio } from "../lib/useStudio";
import { ScheduleView, type ScheduleEvent } from "../components/ScheduleView";
import { DestinationHeader } from "../components/DestinationHeader";
import { DestinationSubNav } from "../components/DestinationSubNav";

// A destination's own Schedule tab filters strictly to that destination's
// team_id — never a merged feed of every Team's classes. Shares the same
// DestinationHeader/DestinationSubNav shell as TeamHome (Task 15). See
// BUILD_PLAN.md Task 11.
export function TeamSchedulePage() {
  const { id: teamId } = useParams<{ id: string }>();
  const { person } = useAuth();
  const studio = useStudio();
  const isDirector = hasRole(person, "director");
  const [team, setTeam] = useState<{ name: string; level: string | null } | null>(null);
  const [teaches, setTeaches] = useState(false);

  useEffect(() => {
    if (!teamId || !person) return;
    supabase
      .from("team")
      .select("name, level")
      .eq("id", teamId)
      .single()
      .then(({ data }) => setTeam(data ?? null));
    supabase
      .from("team_member")
      .select("person_id")
      .eq("team_id", teamId)
      .eq("person_id", person.id)
      .eq("role", "instructor")
      .maybeSingle()
      .then(({ data }) => setTeaches(!!data));
  }, [teamId, person]);

  const fetchEvents = useCallback(
    async ({ start, end }: { start: Date; end: Date }): Promise<ScheduleEvent[]> => {
      if (!teamId) return [];
      const { data, error } = await supabase
        .from("event")
        .select("id, title, event_type, starts_at, ends_at")
        .eq("team_id", teamId)
        .is("cancelled_at", null)
        .gte("starts_at", start.toISOString())
        .lt("starts_at", end.toISOString())
        .order("starts_at");
      if (error) throw error;
      return data ?? [];
    },
    [teamId]
  );

  if (!person || !studio || !team) return null;

  return (
    <div>
      <DestinationHeader name={team.name} subtitle={team.level ?? "Team"} />
      <DestinationSubNav base={`/team/${teamId}`} />
      <div style={{ padding: "20px 20px 30px", maxWidth: 480 }}>
        <ScheduleView
          timeZone={studio.timezone}
          fetchEvents={fetchEvents}
          emptyText="Nothing scheduled this week."
          addEvent={teaches || isDirector ? { to: `/add-event?team=${teamId}`, label: "Add class or rehearsal" } : undefined}
        />
      </div>
    </div>
  );
}
