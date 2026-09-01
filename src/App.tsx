import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/AuthProvider";
import { SignIn } from "./pages/SignIn";
import { Waiting } from "./pages/Waiting";
import { NotLinked } from "./pages/NotLinked";
import { Placeholder } from "./pages/Placeholder";
import { InviteRedeem } from "./pages/InviteRedeem";
import { JoinRedeem } from "./pages/JoinRedeem";
import { Shell } from "./components/Shell";

function Gate({ children }: { children: React.ReactNode }) {
  const { session, person, loading } = useAuth();
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
  if (person.status === "pending") return <Waiting />;

  return <>{children}</>;
}

function AppRoutes() {
  // Real destinations (Team/Comp Team/Studio, each with its own
  // Home/Schedule/Bulletin/Media/Essentials sub-nav) land in Task 8/9/15 —
  // this is still a placeholder route table for the four global tabs plus
  // the Director's fifth rail item.
  return (
    <Routes>
      <Route path="/" element={<Placeholder title="Home" />} />
      <Route path="/schedule" element={<Placeholder title="Schedule" />} />
      <Route path="/messages" element={<Placeholder title="Messaging" />} />
      <Route path="/profile" element={<Placeholder title="Profile" />} />
      <Route path="/director" element={<Placeholder title="Director console" />} />
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
