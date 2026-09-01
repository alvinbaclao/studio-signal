import { useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthProvider";
import { useStudio } from "../lib/useStudio";
import { ScheduleView, type ScheduleEvent } from "../components/ScheduleView";

// The signed-in person's own week/month across everything they belong to.
// No scoping filter of our own — event_read's RLS policy already returns
// exactly the right rows for this person. See BUILD_PLAN.md Task 11.
export function GlobalSchedule() {
  const { person } = useAuth();
  const studio = useStudio();

  const fetchEvents = useCallback(
    async ({ start, end }: { start: Date; end: Date }): Promise<ScheduleEvent[]> => {
      const { data, error } = await supabase
        .from("event")
        .select("id, title, event_type, starts_at, ends_at")
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
    <div style={{ padding: "18px 20px 30px", maxWidth: 480 }}>
      <h1 className="font-display" style={{ fontSize: 25 }}>
        Schedule
      </h1>
      <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>
        Your own schedule — everything you belong to, in one place.
      </p>
      <div style={{ marginTop: 16 }}>
        <ScheduleView timeZone={studio.timezone} fetchEvents={fetchEvents} emptyText="Nothing scheduled this week." />
      </div>
    </div>
  );
}
