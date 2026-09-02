import { useAuth, hasRole } from "../lib/AuthProvider";
import { useStudio } from "../lib/useStudio";
import { DestinationHeader } from "../components/DestinationHeader";
import { DestinationSubNav } from "../components/DestinationSubNav";
import { EssentialsList } from "../components/EssentialsList";

// See BUILD_PLAN.md Task 19 — thin wrapper around the shared
// EssentialsList, studio-wide. Open to any confirmed instructor here (same
// as Bulletin), unlike Media which stays Director-only at Studio scope.
export function StudioEssentialsPage() {
  const { person } = useAuth();
  const studio = useStudio();
  const isDirector = hasRole(person, "director");
  const isInstructor = hasRole(person, "instructor");

  if (!person || !studio) return null;

  return (
    <div>
      <DestinationHeader name="Studio" subtitle={`${studio.name} · everyone`} />
      <DestinationSubNav base="/studio" />
      <EssentialsList
        scope="studio"
        destinationId={null}
        canAdd={isDirector || isInstructor}
        addLink="/studio/essentials/new"
        addNote="Director / Instructor only"
      />
    </div>
  );
}
