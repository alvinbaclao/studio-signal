// --sand with --ink-2 initials, or a photo. No per-person colour. Inside the
// band, use tone="band" — --band-card with --band-ink, per
// docs/PROJECT_KNOWLEDGE.md's design system.
export function Avatar({
  name,
  photoUrl,
  size = 34,
  tone = "default",
}: {
  name: string;
  photoUrl?: string;
  size?: number;
  tone?: "default" | "band";
}) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: tone === "band" ? "#3a322d" : "var(--sand)",
        color: tone === "band" ? "var(--band-ink)" : "var(--ink-2)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: Math.round(size * 0.35),
        flexShrink: 0,
      }}
    >
      {initials(name)}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
