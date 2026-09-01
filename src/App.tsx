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
import { Settings } from "./pages/Settings";
import { CompleteProfile } from "./pages/CompleteProfile";
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
        element={hasRole(person, "director") ? <DirectorHome /> : <Placeholder title="Home" />}
      />
      <Route path="/schedule" element={<Placeholder title="Schedule" />} />
      <Route path="/messages" element={<Placeholder title="Messaging" />} />
      <Route path="/profile" element={<Placeholder title="Profile" />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/teams" element={<Placeholder title="Teams & Competitions" />} />
      <Route path="/roster" element={<Placeholder title="Roster" />} />
      <Route path="/confirm-queue" element={<Placeholder title="Confirm queue" />} />
      <Route path="/studio-calendar" element={<Placeholder title="Studio calendar" />} />
      <Route path="/competitions" element={<Placeholder title="Competitions" />} />
      <Route path="/invite-someone" element={<Placeholder title="Invite someone" />} />
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
