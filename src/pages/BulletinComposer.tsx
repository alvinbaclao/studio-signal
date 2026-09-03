import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth, hasRole } from "../lib/AuthProvider";
import { useStudio } from "../lib/useStudio";
import { mediaKindFromMime, studioMediaPath, uploadToStorage } from "../lib/storage";
import { Placeholder } from "./Placeholder";

const MAX_ATTACHMENTS = 4;

interface DestInfo {
  name: string;
  reachText: string;
}

// Ports design-reference/BulletinComposer.dc.html — one shared composer for
// all three Bulletin scopes, pre-scoped to wherever its "+" was tapped (no
// scope picker, unlike the studio-wide broadcast composer). See
// BUILD_PLAN.md Task 17. Attach is real now that a Storage bucket exists
// (docs/DEFICIENCIES.md #2/#28, resolved): each file becomes a real
// media_item, linked to the post via post_media once the post itself is
// created (post_media.post_id is NOT NULL, so media_item rows are made
// first and linked after, not the other way around).
export function BulletinComposer({ kind }: { kind: "team" | "comp_team" | "studio" }) {
  const { id: destinationId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { person } = useAuth();
  const studio = useStudio();
  const isDirector = hasRole(person, "director");
  const isInstructor = hasRole(person, "instructor");

  const [dest, setDest] = useState<DestInfo | null>(null);
  const [canPost, setCanPost] = useState<boolean | null>(null);
  const [body, setBody] = useState("");
  const [important, setImportant] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!person || !studio) return;
    async function load() {
      if (kind === "team") {
        const [{ data: team }, { data: teachRows }, { count: memberCount }] = await Promise.all([
          supabase.from("team").select("name").eq("id", destinationId!).single(),
          supabase.from("team_member").select("person_id").eq("team_id", destinationId!).eq("person_id", person!.id).eq("role", "instructor").maybeSingle(),
          supabase.from("team_member").select("person_id", { count: "exact", head: true }).eq("team_id", destinationId!),
        ]);
        if (!team) return;
        setDest({ name: team.name, reachText: `Reaches ${memberCount ?? 0} ${memberCount === 1 ? "person" : "people"} on this Team` });
        setCanPost(isDirector || !!teachRows);
      } else if (kind === "comp_team") {
        const [{ data: compTeam }, { data: choreoRow }] = await Promise.all([
          supabase.from("comp_team").select("name").eq("id", destinationId!).single(),
          supabase.from("comp_team_cast").select("person_id").eq("comp_team_id", destinationId!).eq("person_id", person!.id).eq("role", "choreographer").maybeSingle(),
        ]);
        if (!compTeam) return;
        setDest({ name: compTeam.name, reachText: "Reaches everyone cast on this Comp Team" });
        setCanPost(isDirector || !!choreoRow);
      } else {
        setDest({ name: "Studio", reachText: `Reaches everyone at ${studio!.name}` });
        setCanPost(isDirector || isInstructor);
      }
    }
    load();
  }, [kind, destinationId, person, studio, isDirector, isInstructor]);

  async function submit() {
    if (!person || !body.trim()) return;
    setSubmitting(true);
    setError(null);

    const mediaItemIds: string[] = [];
    for (const file of attachments) {
      const path = studioMediaPath(person.studio_id, "media", null, file);
      const { error: uploadErr } = await uploadToStorage(path, file);
      if (uploadErr) {
        setError(`Something went wrong uploading "${file.name}" — try again.`);
        setSubmitting(false);
        return;
      }
      const { data: mediaRow, error: mediaErr } = await supabase
        .from("media_item")
        .insert({
          studio_id: person.studio_id,
          team_id: kind === "team" ? destinationId : null,
          comp_team_id: kind === "comp_team" ? destinationId : null,
          kind: mediaKindFromMime(file.type),
          processing_status: "ready",
          storage_path: path,
          file_name: file.name,
          byte_size: file.size,
          uploaded_by: person.id,
        })
        .select("id")
        .single();
      if (mediaErr || !mediaRow) {
        setError(`"${file.name}" uploaded, but couldn't be attached — try again.`);
        setSubmitting(false);
        return;
      }
      mediaItemIds.push(mediaRow.id);
    }

    const { data: season } = await supabase.from("season").select("id").eq("studio_id", person.studio_id).eq("is_current", true).single();
    const { data: postRow, error: insertErr } = await supabase
      .from("post")
      .insert({
        studio_id: person.studio_id,
        author_id: person.id,
        season_id: season!.id,
        scope: kind,
        team_id: kind === "team" ? destinationId : null,
        comp_team_id: kind === "comp_team" ? destinationId : null,
        important,
        body: body.trim(),
      })
      .select("id")
      .single();
    if (insertErr || !postRow) {
      setSubmitting(false);
      setError("Something went wrong posting this — try again.");
      return;
    }

    if (mediaItemIds.length > 0) {
      const { error: linkErr } = await supabase
        .from("post_media")
        .insert(mediaItemIds.map((mediaItemId, i) => ({ post_id: postRow.id, media_item_id: mediaItemId, sort_order: i })));
      if (linkErr) {
        setSubmitting(false);
        setError("Posted, but attaching the media failed — the post is up without it.");
        return;
      }
    }

    setSubmitting(false);
    navigate(-1);
  }

  if (canPost === false) return <Placeholder title="Post to Bulletin" />;
  if (!person || !dest || canPost === null) return null;

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ padding: "16px 20px 14px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid var(--hairline)" }}>
        <div role="button" onClick={() => navigate(-1)} style={{ cursor: "pointer", color: "var(--ink-2)" }}>
          <CloseIcon />
        </div>
        <div className="font-display" style={{ fontWeight: 700, fontSize: 16 }}>
          New post
        </div>
      </div>

      <div style={{ padding: "20px 20px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: 12, background: "var(--band)", color: "var(--band-ink)" }}>
          <DestIcon />
          <div style={{ fontSize: 12.5, fontWeight: 700 }}>Posting to {dest.name} · Bulletin</div>
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 8 }}>{dest.reachText}.</div>

        <div style={{ marginTop: 22 }}>
          <Eyebrow>Message</Eyebrow>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your update…"
            rows={5}
            style={{ width: "100%", marginTop: 10, background: "var(--sand)", border: "none", borderRadius: 12, padding: 14, fontSize: 13.5, color: "var(--ink)", lineHeight: 1.6, fontFamily: "inherit", resize: "vertical" }}
          />
        </div>

        <label
          style={{
            marginTop: 16,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 14px",
            borderRadius: 12,
            background: "var(--sand)",
            color: "var(--ink-2)",
            fontSize: 11.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <input
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={(e) => setAttachments(Array.from(e.target.files ?? []).slice(0, MAX_ATTACHMENTS))}
            style={{ display: "none" }}
          />
          {attachments.length > 0 ? `${attachments.length} file${attachments.length === 1 ? "" : "s"} attached — ${attachments.map((f) => f.name).join(", ")}` : `Attach a photo or video — arrives with the Media library.`}
        </label>

        <div style={{ marginTop: 14 }}>
          <div className="card" style={{ border: "1px solid var(--hairline)", borderRadius: 16 }}>
            <div
              role="button"
              onClick={() => setImportant((v) => !v)}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", cursor: "pointer" }}
            >
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>Mark Important</div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2, maxWidth: 250, lineHeight: 1.4 }}>
                  Pushes a notification instead of just a feed badge — save it for things people need to see today.
                </div>
              </div>
              <div style={{ width: 38, height: 22, borderRadius: 999, background: important ? "var(--signal)" : "var(--hairline)", position: "relative", flexShrink: 0 }}>
                <div style={{ position: "absolute", top: 2, left: important ? 18 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.25)", transition: "left 120ms ease" }} />
              </div>
            </div>
          </div>
        </div>

        {error && <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--busy)" }}>{error}</div>}

        <div style={{ marginTop: 26 }}>
          <button
            type="button"
            onClick={submit}
            disabled={!body.trim() || submitting}
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
              opacity: !body.trim() || submitting ? 0.6 : 1,
              cursor: !body.trim() || submitting ? "default" : "pointer",
            }}
          >
            {submitting ? "Posting…" : `Post to ${dest.name}`}
          </button>
          <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 10, textAlign: "center" }}>
            Posted as {person.full_name} · appears in {dest.name} › Bulletin right after posting
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
