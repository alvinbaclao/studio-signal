import type { ReactNode } from "react";

// The dark band holds what needs a person. Nothing pressing ⇒ no band at
// all — renders null with no children, per
// docs/PROJECT_KNOWLEDGE.md's five design rules. Never render an empty band
// shell.
export function Band({ children }: { children?: ReactNode }) {
  return children ? (
    <div className="band" style={{ borderRadius: 18, padding: "20px 24px 22px" }}>
      {children}
    </div>
  ) : null;
}
