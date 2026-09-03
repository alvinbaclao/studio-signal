import { useState } from "react";

export interface ReactionSummary {
  emoji: string;
  /** Everyone who reacted with this emoji — reactions are per-person
   *  visible, never an aggregate-only count (see PROJECT_KNOWLEDGE.md's
   *  Bulletin section). */
  people: { id: string; name: string }[];
  reactedByMe: boolean;
}

// Small, fixed reaction set (deficiency #29) — `reaction.kind` is free
// text with no enum behind it, so this list is a UI choice, not a schema
// constraint. `reaction`'s own primary key is (post_id, person_id), so a
// person can only ever have one reaction per post — picking a new emoji
// switches it (an upsert on that same row) rather than adding a second.
const CANDIDATE_EMOJI = ["👍", "❤️", "🎉", "👏"];

// A row of small tap targets used on every Bulletin post, plus a "+"
// picker for choosing (or switching) your own reaction. Tapping an
// existing chip you already reacted with removes it; tapping any other
// emoji (an existing chip or one from the picker) sets/switches your
// reaction to it. Tapping a chip's count reveals who reacted, since
// reactions are per-person visible, not an aggregate number.
export function ReactionBar({
  reactions,
  onToggle,
}: {
  reactions: ReactionSummary[];
  onToggle?: (emoji: string) => void;
}) {
  const [openEmoji, setOpenEmoji] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const myEmoji = reactions.find((r) => r.reactedByMe)?.emoji ?? null;

  const pick = (emoji: string) => {
    onToggle?.(emoji);
    setPickerOpen(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
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
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          aria-label="Add a reaction"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 26,
            height: 26,
            borderRadius: "50%",
            border: "1.5px dashed var(--hairline)",
            background: "none",
            color: "var(--ink-3)",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          +
        </button>
      </div>

      {pickerOpen && (
        <div style={{ display: "flex", gap: 6 }}>
          {CANDIDATE_EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => pick(emoji)}
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                border: "none",
                background: emoji === myEmoji ? "var(--ink)" : "var(--sand)",
                fontSize: 15,
                cursor: "pointer",
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

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
