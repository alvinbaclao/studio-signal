import { useAuth, hasRole } from "../lib/AuthProvider";
import { useStudio } from "../lib/useStudio";
import { DestinationHeader } from "../components/DestinationHeader";
import { DestinationSubNav } from "../components/DestinationSubNav";
import { BulletinFeed } from "../components/BulletinFeed";

// See BUILD_PLAN.md Task 17 — thin wrapper around the shared BulletinFeed,
// studio-wide. Author identity is shown as the studio itself here
// (BulletinFeed's own scope==='studio' branch), not the individual
// Director who wrote it, matching StudioBulletin.dc.html.
export function StudioBulletinPage() {
  const { person } = useAuth();
  const studio = useStudio();
  const isDirector = hasRole(person, "director");
  const isInstructor = hasRole(person, "instructor");

  if (!person || !studio) return null;

  return (
    <div>
      <DestinationHeader name="Studio" subtitle={`${studio.name} · everyone`} />
      <DestinationSubNav base="/studio" />
      <BulletinFeed
        scope="studio"
        destinationId={null}
        canPost={isDirector || isInstructor}
        composerLink="/studio/bulletin/new"
        fabNote="Director / Instructor only"
      />
    </div>
  );
}
