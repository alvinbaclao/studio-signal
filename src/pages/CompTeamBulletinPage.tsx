import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase, callApp } from "../lib/supabase";
import { useAuth, hasRole } from "../lib/AuthProvider";
import { DestinationHeader } from "../components/DestinationHeader";
import { DestinationSubNav } from "../components/DestinationSubNav";
import { BulletinFeed } from "../components/BulletinFeed";

// See BUILD_PLAN.md Task 17 — thin wrapper around the shared BulletinFeed,
// scoped to this Comp Team. Also this task's live proof that a Comp
// Team's Bulletin is narrower than its own visibility: a confirmed studio
// member who isn't cast here can see the Comp Team exists (TeamsAndDances)
// but the `post_read` RLS policy still hides its posts from them.
export function CompTeamBulletinPage() {
  const { id: compTeamId } = useParams<{ id: string }>();
  const { person } = useAuth();
  const isDirector = hasRole(person, "director");
  const [compTeam, setCompTeam] = useState<{ name: string; comp_team_type: string } | null>(null);
  const [choreographs, setChoreographs] = useState(false);
  const [choreographerIds, setChoreographerIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!compTeamId || !person) return;
    supabase.from("comp_team").select("name, comp_team_type").eq("id", compTeamId).single().then(({ data }) => setCompTeam(data ?? null));
    supabase
      .from("comp_team_cast")
      .select("person_id")
      .eq("comp_team_id", compTeamId)
      .eq("role", "choreographer")
      .then(({ data }) => setChoreographerIds(new Set((data ?? []).map((r) => r.person_id))));
    callApp<string[]>("comp_teams_i_choreograph").then(({ data }) => setChoreographs((data ?? []).includes(compTeamId)));
  }, [compTeamId, person]);

  const roleResolver = useCallback((personId: string) => (choreographerIds.has(personId) ? "Choreographer" : null), [choreographerIds]);

  if (!person || !compTeam || !compTeamId) return null;
  const base = `/comp-team/${compTeamId}`;
  const canPost = isDirector || choreographs;

  return (
    <div>
      <DestinationHeader name={compTeam.name} subtitle={compTeam.comp_team_type} />
      <DestinationSubNav base={base} />
      <BulletinFeed
        scope="comp_team"
        destinationId={compTeamId}
        canPost={canPost}
        composerLink={`${base}/bulletin/new`}
        fabNote="Director / assigned Instructor only"
        roleResolver={roleResolver}
      />
    </div>
  );
}
