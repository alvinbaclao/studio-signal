import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/AuthProvider";
import { SignIn } from "./pages/SignIn";
import { Waiting } from "./pages/Waiting";
import { NotLinked } from "./pages/NotLinked";
import { Placeholder } from "./pages/Placeholder";

function Gate({ children }: { children: React.ReactNode }) {
  const { session, person, loading } = useAuth();

  if (loading) return null; // render nothing rather than a spinner-gated screen
  if (!session) return <SignIn />;

  // TODO (Prompt 1): if the URL carries ?invite=<token> or
  // /join?code=<code>&scope=..., redeem it here via callApp('redeem_invite', ...)
  // or callApp('redeem_join_code', ...) BEFORE falling through to these
  // states — a freshly-redeemed person won't be in `person` yet on this
  // render, so refreshPerson() after a successful redeem.
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
