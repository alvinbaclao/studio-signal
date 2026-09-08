import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

// person.status, mirrored from the database enum in backend/migrations/0001_schema.sql.
export type PersonStatus = "pending" | "confirmed" | "declined";

export type Role = "director" | "instructor" | "dancer" | "parent";

export interface CurrentPerson {
  id: string;
  studio_id: string;
  full_name: string;
  status: PersonStatus;
  roles: Role[];
}

interface AuthState {
  session: Session | null;
  /** null while loading, undefined if signed in but no person row exists yet
   *  (no invite/join-code redeemed) */
  person: CurrentPerson | null | undefined;
  loading: boolean;
  refreshPerson: () => Promise<void>;
  /** Set right after a fresh redeem_invite/redeem_join_code succeeds, so
   *  Gate routes to CompleteProfile once (BUILD_PLAN Task 4) before Waiting
   *  or the person's home screen. Backed by sessionStorage so it survives a
   *  reload mid-flow, but only for this tab — there's no schema column for
   *  "has this person finished onboarding," and there shouldn't be one just
   *  for a screen that's only ever shown once right after redemption. */
  needsProfileCompletion: boolean;
  setNeedsProfileCompletion: (value: boolean) => void;
}

const AuthContext = createContext<AuthState | null>(null);

const ONBOARDING_KEY = "needs-profile-completion";

// Load the signed-in person exactly this way, and nowhere else — see
// PROJECT_KNOWLEDGE.md: "load the current person via
// select * from person where auth_user_id = auth.uid()". Never match by
// email; never write to person.auth_user_id from here or anywhere in the
// client — only app.redeem_invite and app.redeem_join_code may ever set it.
//
// The explicit .eq("auth_user_id", ...) below is load-bearing, not
// decorative: a pending person's RLS visibility legitimately includes more
// than just their own row (e.g. the studio's Director, for contact
// purposes), so an unfiltered `.limit(1)` can silently return someone
// else's row — this was live-tested and confirmed as a real bug during
// BUILD_PLAN Task 4's verification, not a hypothetical.
async function loadCurrentPerson(): Promise<CurrentPerson | null> {
  const { data: userData } = await supabase.auth.getUser();
  const authUserId = userData.user?.id;
  if (!authUserId) return null;

  const { data: personRows, error: personError } = await supabase
    .from("person")
    .select("id, studio_id, full_name, status")
    .eq("auth_user_id", authUserId)
    .limit(1);

  if (personError || !personRows || personRows.length === 0) return null;

  const person = personRows[0] as {
    id: string;
    studio_id: string;
    full_name: string;
    status: PersonStatus;
  };

  const { data: roleRows } = await supabase
    .from("person_role_assignment")
    .select("role")
    .eq("person_id", person.id);

  const roles = (roleRows ?? []).map((r) => r.role as Role);

  return { ...person, roles };
}

// Despia (BUILD_PLAN Task 28) injects a global `despia()` bridge only inside
// the native-wrapped app — this is a silent no-op in plain-browser dev/
// Vercel preview, by design, so this file needs no environment branching.
function callDespia(url: string) {
  const bridge = (window as unknown as { despia?: (url: string) => void })
    .despia;
  if (typeof bridge === "function") bridge(url);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [person, setPerson] = useState<CurrentPerson | null | undefined>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [needsProfileCompletion, setNeedsProfileCompletionState] = useState(
    () => sessionStorage.getItem(ONBOARDING_KEY) === "1"
  );

  const setNeedsProfileCompletion = (value: boolean) => {
    if (value) sessionStorage.setItem(ONBOARDING_KEY, "1");
    else sessionStorage.removeItem(ONBOARDING_KEY);
    setNeedsProfileCompletionState(value);
  };

  const refreshPerson = async () => {
    const p = await loadCurrentPerson();
    setPerson(p ?? undefined);
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) await refreshPerson();
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession);
        if (newSession) {
          await refreshPerson();
        } else {
          setPerson(null);
        }
      }
    );

    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once a real, confirmed person is available, link this device's OneSignal
  // Player ID to their person.id (never a device token stored in Supabase —
  // see BUILD_PLAN Task 28) and prompt for push permission at this
  // deliberately-chosen moment (onboarding just finished), not on cold app
  // launch. Keyed on both id and status so a pending→confirmed transition
  // re-fires this even though id didn't change.
  useEffect(() => {
    if (person && person.status === "confirmed") {
      callDespia(`setonesignalplayerid://?user_id=${person.id}`);
      callDespia("registerpush://");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person?.id, person?.status]);

  return (
    <AuthContext.Provider
      value={{
        session,
        person,
        loading,
        refreshPerson,
        needsProfileCompletion,
        setNeedsProfileCompletion,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

// Convenience role checks — UI-only (hide/show), never a substitute for the
// database's own RLS enforcement. See PROJECT_KNOWLEDGE.md: "Never implement
// a permission check in React."
export function hasRole(person: CurrentPerson | null | undefined, role: Role) {
  return person?.status === "confirmed" && (person?.roles.includes(role) ?? false);
}
