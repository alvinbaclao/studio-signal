import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth, hasRole } from "../lib/AuthProvider";

export interface EssentialRow {
  id: string;
  title: string;
  details: string | null;
  item_type: string;
  link_url: string | null;
  file_media_id: string | null;
  archived_at: string | null;
}

type Scope = "studio" | "team" | "comp_team";

// Shared Essentials reader — one structured, ordered (`sort_order`) list
// reused across Studio/Team/Comp Team. Archived items are hidden from
// everyone but the Director, who sees them separately, marked archived —
// never hard-deleted. See BUILD_PLAN.md Task 19.
//
// Reordering ("drag to reorder, same as the roster and Teams lists") isn't
// built — no drag-and-drop exists anywhere else in this codebase to
// reuse, and Task 19's own Verify step doesn't test it; sort_order is
// real and respected (new items append to the end), just not
// interactively editable yet. See docs/DEFICIENCIES.md.
export function EssentialsList({
  scope,
  destinationId,
  canAdd,
  addLink,
  addNote,
}: {
  scope: Scope;
  destinationId: string | null;
  canAdd: boolean;
  addLink: string;
  addNote: string;
}) {
  const { person } = useAuth();
  const isDirector = hasRole(person, "director");
  const [items, setItems] = useState<EssentialRow[] | null>(null);
  const [archived, setArchived] = useState<EssentialRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!person) return;
    let cancelled = false;
    async function load() {
      let q = supabase.from("essentials_item").select("id, title, details, item_type, link_url, file_media_id, archived_at").eq("scope", scope);
      if (scope === "team") q = q.eq("team_id", destinationId!);
      else if (scope === "comp_team") q = q.eq("comp_team_id", destinationId!);
      else q = q.is("team_id", null).is("comp_team_id", null);

      const { data: activeRows } = await q.is("archived_at", null).order("sort_order");
      if (cancelled) return;
      setItems(activeRows ?? []);

      if (isDirector) {
        let qa = supabase.from("essentials_item").select("id, title, details, item_type, link_url, file_media_id, archived_at").eq("scope", scope);
        if (scope === "team") qa = qa.eq("team_id", destinationId!);
        else if (scope === "comp_team") qa = qa.eq("comp_team_id", destinationId!);
        else qa = qa.is("team_id", null).is("comp_team_id", null);
        const { data: archivedRows } = await qa.not("archived_at", "is", null).order("archived_at", { ascending: false });
        if (!cancelled) setArchived(archivedRows ?? []);
      } else {
        setArchived([]);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [person, isDirector, scope, destinationId, reloadKey]);

  async function toggleArchive(item: EssentialRow) {
    setBusyId(item.id);
    await supabase
      .from("essentials_item")
      .update({ archived_at: item.archived_at ? null : new Date().toISOString() })
      .eq("id", item.id);
    setBusyId(null);
    setReloadKey((k) => k + 1);
  }

  if (!person) return null;

  return (
    <div style={{ padding: "18px 20px 40px", maxWidth: 620 }}>
      {items === null ? (
        <p style={{ fontSize: 13, color: "var(--ink-2)" }}>Loading…</p>
      ) : items.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--ink-2)" }}>Nothing posted yet.</p>
      ) : (
        <div className="card" style={{ border: "1px solid var(--hairline)", borderRadius: 16, padding: "2px 16px" }}>
          {items.map((item, i) => (
            <EssentialRowView
              key={item.id}
              item={item}
              first={i === 0}
              isDirector={isDirector}
              busy={busyId === item.id}
              onToggleArchive={() => toggleArchive(item)}
            />
          ))}
        </div>
      )}

      {canAdd && (
        <div style={{ marginTop: 20 }}>
          <Link
            to={addLink}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              padding: "13px 16px",
              borderRadius: 12,
              border: "1.5px dashed var(--hairline)",
              color: "var(--ink-3)",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <PlusIcon />
            Add an item
            <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--ink-3)", fontWeight: 600, background: "var(--sand)", padding: "3px 8px", borderRadius: 8 }}>
              {addNote}
            </span>
          </Link>
        </div>
      )}

      {isDirector && archived !== null && archived.length > 0 && (
        <div style={{ marginTop: 26 }}>
          <Eyebrow>Archived · Director only</Eyebrow>
          <div className="card" style={{ marginTop: 10, border: "1px solid var(--hairline)", borderRadius: 16, padding: "2px 16px", opacity: 0.75 }}>
            {archived.map((item, i) => (
              <EssentialRowView key={item.id} item={item} first={i === 0} isDirector={isDirector} busy={busyId === item.id} onToggleArchive={() => toggleArchive(item)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EssentialRowView({
  item,
  first,
  isDirector,
  busy,
  onToggleArchive,
}: {
  item: EssentialRow;
  first: boolean;
  isDirector: boolean;
  busy: boolean;
  onToggleArchive: () => void;
}) {
  const content = (
    <>
      <div className="itemicon" style={{ width: 38, height: 38, borderRadius: 10, background: "var(--sand)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <ItemTypeIcon type={item.item_type} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>
          {item.title}
          {item.archived_at && <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 700, color: "var(--busy)" }}>ARCHIVED</span>}
        </div>
        {item.details && <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 3, lineHeight: 1.5 }}>{item.details}</div>}
        {attachTag(item) && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 999, background: "var(--sand)", color: "var(--ink-2)", fontSize: 10.5, fontWeight: 700, marginTop: 6 }}>
            {attachTag(item)}
          </span>
        )}
      </div>
    </>
  );

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "15px 0", borderTop: first ? "none" : "1px solid var(--hairline)" }}>
      {item.link_url ? (
        <a href={item.link_url} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "flex-start", gap: 12, flex: 1, minWidth: 0, color: "inherit" }}>
          {content}
        </a>
      ) : (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flex: 1, minWidth: 0 }}>{content}</div>
      )}
      {isDirector && (
        <button
          type="button"
          onClick={onToggleArchive}
          disabled={busy}
          style={{ fontSize: 11, fontWeight: 700, color: "var(--signal-deep)", background: "none", border: "none", cursor: "pointer", marginTop: 12, flexShrink: 0 }}
        >
          {item.archived_at ? "Unarchive" : "Archive"}
        </button>
      )}
    </div>
  );
}

function attachTag(item: EssentialRow): string | null {
  if (item.file_media_id) {
    if (item.item_type === "audio") return "🎵 Audio attached";
    return "📎 File attached";
  }
  if (item.link_url) return "🔗 Link";
  return null;
}

function ItemTypeIcon({ type }: { type: string }) {
  const style = { width: 18, height: 18, color: "var(--ink-2)" };
  if (type === "link") {
    return (
      <svg style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
      </svg>
    );
  }
  if (type === "audio") {
    return (
      <svg style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    );
  }
  if (type === "note") {
    return (
      <svg style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
        <path d="M4 6h16M4 12h16M4 18h10" />
      </svg>
    );
  }
  return (
    <svg style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg style={{ width: 16, height: 16 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "var(--font-display)", fontSize: 10.5, letterSpacing: "0.11em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>
      {children}
    </div>
  );
}
