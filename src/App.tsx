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

function Shell() {
  // TODO (Prompt 2): the real responsive shell — bottom nav at 390px,
  // dark left rail at 1440px for a Director, per PROJECT_KNOWLEDGE.md's
  // two-tier nav (Home / Schedule / Messages / Profile globally; each
  // destination's own Home / Schedule / Bulletin / Media / Essentials
  // sub-nav). This is a placeholder route table only.
  return (
    <Routes>
      <Route path="/" element={<Placeholder title="Home" />} />
      <Route path="/schedule" element={<Placeholder title="Schedule" />} />
      <Route path="/messages" element={<Placeholder title="Messages" />} />
      <Route path="/profile" element={<Placeholder title="Profile" />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate>
          <Shell />
        </Gate>
      </AuthProvider>
    </BrowserRouter>
  );
}
