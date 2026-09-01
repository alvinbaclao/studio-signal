import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase, callApp } from "../lib/supabase";
import { useAuth } from "../lib/AuthProvider";
import type { Database } from "../lib/database.types";

type JoinScope = Database["public"]["Enums"]["join_code_scope"];
type SelfRole = "parent" | "dancer" | "instructor";

function asScope(value: string | null): JoinScope | null {
  return value === "parent_dancer" || value === "instructor" ? value : null;
}

function asRole(value: string | null): SelfRole | null {
  return value === "parent" || value === "dancer" || value === "instructor"
    ? value
    : null;
}

const shellStyle: React.CSSProperties = {
  minHeight: "100dvh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 16,
  padding: 24,
};

const tileStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 360,
  textAlign: "left",
  padding: "16px 18px",
  borderRadius: 12,
  background: "var(--sand)",
  border: "1px solid var(--hairline)",
  color: "var(--ink)",
  fontSize: 14.5,
  fontWeight: 600,
  cursor: "pointer",
};

// Rendered by Gate for the self-serve join-code path — both before a
// session exists (code entry, role tiles, sign-up) and after (auto-redeem).
// The code/scope/role/registrant name all travel through the URL, not
// component state, because Supabase's email confirmation can reopen this
// page in a different tab or device. See BUILD_PLAN.md Task 1.
export function JoinRedeem() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { session, refreshPerson, setNeedsProfileCompletion } = useAuth();

  const code = searchParams.get("code");
  const scope = asScope(searchParams.get("scope"));
  const role = asRole(searchParams.get("role"));
  const nameParam = searchParams.get("name");

  const [codeInput, setCodeInput] = useState("");
  const [dancerOrInstructor, setDancerOrInstructor] = useState(false);

  const [mode, setMode] = useState<"sign-up" | "sign-in">("sign-up");
  const [fullName, setFullName] = useState(nameParam ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  const [redeemError, setRedeemError] = useState<string | null>(null);
  const attempted = useRef(false);

  const registrantName = nameParam ?? fullName;

  useEffect(() => {
    if (!session || !code || !scope || !role || !registrantName) return;
    if (attempted.current) return;
    attempted.current = true;

    callApp<string>("redeem_join_code", {
      p_code: code,
      p_scope: scope,
      p_self_role: role,
      p_registrant: { full_name: registrantName, email: session.user.email },
    }).then(async ({ error }) => {
      if (error) {
        setRedeemError(error.message);
        return;
      }
      // Route through CompleteProfile once (Task 4) before Waiting/home.
      setNeedsProfileCompletion(true);
      await refreshPerson();
      setSearchParams({}, { replace: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, code, scope, role, registrantName]);

  if (redeemError) {
    return (
      <div style={shellStyle}>
        <p className="font-display" style={{ fontSize: 20 }}>
          This join code couldn't be used
        </p>
        <p style={{ color: "var(--busy)", maxWidth: 320, textAlign: "center" }}>
          {redeemError}
        </p>
        <p style={{ color: "var(--ink-2)", maxWidth: 320, textAlign: "center" }}>
          Contact the studio to request a new code.
        </p>
      </div>
    );
  }

  // Step 1: no code yet — let them type one in (scanning a QR normally
  // lands here with ?code= already set; this is the manual-entry fallback).
  if (!code) {
    return (
      <div style={shellStyle}>
        <p className="font-display" style={{ fontSize: 20 }}>
          Enter your join code
        </p>
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (codeInput.trim()) {
              setSearchParams({ code: codeInput.trim() });
            }
          }}
          style={{ display: "flex", flexDirection: "column", gap: 10, width: 320 }}
        >
          <input
            type="text"
            placeholder="Join code"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            required
          />
          <button type="submit">Continue</button>
        </form>
      </div>
    );
  }

  // Step 2: code known, scope/role not yet resolved from the URL — ask.
  if (!scope || !role) {
    return (
      <div style={shellStyle}>
        <p className="font-display" style={{ fontSize: 20 }}>
          How are you joining?
        </p>
        <button
          type="button"
          style={tileStyle}
          onClick={() =>
            setSearchParams({ code, scope: "parent_dancer", role: "parent" })
          }
        >
          I'm a parent registering my dancer(s)
        </button>

        {!dancerOrInstructor ? (
          <button
            type="button"
            style={tileStyle}
            onClick={() => setDancerOrInstructor(true)}
          >
            I'm an adult dancer or instructor registering myself
          </button>
        ) : (
          <div
            style={{
              width: "100%",
              maxWidth: 360,
              display: "flex",
              gap: 10,
            }}
          >
            <button
              type="button"
              style={{ ...tileStyle, flex: 1, textAlign: "center" }}
              onClick={() =>
                setSearchParams({ code, scope: "parent_dancer", role: "dancer" })
              }
            >
              Dancer
            </button>
            <button
              type="button"
              style={{ ...tileStyle, flex: 1, textAlign: "center" }}
              onClick={() =>
                setSearchParams({ code, scope: "instructor", role: "instructor" })
              }
            >
              Instructor
            </button>
          </div>
        )}
      </div>
    );
  }

  // Step 3: scope/role known, session exists but redeem hasn't landed yet.
  if (session) {
    return (
      <div style={shellStyle}>
        <p className="font-display" style={{ fontSize: 20 }}>
          Joining your studio…
        </p>
      </div>
    );
  }

  if (awaitingConfirmation) {
    return (
      <div style={shellStyle}>
        <p className="font-display" style={{ fontSize: 20 }}>
          Check your email
        </p>
        <p style={{ color: "var(--ink-2)", maxWidth: 320, textAlign: "center" }}>
          Confirm your address to finish joining — the link will bring you
          straight back here.
        </p>
      </div>
    );
  }

  // Step 4: scope/role known, no session — collect the account + registrant
  // details and sign up (or sign in, for a second-studio join).
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    if (mode === "sign-up") {
      const redirectTo = `${window.location.origin}/join?code=${encodeURIComponent(
        code
      )}&scope=${scope}&role=${role}&name=${encodeURIComponent(fullName)}`;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) setFormError(error.message);
      else if (!data.session) setAwaitingConfirmation(true);
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) setFormError(error.message);
    }

    setSubmitting(false);
  };

  return (
    <div style={shellStyle}>
      <form
        onSubmit={onSubmit}
        style={{ display: "flex", flexDirection: "column", gap: 12, width: 320 }}
      >
        <p className="font-display" style={{ fontSize: 20 }}>
          {mode === "sign-up" ? "Create your account" : "Sign in"}
        </p>
        {mode === "sign-up" && (
          <input
            type="text"
            placeholder="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
        )}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />
        {formError && <p style={{ color: "var(--busy)" }}>{formError}</p>}
        <button type="submit" disabled={submitting}>
          {mode === "sign-up" ? "Continue" : "Sign in"}
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === "sign-up" ? "sign-in" : "sign-up")}
        >
          {mode === "sign-up" ? "Already have an account?" : "Need an account?"}
        </button>
      </form>
    </div>
  );
}
