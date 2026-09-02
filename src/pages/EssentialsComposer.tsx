import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth, hasRole } from "../lib/AuthProvider";
import { useStudio } from "../lib/useStudio";
import { Placeholder } from "./Placeholder";

type ItemType = "document" | "link" | "audio" | "note";

const TYPE_OPTIONS: { value: ItemType; label: string }[] = [
  { value: "document", label: "Document" },
  { value: "link", label: "Link" },
  { value: "audio", label: "Audio" },
  { value: "note", label: "Note" },
];

// Ports design-reference/EssentialsComposer.dc.html — one shared composer,
// pre-scoped, same pattern as BulletinComposer/MediaUploadComposer. Every
// item type accepts a link_url as its "content" (confirmed live against
// the essentials_item_has_its_content check constraint: a Document or
// Audio item is just as satisfied by a pasted link as by an attached
// file) — so unlike MediaUploadComposer, this stays fully functional
// without a Storage bucket. File attachment specifically isn't available
// (same gap as Task 18); pasting a link is. See BUILD_PLAN.md Task 19 and
// docs/DEFICIENCIES.md.
export function EssentialsComposer({ kind }: { kind: "team" | "comp_team" | "studio" }) {
  const { id: destinationId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { person } = useAuth();
  const studio = useStudio();
  const isDirector = hasRole(person, "director");
  const isInstructor = hasRole(person, "instructor");

  const [destName, setDestName] = useState<string | null>(null);
  const [canAdd, setCanAdd] = useState<boolean | null>(null);
  const [itemType, setItemType] = useState<ItemType>("document");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!person || !studio) return;
    async function load() {
      if (kind === "team") {
        const [{ data: team }, { data: teachRow }] = await Promise.all([
          supabase.from("team").select("name").eq("id", destinationId!).single(),
          supabase.from("team_member").select("person_id").eq("team_id", destinationId!).eq("person_id", person!.id).eq("role", "instructor").maybeSingle(),
        ]);
        setDestName(team?.name ?? null);
        setCanAdd(isDirector || !!teachRow);
      } else if (kind === "comp_team") {
        const [{ data: compTeam }, { data: choreoRow }] = await Promise.all([
          supabase.from("comp_team").select("name").eq("id", destinationId!).single(),
          supabase.from("comp_team_cast").select("person_id").eq("comp_team_id", destinationId!).eq("person_id", person!.id).eq("role", "choreographer").maybeSingle(),
        ]);
        setDestName(compTeam?.name ?? null);
        setCanAdd(isDirector || !!choreoRow);
      } else {
        setDestName("Studio");
        setCanAdd(isDirector || isInstructor);
      }
    }
    load();
  }, [kind, destinationId, person, studio, isDirector, isInstructor]);

  async function submit() {
    if (!person || !title.trim()) return;
    setSubmitting(true);
    setError(null);
    const { data: season } = await supabase.from("season").select("id").eq("studio_id", person.studio_id).eq("is_current", true).single();

    let q = supabase.from("essentials_item").select("sort_order").eq("scope", kind);
    if (kind === "team") q = q.eq("team_id", destinationId!);
    else if (kind === "comp_team") q = q.eq("comp_team_id", destinationId!);
    else q = q.is("team_id", null).is("comp_team_id", null);
    const { data: maxRow } = await q.order("sort_order", { ascending: false }).limit(1).maybeSingle();
    const nextSortOrder = (maxRow?.sort_order ?? -1) + 1;

    const { error: insertErr } = await supabase.from("essentials_item").insert({
      studio_id: person.studio_id,
      season_id: season!.id,
      created_by: person.id,
      scope: kind,
      team_id: kind === "team" ? destinationId : null,
      comp_team_id: kind === "comp_team" ? destinationId : null,
      item_type: itemType,
      title: title.trim(),
      details: details.trim() || null,
      link_url: linkUrl.trim() || null,
      sort_order: nextSortOrder,
    });
    setSubmitting(false);
    if (insertErr) {
      setError(
        insertErr.code === "23514"
          ? "A Document, Link, or Audio item needs a link before it can be saved — add one, or switch this to a Note."
          : "Something went wrong saving this — try again."
      );
      return;
    }
    navigate(-1);
  }

  if (canAdd === false) return <Placeholder title="Add to Essentials" />;
  if (!person || !destName || canAdd === null) return null;

  const canSubmit = title.trim().length > 0 && !submitting;

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ padding: "16px 20px 14px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid var(--hairline)" }}>
        <div role="button" onClick={() => navigate(-1)} style={{ cursor: "pointer", color: "var(--ink-2)" }}>
          <CloseIcon />
        </div>
        <div className="font-display" style={{ fontWeight: 700, fontSize: 16 }}>
          Add an item
        </div>
      </div>

      <div style={{ padding: "20px 20px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: 12, background: "var(--band)", color: "var(--band-ink)" }}>
          <DestIcon />
          <div style={{ fontSize: 12.5, fontWeight: 700 }}>Adding to {destName} · Essentials</div>
        </div>
        {kind !== "studio" && (
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 8 }}>
            Studio-wide items (fees, general dress code) belong on Studio's own Essentials instead — this stays specific to {destName}.
          </div>
        )}

        <div style={{ marginTop: 22 }}>
          <Eyebrow>Item type</Eyebrow>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setItemType(opt.value)}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 7,
                  padding: "14px 8px",
                  borderRadius: 13,
                  background: itemType === opt.value ? "var(--band)" : "var(--sand)",
                  color: itemType === opt.value ? "var(--signal)" : "var(--ink-2)",
                  border: "none",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                <TypeIcon type={opt.value} />
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 22 }}>
          <Label>Title</Label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Jazz II Recital Costume"
            style={fieldInputStyle}
          />
        </div>

        <div style={{ marginTop: 18 }}>
          <Label>Details</Label>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Where to order, sizing notes, the alterations deadline…"
            rows={4}
            style={{ ...fieldInputStyle, resize: "vertical", fontFamily: "inherit" }}
          />
        </div>

        <div style={{ marginTop: 18 }}>
          <Label>
            Link <span style={{ fontWeight: 500, color: "var(--ink-3)" }}>(optional)</span>
          </Label>
          <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" style={fieldInputStyle} />
          <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 7, lineHeight: 1.4 }}>
            File attachment isn't set up yet for this studio (no Storage bucket) — a pasted link works for every item type,
            including Document and Audio.
          </div>
        </div>

        {error && <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--busy)" }}>{error}</div>}

        <div style={{ marginTop: 26 }}>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "15px 20px",
              borderRadius: 12,
              background: "var(--signal)",
              color: "var(--signal-ink)",
              fontSize: 14.5,
              fontWeight: 700,
              border: "none",
              opacity: canSubmit ? 1 : 0.6,
              cursor: canSubmit ? "pointer" : "default",
            }}
          >
            {submitting ? "Saving…" : `Add to ${destName}`}
          </button>
          <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 10, textAlign: "center" }}>
            Added by {person.full_name} · visible in {destName} › Essentials right after
          </div>
        </div>
      </div>
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "var(--font-display)", fontSize: 10.5, letterSpacing: "0.11em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-2)", marginBottom: 7, display: "block" }}>{children}</span>;
}

const fieldInputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--sand)",
  border: "none",
  borderRadius: 12,
  padding: "12px 15px",
  fontSize: 13.5,
  color: "var(--ink)",
};

function CloseIcon() {
  return (
    <svg style={{ width: 18, height: 18 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function DestIcon() {
  return (
    <svg style={{ width: 16, height: 16, color: "var(--signal)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <path d="M4 21V9l8-6 8 6v12" />
      <path d="M9 21v-7h6v7" />
    </svg>
  );
}

function TypeIcon({ type }: { type: ItemType }) {
  const style = { width: 18, height: 18 };
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
