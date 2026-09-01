import { NavLink } from "react-router-dom";

// Home / Schedule / Bulletin / Media / Essentials — the same five tabs on
// every destination (Team, Comp Team, Studio), per
// docs/PROJECT_KNOWLEDGE.md's two-tier navigation architecture. Bulletin,
// Media and Essentials land in Tasks 17–19; their tabs already route
// correctly to a real (if placeholder) screen so the shell is whole now
// rather than growing tabs later. See BUILD_PLAN.md Task 15.
export function DestinationSubNav({ base }: { base: string }) {
  const tabs = [
    { label: "Home", to: base, end: true },
    { label: "Schedule", to: `${base}/schedule`, end: false },
    { label: "Bulletin", to: `${base}/bulletin`, end: false },
    { label: "Media", to: `${base}/media`, end: false },
    { label: "Essentials", to: `${base}/essentials`, end: false },
  ];
  return (
    <nav style={{ display: "flex", gap: 22, padding: "0 20px", borderBottom: "1px solid var(--hairline)", overflowX: "auto" }}>
      {tabs.map((t) => (
        <NavLink
          key={t.label}
          to={t.to}
          end={t.end}
          style={({ isActive }) => ({
            padding: "12px 0 10px",
            fontSize: 13,
            fontWeight: 600,
            color: isActive ? "var(--ink)" : "var(--ink-3)",
            whiteSpace: "nowrap",
            borderBottom: isActive ? "2.5px solid var(--ink)" : "2.5px solid transparent",
          })}
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
