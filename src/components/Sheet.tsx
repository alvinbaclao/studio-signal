import type { ReactNode } from "react";

// Shared shell for the bottom-sheet pickers (EventScopePicker, EventTypePicker,
// LocationPicker.dc.html all share this exact shape: backdrop, drag handle,
// header, scrollable list, sticky "Done" footer). First used by Task 12 — see
// BUILD_PLAN.md.
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  onDone?: () => void;
}) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(28,23,20,.4)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          maxHeight: "85%",
          background: "var(--paper)",
          borderRadius: "22px 22px 0 0",
          boxShadow: "0 -8px 30px -12px rgba(44,32,12,.28)",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 10 }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: "var(--hairline)" }} />
        </div>

        <div style={{ padding: "12px 20px 0" }}>
          <h2 className="font-display" style={{ fontSize: 17 }}>
            {title}
          </h2>
          {subtitle && (
            <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 4 }}>{subtitle}</div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 20px", marginTop: 14 }}>{children}</div>

        <div style={{ padding: "12px 20px 24px", borderTop: "1px solid var(--hairline)" }}>
          <div
            role="button"
            onClick={onDone ?? onClose}
            style={{
              background: "var(--band)",
              color: "var(--signal)",
              textAlign: "center",
              padding: 14,
              borderRadius: 13,
              fontWeight: 700,
              fontSize: 13.5,
              cursor: "pointer",
            }}
          >
            Done
          </div>
        </div>
      </div>
    </div>
  );
}
