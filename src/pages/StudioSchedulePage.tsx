import { useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth, hasRole } from "../lib/AuthProvider";
import { useStudio } from "../lib/useStudio";
import { ScheduleView, type ScheduleEvent } from "../components/ScheduleView";

// Scoped to studio_wide = true only — picture day, the recital, closures.
// Never a merged feed of every Team's own classes; those stay on each
// Team's own Schedule tab. See BUILD_PLAN.md Task 11's explicit Verify
// step: confirm this never shows an ordinary Team class.
export function StudioSchedulePage() {
  const { person } = useAuth();
  const studio = useStudio();
  const isDirector = hasRole(person, "director");

  const fetchEvents = useCallback(
    async ({ start, end }: { start: Date; end: Date }): Promise<ScheduleEvent[]> => {
      const { data, error } = await supabase
        .from("event")
        .select("id, title, event_type, starts_at, ends_at")
        .eq("studio_wide", true)
        .is("cancelled_at", null)
        .gte("starts_at", start.toISOString())
        .lt("starts_at", end.toISOString())
        .order("starts_at");
      if (error) throw error;
      return data ?? [];
    },
    []
  );

  if (!person || !studio) return null;

  return (
    <div style={{ padding: "18px 34px 30px", maxWidth: 480 }}>
      <div>
        <h2 style={{ fontSize: 20 }}>Studio</h2>
        <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{studio.name} · Schedule</div>
      </div>
      <div style={{ marginTop: 16 }}>
        <ScheduleView
          timeZone={studio.timezone}
          fetchEvents={fetchEvents}
          emptyText="Nothing scheduled this week."
          addEvent={isDirector ? { to: "/add-event", label: "Add studio-wide event" } : undefined}
        />
      </div>
    </div>
  );
}
