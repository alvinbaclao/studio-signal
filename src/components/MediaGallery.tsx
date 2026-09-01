export interface MediaPreviewItem {
  id: string;
  caption: string | null;
  kind: string;
}

// Horizontal-scroll gallery of the most recent Media items — reused on
// every destination's Home. `media_item` is real and queried live; it's
// simply empty until there's a Storage bucket and Task 18's upload flow
// (see docs/DEFICIENCIES.md #2). See BUILD_PLAN.md Task 15.
export function MediaGallery({ items, emptyText }: { items: MediaPreviewItem[] | null; emptyText: string }) {
  if (items === null) return <p style={{ fontSize: 13, color: "var(--ink-2)" }}>Loading…</p>;
  if (items.length === 0) return <p style={{ fontSize: 13, color: "var(--ink-2)" }}>{emptyText}</p>;
  return (
    <div style={{ display: "flex", gap: 12, overflowX: "auto", padding: "2px 2px 6px" }}>
      {items.map((item) => (
        <div key={item.id} style={{ flex: "0 0 128px" }}>
          <div style={{ height: 160, borderRadius: 16, background: "var(--sand)", boxShadow: "0 4px 14px -6px rgba(44,32,12,.22)" }} />
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 7 }}>{item.caption ?? item.kind}</div>
        </div>
      ))}
    </div>
  );
}
