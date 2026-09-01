import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase, callApp } from "../lib/supabase";
import { useAuth, hasRole } from "../lib/AuthProvider";
import { DestinationHeader } from "../components/DestinationHeader";
import { DestinationSubNav } from "../components/DestinationSubNav";
import { BulletinFeed } from "../components/BulletinFeed";

// See BUILD_PLAN.md Task 17 — thin wrapper around the shared BulletinFeed,
// scoped to this Team.
export function TeamBulletinPage() {
  const { id: teamId } = useParams<{ id: string }>();
  const { person } = useAuth();
  const isDirector = hasRole(person, "director");
  const [team, setTeam] = useState<{ name: string; level: string | null } | null>(null);
  const [teaches, setTeaches] = useState(false);
  const [instructorIds, setInstructorIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!teamId || !person) return;
    supabase.from("team").select("name, level").eq("id", teamId).single().then(({ data }) => setTeam(data ?? null));
    supabase
      .from("team_member")
      .select("person_id")
      .eq("team_id", teamId)
      .eq("role", "instructor")
      .then(({ data }) => setInstructorIds(new Set((data ?? []).map((r) => r.person_id))));
    callApp<string[]>("teams_i_teach").then(({ data }) => setTeaches((data ?? []).includes(teamId)));
  }, [teamId, person]);

  const roleResolver = useCallback((personId: string) => (instructorIds.has(personId) ? "Instructor" : null), [instructorIds]);

  if (!person || !team || !teamId) return null;
  const base = `/team/${teamId}`;
  const canPost = isDirector || teaches;

  return (
    <div>
      <DestinationHeader name={team.name} subtitle={team.level ?? "Team"} />
      <DestinationSubNav base={base} />
      <BulletinFeed
        scope="team"
        destinationId={teamId}
        canPost={canPost}
        composerLink={`${base}/bulletin/new`}
        fabNote="You & the Director only"
        roleResolver={roleResolver}
      />
    </div>
  );
}
