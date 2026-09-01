// The calm waiting state for a status = 'pending' person — self-serve
// registrants land here until a Director confirms them (or, for an
// instructor, until they're assigned to a Team/Comp Team — see
// PROJECT_KNOWLEDGE.md, "assignment is the approval"). No shell, no nav, no
// partial data — just this. See BUILD_PLAN.md Prompt 1.
export function Waiting({ studioName }: { studioName?: string }) {
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
      <p className="font-display" style={{ fontSize: 22 }}>
        You're in
      </p>
      <p style={{ color: "var(--ink-2)", maxWidth: 320 }}>
        {studioName ?? "Your studio"} will confirm you shortly.
      </p>
    </div>
  );
}
