import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { callApp } from "../lib/supabase";
import { useAuth } from "../lib/AuthProvider";

// Rendered by Gate once a session exists, the URL carries ?invite=<token>,
// and no person row exists yet for this auth user. Redeems immediately —
// no button click — per BUILD_PLAN.md Task 1. Only app.redeem_invite may
// ever set person.auth_user_id here; this component never does a fallback
// email lookup.
export function InviteRedeem() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { refreshPerson, setNeedsProfileCompletion } = useAuth();
  const token = searchParams.get("invite");
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;

    callApp<string>("redeem_invite", { p_token: token }).then(
      async ({ error }) => {
        if (error) {
          setError(error.message);
          return;
        }
        // Route through CompleteProfile once (Task 4) before Waiting/home.
        setNeedsProfileCompletion(true);
        await refreshPerson();
        // Drop the token from the URL/history now that it's been used once.
        setSearchParams({}, { replace: true });
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: 24,
        textAlign: "center",
      }}
    >
      {error ? (
        <>
          <p className="font-display" style={{ fontSize: 20 }}>
            This invitation couldn't be used
          </p>
          <p style={{ color: "var(--busy)", maxWidth: 320 }}>{error}</p>
          <p style={{ color: "var(--ink-2)", maxWidth: 320 }}>
            Contact the studio to request a new invite.
          </p>
        </>
      ) : (
        <p className="font-display" style={{ fontSize: 20 }}>
          Joining your studio…
        </p>
      )}
    </div>
  );
}
