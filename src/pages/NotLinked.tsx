// Signed in, but no person row and no invite/join-code in the URL — see
// BUILD_PLAN.md Prompt 1.
export function NotLinked() {
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
      <p className="font-display" style={{ fontSize: 20 }}>
        This account isn't linked to a studio yet
      </p>
      <p style={{ color: "var(--ink-2)", maxWidth: 320 }}>
        Ask your studio for an invite or join code.
      </p>
    </div>
  );
}
