import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase, callApp } from "../lib/supabase";
import { useAuth, hasRole } from "../lib/AuthProvider";
import { DestinationHeader } from "../components/DestinationHeader";
import { DestinationSubNav } from "../components/DestinationSubNav";
import { EssentialsList } from "../components/EssentialsList";

// See BUILD_PLAN.md Task 19 — thin wrapper around the shared
// EssentialsList, scoped to this Team.
export function TeamEssentialsPage() {
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

  return (
    <div>
      <DestinationHeader name={team.name} subtitle={team.level ?? "Team"} />
      <DestinationSubNav base={base} />
      <EssentialsList
        scope="team"
        destinationId={teamId}
        canAdd={isDirector || teaches}
        addLink={`${base}/essentials/new`}
        addNote="You & the Director only"
      />
    </div>
  );
}
