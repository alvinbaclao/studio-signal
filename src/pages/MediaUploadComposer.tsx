import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth, hasRole } from "../lib/AuthProvider";
import { useStudio } from "../lib/useStudio";
import { Placeholder } from "./Placeholder";

// Ports design-reference/MediaUpload.dc.html — one shared composer,
// pre-scoped to wherever its "+" was tapped, same pattern as
// BulletinComposer. Unlike Bulletin's composer (where only the attach
// sub-control was blocked), this ENTIRE screen's purpose is uploading a
// file, and there is no Supabase Storage bucket for this studio — so
// rather than build a picker/compression/upload pipeline that can never
// actually complete (client-side compression + a duration/size cap is
// real, buildable logic, but it has nowhere to upload TO), this stays an
// honest, destination-scoped explanation. See BUILD_PLAN.md Task 18 and
// docs/DEFICIENCIES.md #2 and friends.
export function MediaUploadComposer({ kind }: { kind: "team" | "comp_team" | "studio" }) {
  const { id: destinationId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { person } = useAuth();
  const studio = useStudio();
  const isDirector = hasRole(person, "director");
  const isInstructor = hasRole(person, "instructor");

  const [destName, setDestName] = useState<string | null>(null);
  const [canUpload, setCanUpload] = useState<boolean | null>(null);

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

        <div style={{ marginTop: 22, border: "1.5px dashed var(--hairline)", borderRadius: 16, padding: "34px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--sand)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <UploadIcon />
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>Photo and video upload isn't set up yet</div>
          <div style={{ fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.5, maxWidth: 280 }}>
            This studio doesn't have a Storage bucket configured, so there's nowhere for a photo or video to go yet.
            Once one exists, this screen picks up to 10 files from your camera roll, compresses video client-side, and
            uploads straight to {destName} · Media.
          </div>
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
