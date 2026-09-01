import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase, callApp } from "../lib/supabase";
import { useAuth, hasRole } from "../lib/AuthProvider";
import { DestinationHeader } from "../components/DestinationHeader";
import { DestinationSubNav } from "../components/DestinationSubNav";
import { MediaGrid, MediaFab } from "../components/MediaGrid";

// See BUILD_PLAN.md Task 18 — thin wrapper around the shared MediaGrid,
// scoped to this Comp Team.
export function CompTeamMediaPage() {
  const { id: compTeamId } = useParams<{ id: string }>();
  const { person } = useAuth();
  const isDirector = hasRole(person, "director");
  const [compTeam, setCompTeam] = useState<{ name: string; comp_team_type: string } | null>(null);
  const [choreographs, setChoreographs] = useState(false);

  useEffect(() => {
    if (!compTeamId || !person) return;
    supabase.from("comp_team").select("name, comp_team_type").eq("id", compTeamId).single().then(({ data }) => setCompTeam(data ?? null));
    callApp<string[]>("comp_teams_i_choreograph").then(({ data }) => setChoreographs((data ?? []).includes(compTeamId)));
  }, [compTeamId, person]);

  if (!person || !compTeam || !compTeamId) return null;
  const base = `/comp-team/${compTeamId}`;
  const canUpload = isDirector || choreographs;

  return (
    <div>
      <DestinationHeader name={compTeam.name} subtitle={compTeam.comp_team_type} />
      <DestinationSubNav base={base} />
      <MediaGrid scope="comp_team" destinationId={compTeamId} />
      {canUpload && <MediaFab to={`${base}/media/new`} note="Director / assigned Instructor only" />}
    </div>
  );
}
