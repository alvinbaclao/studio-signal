import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth, hasRole } from "../lib/AuthProvider";
import { useStudio } from "../lib/useStudio";
import { ScheduleView, type ScheduleEvent } from "../components/ScheduleView";

// A destination's own Schedule tab filters strictly to that destination's
// team_id — never a merged feed of every Team's classes. There's no full
// Team destination shell yet (Task 15 builds Home/Bulletin/Media/
// Essentials), so this stands alone for now, same as TeamRosterManager did
// in Task 9. See BUILD_PLAN.md Task 11.
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
    <div style={{ padding: "18px 34px 30px", maxWidth: 480 }}>
      <Link to="/teams" style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)" }}>
        ← Teams &amp; Competitions
      </Link>
      <div style={{ marginTop: 8 }}>
        <h2 style={{ fontSize: 20 }}>{team.name}</h2>
        <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
          {team.level ? `${team.level} · ` : ""}Schedule
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
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
