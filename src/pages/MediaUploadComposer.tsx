import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth, hasRole } from "../lib/AuthProvider";
import { useStudio } from "../lib/useStudio";
import { mediaKindFromMime, studioMediaPath, uploadToStorage } from "../lib/storage";
import { Placeholder } from "./Placeholder";

const MAX_FILES = 10;

// Ports design-reference/MediaUpload.dc.html — one shared composer,
// pre-scoped to wherever its "+" was tapped, same pattern as
// BulletinComposer. See BUILD_PLAN.md Task 18. Now that a real Storage
// bucket exists (docs/DEFICIENCIES.md #2, resolved), this uploads for
// real — up to 10 files, straight through, no client-side video
// compression (that's a real, separate undertaking the artboard implied
// but nothing in this build ever needed for it to be honestly useful;
// revisit only if upload sizes turn out to be a real problem).
export function MediaUploadComposer({ kind }: { kind: "team" | "comp_team" | "studio" }) {
  const { id: destinationId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { person } = useAuth();
  const studio = useStudio();
  const isDirector = hasRole(person, "director");
  const isInstructor = hasRole(person, "instructor");

  const [destName, setDestName] = useState<string | null>(null);
  const [canUpload, setCanUpload] = useState<boolean | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
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
        setCanUpload(isDirector || !!teachRow);
      } else if (kind === "comp_team") {
        const [{ data: compTeam }, { data: choreoRow }] = await Promise.all([
          supabase.from("comp_team").select("name").eq("id", destinationId!).single(),
          supabase.from("comp_team_cast").select("person_id").eq("comp_team_id", destinationId!).eq("person_id", person!.id).eq("role", "choreographer").maybeSingle(),
        ]);
        setDestName(compTeam?.name ?? null);
        setCanUpload(isDirector || !!choreoRow);
      } else {
        setDestName("Studio");
        setCanUpload(isDirector);
      }
    }
    load();
  }, [kind, destinationId, person, studio, isDirector, isInstructor]);

  const onFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []).slice(0, MAX_FILES);
    setFiles(picked);
    setError(null);
  };

  const upload = async () => {
    if (!person || files.length === 0) return;
    setUploading(true);
    setError(null);
    for (const file of files) {
      const path = studioMediaPath(person.studio_id, "media", null, file);
      const { error: uploadErr } = await uploadToStorage(path, file);
      if (uploadErr) {
        setError(`Something went wrong uploading "${file.name}" — try again.`);
        setUploading(false);
        return;
      }
      const { error: insertErr } = await supabase.from("media_item").insert({
        studio_id: person.studio_id,
        team_id: kind === "team" ? destinationId : null,
        comp_team_id: kind === "comp_team" ? destinationId : null,
        kind: mediaKindFromMime(file.type),
        processing_status: "ready",
        storage_path: path,
        file_name: file.name,
        byte_size: file.size,
        uploaded_by: person.id,
      });
      if (insertErr) {
        setError(`"${file.name}" uploaded, but saving it to ${destName} · Media failed — try again.`);
        setUploading(false);
        return;
      }
    }
    setUploading(false);
    navigate(-1);
  };

  if (canUpload === false) return <Placeholder title="Upload Media" />;
  if (!person || !destName || canUpload === null) return null;

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ padding: "16px 20px 14px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid var(--hairline)" }}>
        <div role="button" onClick={() => navigate(-1)} style={{ cursor: "pointer", color: "var(--ink-2)" }}>
          <CloseIcon />
        </div>
        <div className="font-display" style={{ fontWeight: 700, fontSize: 16 }}>
          Add media
        </div>
      </div>

      <div style={{ padding: "20px 20px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: 12, background: "var(--band)", color: "var(--band-ink)" }}>
          <DestIcon />
          <div style={{ fontSize: 12.5, fontWeight: 700 }}>Adding to {destName} · Media</div>
        </div>

        <label
          style={{
            marginTop: 22,
            border: "1.5px dashed var(--hairline)",
            borderRadius: 16,
            padding: "34px 20px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
            textAlign: "center",
            cursor: "pointer",
          }}
        >
          <input type="file" accept="image/*,video/*,audio/*" multiple onChange={onFilesSelected} style={{ display: "none" }} />
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--sand)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <UploadIcon />
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>
            {files.length > 0 ? `${files.length} file${files.length === 1 ? "" : "s"} selected` : "Choose photos, video, or audio"}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.5, maxWidth: 280 }}>
            {files.length > 0 ? files.map((f) => f.name).join(", ") : `Up to ${MAX_FILES} files at once.`}
          </div>
        </label>

        {error && <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--busy)" }}>{error}</div>}

        <div style={{ marginTop: 22 }}>
          <button
            type="button"
            onClick={upload}
            disabled={files.length === 0 || uploading}
            style={{
              width: "100%",
              padding: "15px 20px",
              borderRadius: 12,
              background: "var(--signal)",
              color: "var(--signal-ink)",
              fontSize: 14.5,
              fontWeight: 700,
              border: "none",
              opacity: files.length === 0 || uploading ? 0.6 : 1,
              cursor: files.length === 0 || uploading ? "default" : "pointer",
            }}
          >
            {uploading ? "Uploading…" : `Upload to ${destName}`}
          </button>
        </div>
      </div>
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

function UploadIcon() {
  return (
    <svg style={{ width: 20, height: 20, color: "var(--ink-2)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <path d="M4 7h3l2-3h6l2 3h3v13H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
