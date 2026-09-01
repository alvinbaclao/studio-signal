// Generic stand-in for every screen not yet built. Each of these gets
// replaced by a real screen in its own BUILD_PLAN.md prompt — grep this
// repo for <Placeholder to find what's left.
export function Placeholder({ title }: { title: string }) {
  return (
    <div style={{ padding: 24 }}>
      <p className="font-display" style={{ fontSize: 20 }}>
        {title}
      </p>
      <p style={{ color: "var(--ink-3)" }}>Not built yet — see BUILD_PLAN.md.</p>
    </div>
  );
}
