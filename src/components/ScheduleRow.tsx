import type { ReactNode } from "react";

// Hairline-separated row, time large on the left, never a stack of cards.
// One pattern, reused everywhere: the global Schedule tab, every
// destination's own Schedule tab, both home screens' "This week", the
// Director's Today & this week. See docs/PROJECT_KNOWLEDGE.md's five rules.
//
// `time` is a pre-formatted string ("4:30p", "8:15a" — see the "Thursday
// 27 Aug" / meridiem-smaller convention) so this component stays a pure
// presentational row regardless of where the time came from or which
// timezone formatted it.
export function ScheduleRow({
  time,
  title,
  subtitle,
  dotColor = "var(--ink-3)",
  trailing,
  onClick,
}: {
  time: string;
  title: string;
  subtitle?: string;
  dotColor?: string;
  trailing?: ReactNode;
  onClick?: () => void;
}) {
  const { main, meridiem } = splitMeridiem(time);
  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      onClick={onClick}
      className="hairline"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "14px 0",
        width: "100%",
        background: "none",
        border: "none",
        borderBottom: "1px solid var(--hairline)",
        textAlign: "left",
        cursor: onClick ? "pointer" : "default",
        font: "inherit",
        color: "inherit",
      }}
    >
      <span
        className="font-display"
        style={{
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          fontSize: 26,
          width: 84,
          flexShrink: 0,
        }}
      >
        {main}
        <span style={{ fontSize: 16 }}>{meridiem}</span>
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14.5, fontWeight: 600 }}>
          {title}
        </span>
        {subtitle && (
          <span
            style={{
              display: "block",
              fontSize: 12.5,
              color: "var(--ink-2)",
              marginTop: 2,
            }}
          >
            {subtitle}
          </span>
        )}
      </span>
      {trailing ?? (
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: dotColor,
            flexShrink: 0,
          }}
        />
      )}
    </Tag>
  );
}

function splitMeridiem(time: string): { main: string; meridiem: string } {
  const match = time.match(/^(.*?)([ap])$/i);
  if (!match) return { main: time, meridiem: "" };
  return { main: match[1], meridiem: match[2] };
}
