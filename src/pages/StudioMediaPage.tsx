import { useAuth, hasRole } from "../lib/AuthProvider";
import { useStudio } from "../lib/useStudio";
import { DestinationHeader } from "../components/DestinationHeader";
import { DestinationSubNav } from "../components/DestinationSubNav";
import { MediaGrid, MediaFab } from "../components/MediaGrid";

// See BUILD_PLAN.md Task 18 — thin wrapper around the shared MediaGrid,
// studio-wide. Upload stays Director-only here (unlike Bulletin/
// Essentials, which are open to any confirmed instructor at Studio scope)
// per docs/PROJECT_KNOWLEDGE.md's Bulletin/Media/Essentials section.
export function StudioMediaPage() {
  const { person } = useAuth();
  const studio = useStudio();
  const isDirector = hasRole(person, "director");

  if (!person || !studio) return null;

  return (
    <div>
      <DestinationHeader name="Studio" subtitle={`${studio.name} · everyone`} />
      <DestinationSubNav base="/studio" />
      <MediaGrid scope="studio" destinationId={null} />
      {isDirector && <MediaFab to="/studio/media/new" note="Director only" />}
    </div>
  );
}
