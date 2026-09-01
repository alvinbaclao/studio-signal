import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import { AuthProvider, useAuth, hasRole } from "./lib/AuthProvider";
import { SignIn } from "./pages/SignIn";
import { Waiting } from "./pages/Waiting";
import { NotLinked } from "./pages/NotLinked";
import { Placeholder } from "./pages/Placeholder";
import { InviteRedeem } from "./pages/InviteRedeem";
import { JoinRedeem } from "./pages/JoinRedeem";
import { DirectorHome } from "./pages/DirectorHome";
import { HomeUnified } from "./pages/HomeUnified";
import { Settings } from "./pages/Settings";
import { CompleteProfile } from "./pages/CompleteProfile";
import { ConfirmQueue } from "./pages/ConfirmQueue";
import { PersonDetail } from "./pages/PersonDetail";
import { InviteSomeone } from "./pages/InviteSomeone";
import { Roster } from "./pages/Roster";
import { TeamsIndex } from "./pages/TeamsIndex";
import { TeamRosterManager } from "./pages/TeamRosterManager";
import { TeamsAndDances } from "./pages/TeamsAndDances";
import { NewCompTeamWizard } from "./pages/NewCompTeamWizard";
import { CastEntryBuilder } from "./pages/CastEntryBuilder";
import { GlobalSchedule } from "./pages/GlobalSchedule";
import { TeamSchedulePage } from "./pages/TeamSchedulePage";
import { CompTeamSchedulePage } from "./pages/CompTeamSchedulePage";
import { StudioSchedulePage } from "./pages/StudioSchedulePage";
import { AddEvent } from "./pages/AddEvent";
import { StudioCalendarReview } from "./pages/StudioCalendarReview";
import { Shell } from "./components/Shell";

function Gate({ children }: { children: React.ReactNode }) {
  const { session, person, loading, needsProfileCompletion } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("invite");
  const joinCode = searchParams.get("code");
  const isJoinRoute = location.pathname === "/join" || !!joinCode;

  if (loading) return null; // render nothing rather than a spinner-gated screen

  // The join-code path needs its own UI before a session exists too (code
  // entry, the parent/dancer/instructor tiles, sign-up) — everything else
  // below assumes a session already exists.
  if (isJoinRoute && (!session || person === undefined)) return <JoinRedeem />;

  if (!session) return <SignIn />;

  if (inviteToken && person === undefined) return <InviteRedeem />;

  if (person === undefined) return <NotLinked />;
  if (person === null) return null; // still loading the person row

  // A person fresh out of redeem_invite/redeem_join_code completes their
  // profile once (Task 4) before landing on Waiting or their home screen,
  // regardless of status — an invited (confirmed) person still needs this
  // step just as much as a self-serve (pending) one.
  if (needsProfileCompletion) return <CompleteProfile />;

  if (person.status === "pending") return <Waiting />;

  return <>{children}</>;
}

function AppRoutes() {
  const { person } = useAuth();
  // Director gets their own Home (DirectorHome.dc.html) — everyone else
  // still sees the Home placeholder until Task 14 builds HomeUnified, since
  // that's explicitly a non-Director screen. Real destinations (Team/Comp
  // Team/Studio, each with its own Home/Schedule/Bulletin/Media/Essentials
  // sub-nav) land in Task 8/9/15.
  return (
    <Routes>
      <Route
        path="/"
        element={hasRole(person, "director") ? <DirectorHome /> : <HomeUnified />}
      />
      <Route path="/schedule" element={<GlobalSchedule />} />
      <Route path="/messages" element={<Placeholder title="Messaging" />} />
      <Route path="/profile" element={<Placeholder title="Profile" />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/teams" element={<TeamsIndex />} />
      <Route path="/roster" element={<Roster />} />
      <Route path="/confirm-queue" element={<ConfirmQueue />} />
      <Route path="/person/:id" element={<PersonDetail />} />
      <Route path="/studio-calendar" element={<StudioCalendarReview />} />
      <Route path="/invite-someone" element={<InviteSomeone />} />
      <Route path="/team/:id/roster" element={<TeamRosterManager />} />
      <Route path="/team/:id/schedule" element={<TeamSchedulePage />} />
      <Route path="/team/:id" element={<Placeholder title="Team" />} />
      <Route path="/comp-teams/new" element={<NewCompTeamWizard />} />
      <Route path="/comp-team/:id/roster" element={<CastEntryBuilder />} />
      <Route path="/comp-team/:id/schedule" element={<CompTeamSchedulePage />} />
      <Route path="/comp-team/:id" element={<Placeholder title="Comp Team" />} />
      <Route path="/competitions/new" element={<Placeholder title="New Competition" />} />
      <Route path="/competition/:id" element={<Placeholder title="Competition" />} />
      <Route path="/competition/:id/manage" element={<Placeholder title="Manage competition" />} />
      <Route path="/studio/schedule" element={<StudioSchedulePage />} />
      <Route path="/studio" element={<Placeholder title="Studio" />} />
      <Route path="/teams-and-dances" element={<TeamsAndDances />} />
      <Route path="/add-event" element={<AddEvent />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate>
          <Shell>
            <AppRoutes />
          </Shell>
        </Gate>
      </AuthProvider>
    </BrowserRouter>
  );
}
