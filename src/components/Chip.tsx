// Rest --sand/--ink-2; selected --ink/--paper. Renders a <button> when
// onClick is given (a filter/selection chip), otherwise a plain <span> (a
// label chip, e.g. a role tag on a roster row).
export function Chip({
  label,
  selected = false,
  onClick,
}: {
  label: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  const style = {
    display: "inline-flex",
    alignItems: "center",
    padding: "5px 12px",
    borderRadius: 999,
    background: selected ? "var(--ink)" : "var(--sand)",
    color: selected ? "var(--paper)" : "var(--ink-2)",
    fontSize: 12,
    fontWeight: 600,
    border: "none",
    fontFamily: "inherit",
  } as const;

  if (onClick) {
    return (
      <button type="button" onClick={onClick} style={{ ...style, cursor: "pointer" }}>
        {label}
      </button>
    );
  }

  return <span style={style}>{label}</span>;
}
