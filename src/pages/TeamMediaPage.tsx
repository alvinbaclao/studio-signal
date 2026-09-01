import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase, callApp } from "../lib/supabase";
import { useAuth, hasRole } from "../lib/AuthProvider";
import { DestinationHeader } from "../components/DestinationHeader";
import { DestinationSubNav } from "../components/DestinationSubNav";
import { MediaGrid, MediaFab } from "../components/MediaGrid";

// See BUILD_PLAN.md Task 18 — thin wrapper around the shared MediaGrid,
// scoped to this Team.
export function TeamMediaPage() {
  const { id: teamId } = useParams<{ id: string }>();
  const { person } = useAuth();
  const isDirector = hasRole(person, "director");
  const [team, setTeam] = useState<{ name: string; level: string | null } | null>(null);
  const [teaches, setTeaches] = useState(false);

  useEffect(() => {
    if (!teamId || !person) return;
    supabase.from("team").select("name, level").eq("id", teamId).single().then(({ data }) => setTeam(data ?? null));
    callApp<string[]>("teams_i_teach").then(({ data }) => setTeaches((data ?? []).includes(teamId)));
  }, [teamId, person]);

  if (!person || !team || !teamId) return null;
  const base = `/team/${teamId}`;
  const canUpload = isDirector || teaches;

  return (
    <div>
      <DestinationHeader name={team.name} subtitle={team.level ?? "Team"} />
      <DestinationSubNav base={base} />
      <MediaGrid scope="team" destinationId={teamId} />
      {canUpload && <MediaFab to={`${base}/media/new`} note="You & the Director only" />}
    </div>
  );
}
