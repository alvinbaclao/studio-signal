import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth, hasRole, type Role } from "../lib/AuthProvider";
import { useStudioDirectory, ROLE_PRIORITY, ROLE_LABEL } from "../lib/useStudioDirectory";
import { Avatar } from "../components/Avatar";

const FILTER_OPTIONS: { value: Role | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "director", label: "Directors" },
  { value: "instructor", label: "Instructors" },
  { value: "parent", label: "Parents" },
  { value: "dancer", label: "Dancers" },
];

// Ports design-reference/DirectorRoster.dc.html and
// DirectorRosterLookup.dc.html — the same query and list at every width,
// condensed by the responsive layout rather than a separate mobile screen.
// Read-only: no edit controls here or reachable from here for anyone but a
// Director (PersonDetail's own action bar is gated the same way). Directory
// query itself lives in useStudioDirectory, shared with NewMessage's
// People list (Task 20). See BUILD_PLAN.md Task 7.
export function Roster() {
  const { person: currentPerson } = useAuth();
  const { people, metaByPerson } = useStudioDirectory();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Role | "all">("all");

  const filtered = useMemo(() => {
    if (!people) return [];
    const q = search.trim().toLowerCase();
    return people.filter((p) => {
      if (filter !== "all" && !p.roles.includes(filter)) return false;
      if (q && !p.full_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [people, search, filter]);

  if (!currentPerson) return null;

  return (
    <div style={{ padding: "18px 34px 30px" }}>
      <h2 style={{ fontSize: 24, letterSpacing: "-0.01em" }}>Roster &amp; directory</h2>
      <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 4 }}>
        {people === null ? "Loading…" : `${people.length} confirmed ${people.length === 1 ? "person" : "people"}`}
        {hasRole(currentPerson, "director") && (
          <>
            {" "}
            · pending registrations live on their own queue —{" "}
            <Link to="/confirm-queue" style={{ color: "var(--signal-deep)", fontWeight: 600 }}>
              open Confirm queue →
            </Link>
          </>
        )}
      </div>

      <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div
          style={{
            flex: "1 1 260px",
            maxWidth: 380,
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "10px 14px",
            borderRadius: 11,
            background: "var(--surface)",
            border: "1px solid var(--hairline)",
          }}
        >
          <SearchIcon />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            style={{ border: "none", background: "none", outline: "none", fontSize: 13, flex: 1, color: "var(--ink)" }}
          />
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFilter(opt.value)}
              style={{
                padding: "8px 15px",
                borderRadius: 999,
                fontSize: 12.5,
                fontWeight: 700,
                border: "none",
                cursor: "pointer",
                background: filter === opt.value ? "var(--band)" : "var(--sand)",
                color: filter === opt.value ? "var(--signal)" : "var(--ink-2)",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 20, maxWidth: 920 }}>
        {people === null ? (
          <p style={{ color: "var(--ink-2)" }}>Loading…</p>
        ) : filtered.length === 0 ? (
          <p style={{ color: "var(--ink-2)" }}>
            {people.length === 0 ? "No one has been confirmed yet." : "No one matches that search."}
          </p>
        ) : (
          <div className="card" style={{ border: "1px solid var(--hairline)", borderRadius: 16, padding: "2px 22px" }}>
            {filtered.map((p) => (
              <Link
                key={p.id}
                to={`/person/${p.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "13px 6px",
                  borderTop: "1px solid var(--hairline)",
                  color: "inherit",
                }}
              >
                <Avatar name={p.full_name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>
                    {p.full_name}
                    {p.id === currentPerson.id && (
                      <span style={{ fontWeight: 600, color: "var(--ink-3)", fontSize: 12 }}> (you)</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                    {metaByPerson.get(p.id) ?? ""}
                  </div>
                </div>
                {(() => {
                  const primary = ROLE_PRIORITY.find((r) => p.roles.includes(r));
                  if (!primary) return null;
                  const isInk = primary === "director" || primary === "instructor";
                  return (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "4px 11px",
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 600,
                        flexShrink: 0,
                        background: isInk ? "var(--band)" : "var(--sand)",
                        color: isInk ? "var(--signal)" : "var(--ink-2)",
                      }}
                    >
                      {ROLE_LABEL[primary]}
                    </span>
                  );
                })()}
                <ChevronIcon />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      style={{ width: 16, height: 16, color: "var(--ink-3)", flexShrink: 0 }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      style={{ width: 15, height: 15, color: "var(--ink-3)", flexShrink: 0 }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}