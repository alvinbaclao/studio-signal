import { useState } from "react";

export interface ReactionSummary {
  emoji: string;
  /** Everyone who reacted with this emoji — reactions are per-person
   *  visible, never an aggregate-only count (see PROJECT_KNOWLEDGE.md's
   *  Bulletin section). */
  people: { id: string; name: string }[];
  reactedByMe: boolean;
}

// A row of small tap targets (single emoji/ack) used on every Bulletin
// post. Tapping the emoji toggles your own reaction; tapping the count
// reveals who reacted, since reactions are per-person visible, not an
// aggregate number.
export function ReactionBar({
  reactions,
  onToggle,
}: {
  reactions: ReactionSummary[];
  onToggle?: (emoji: string) => void;
}) {
  const [openEmoji, setOpenEmoji] = useState<string | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {reactions.map((r) => (
          <div
            key={r.emoji}
            title={r.people.map((p) => p.name).join(", ")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 2,
              padding: "3px 4px 3px 10px",
              borderRadius: 999,
              background: r.reactedByMe ? "var(--ink)" : "var(--sand)",
              color: r.reactedByMe ? "var(--paper)" : "var(--ink)",
              fontSize: 13,
            }}
          >
            <button
              type="button"
              onClick={() => onToggle?.(r.emoji)}
              style={{
                border: "none",
                background: "none",
                padding: "2px 4px 2px 0",
                font: "inherit",
                color: "inherit",
                cursor: "pointer",
              }}
            >
              {r.emoji}
            </button>
            <button
              type="button"
              onClick={() => setOpenEmoji(openEmoji === r.emoji ? null : r.emoji)}
              style={{
                border: "none",
                background: "none",
                padding: "2px 8px 2px 2px",
                borderRadius: 999,
                font: "inherit",
                color: "inherit",
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
                cursor: "pointer",
              }}
            >
              {r.people.length}
            </button>
          </div>
        ))}
      </div>

      {openEmoji &&
        (() => {
          const r = reactions.find((x) => x.emoji === openEmoji);
          if (!r || r.people.length === 0) return null;
          return (
            <div style={{ fontSize: 12, color: "var(--ink-2)" }}>
              {r.emoji} {r.people.map((p) => p.name).join(", ")}
            </div>
          );
        })()}
    </div>
  );
}
