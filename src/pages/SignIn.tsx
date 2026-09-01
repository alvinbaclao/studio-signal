import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

// Minimal email + password sign-in/sign-up. Real behaviour (redeeming an
// invite token or a join code right after this) is Prompt 1 in
// BUILD_PLAN.md — this stub only gets a session established so the rest of
// the app has something to build against.
export function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const { error } =
      mode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: window.location.href },
          });

    if (error) setError(error.message);
    setSubmitting(false);
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{ display: "flex", flexDirection: "column", gap: 12, width: 320 }}
      >
        <p className="font-display" style={{ fontSize: 20 }}>
          {mode === "sign-in" ? "Sign in" : "Create an account"}
        </p>
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
        {error && <p style={{ color: "var(--busy)" }}>{error}</p>}
        <button type="submit" disabled={submitting}>
          {mode === "sign-in" ? "Sign in" : "Sign up"}
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
        >
          {mode === "sign-in" ? "Need an account?" : "Have an account?"}
        </button>
      </form>
    </div>
  );
}
