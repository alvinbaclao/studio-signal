import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./AuthProvider";

export interface DecisionCard {
  key: string;
  label: string;
  title: string;
  detail: string;
  cta: string;
  to: string;
}

export interface RosterPreviewRow {
  id: string;
  full_name: string;
  role: string;
}

export interface DirectorHomeData {
  peopleCount: number;
  teamCount: number;
  compTeamCount: number;
  competitionCount: number;
  pendingPersonCount: number;
  pendingBookingCount: number;
  missingCallTimeCount: number;
  hasJoinCode: boolean;
  hasDancer: boolean;
  rosterPreview: RosterPreviewRow[];
}

const ROLE_LABEL: Record<string, string> = {
  director: "Director",
  instructor: "Instructor",
  dancer: "Dancer",
  parent: "Parent",
};

// The real pending-decision counts (pending person registrations, pending
// booking requests, competition entries missing a call time) — originally
// DirectorHome.tsx's own query (Task 3), extracted so DirectorHomeMobile's
// condensed "Needs a decision" cards (Task 25) share the exact same real
// data and cards, not a second query that could drift out of sync.
export function useDirectorHome(): { data: DirectorHomeData | null; decisionCards: DecisionCard[]; isEmptyStudio: boolean } {
  const { person } = useAuth();
  const [data, setData] = useState<DirectorHomeData | null>(null);

  useEffect(() => {
    if (!person) return;
    let cancelled = false;

    async function load() {
      const studioId = person!.studio_id;

      const [
        peopleCount,
        teamCount,
        compTeamCount,
        competitionCount,
        pendingPersonCount,
        pendingBookingCount,
        joinCodeRows,
        dancerRows,
        rosterRows,
        publishedCompetitions,
      ] = await Promise.all([
        supabase.from("person").select("id", { count: "exact", head: true }).eq("status", "confirmed"),
        supabase.from("team").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("comp_team").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("competition").select("id", { count: "exact", head: true }),
        supabase.from("person").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("booking_request").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("studio_join_code").select("id").eq("studio_id", studioId).limit(1),
        supabase
          .from("person_role_assignment")
          .select("person_id")
          .eq("role", "dancer")
          .limit(1),
        supabase
          .from("person")
          .select("id, full_name")
          .eq("status", "confirmed")
          .order("created_at", { ascending: false })
          .limit(4),
        supabase.from("competition").select("id").not("published_at", "is", null),
      ]);

      let missingCallTimeCount = 0;
      const publishedIds = (publishedCompetitions.data ?? []).map((c) => c.id);
      if (publishedIds.length > 0) {
        const { count } = await supabase
          .from("competition_entry")
          .select("id", { count: "exact", head: true })
          .is("call_time", null)
          .in("competition_id", publishedIds);
        missingCallTimeCount = count ?? 0;
      }

      let rosterPreview: RosterPreviewRow[] = [];
      const rows = rosterRows.data ?? [];
      if (rows.length > 0) {
        const { data: roleRows } = await supabase
          .from("person_role_assignment")
          .select("person_id, role")
          .in("person_id", rows.map((r) => r.id));
        const roleByPerson = new Map<string, string>();
        for (const r of roleRows ?? []) {
          if (!roleByPerson.has(r.person_id)) roleByPerson.set(r.person_id, r.role);
        }
        rosterPreview = rows.map((r) => ({
          id: r.id,
          full_name: r.full_name,
          role: ROLE_LABEL[roleByPerson.get(r.id) ?? ""] ?? "Member",
        }));
      }

      if (cancelled) return;
      setData({
        peopleCount: peopleCount.count ?? 0,
        teamCount: teamCount.count ?? 0,
        compTeamCount: compTeamCount.count ?? 0,
        competitionCount: competitionCount.count ?? 0,
        pendingPersonCount: pendingPersonCount.count ?? 0,
        pendingBookingCount: pendingBookingCount.count ?? 0,
        missingCallTimeCount,
        hasJoinCode: (joinCodeRows.data ?? []).length > 0,
        hasDancer: (dancerRows.data ?? []).length > 0,
        rosterPreview,
      });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [person]);

  const isEmptyStudio = data ? data.teamCount === 0 : false;

  const decisionCards: DecisionCard[] = data
    ? [
        data.pendingPersonCount > 0
          ? {
              key: "pending-people",
              label: `${data.pendingPersonCount} waiting`,
              title: "Pending registrations",
              detail:
                data.pendingPersonCount === 1
                  ? "1 person is waiting to be confirmed"
                  : `${data.pendingPersonCount} people are waiting to be confirmed`,
              cta: "Review queue",
              to: "/confirm-queue",
            }
          : null,
        data.pendingBookingCount > 0
          ? {
              key: "pending-bookings",
              label: `${data.pendingBookingCount} pending`,
              title: "Booking requests",
              detail:
                data.pendingBookingCount === 1
                  ? "1 instructor is waiting on a studio-time decision"
                  : `${data.pendingBookingCount} instructors are waiting on a studio-time decision`,
              cta: "Review",
              to: "/studio-calendar",
            }
          : null,
        data.missingCallTimeCount > 0
          ? {
              key: "missing-call-times",
              label: "Not set yet",
              title: "Call times",
              detail:
                data.missingCallTimeCount === 1
                  ? "1 published entry has no call time"
                  : `${data.missingCallTimeCount} published entries have no call time`,
              cta: "Set times",
              to: "/teams",
            }
          : null,
      ].filter((c): c is DecisionCard => c !== null)
    : [];

  return { data, decisionCards, isEmptyStudio };
}
