import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase, callApp } from "../lib/supabase";
import { useAuth, hasRole } from "../lib/AuthProvider";
import { useStudio } from "../lib/useStudio";
import { formatTimeInZone } from "../lib/format";
import { Avatar } from "../components/Avatar";
import { mediaKindFromMime, studioMediaPath, uploadToStorage, useSignedUrl } from "../lib/storage";
import type { Database } from "../lib/database.types";

type CompTeamType = Database["public"]["Enums"]["comp_team_type"];
type MediaKind = Database["public"]["Enums"]["media_kind"];

const TYPE_LABEL: Record<CompTeamType, string> = {
  solo: "Solo",
  duo: "Duo",
  trio: "Trio",
  small_group: "Small Group",
  large_group: "Large Group",
  production: "Production",
};

interface CompetitionInfo {
  id: string;
  name: string;
  venue_name: string | null;
  venue_address: string | null;
  starts_on: string;
  registration_note: string | null;
  created_by_name: string | null;
}

interface EntryRow {
  comp_team_id: string;
  name: string;
  comp_team_type: CompTeamType;
  call_time: string | null;
}

interface UpdateRow {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  roleLabel: "Director" | "Choreographer";
  createdAt: string;
}

interface MediaRow {
  id: string;
  kind: MediaKind;
  fileName: string | null;
  storagePath: string;
  caption: string | null;
}

// Ports design-reference/CompetitionOverview.dc.html — a competition's own
// summary page, one scrolling page, no sub-nav. See BUILD_PLAN.md Task 24.
//
// Deficiency #36: the artboard's "Updates" feed and "Photos, video &
// documents" gallery originally had no schema behind them (post/media_item
// had no way to scope to a competition) and were dropped. Both now exist
// for real, backed by a nullable competition_id on post/media_item
// (migration 20260903161342) rather than a new content_scope enum value —
// a competition Update is stored as scope='studio' with competition_id
// set, visible studio-wide same as any other studio post, postable by the
// Director or the choreographer of a comp_team with an accepted entry
// here (per post_insert's RLS, checked live before writing this).
//
// `competition_read`'s own RLS already hides an unpublished competition
// from everyone but its Director (confirmed live via pg_policies before
// writing this) — no client-side published_at check needed here either.
export function CompetitionOverview() {
  const { id: competitionId } = useParams<{ id: string }>();
  const { person } = useAuth();
  const studio = useStudio();
  const isDirector = hasRole(person, "director");

  const [competition, setCompetition] = useState<CompetitionInfo | null | undefined>(undefined);
  const [entries, setEntries] = useState<EntryRow[] | null>(null);
  const [updates, setUpdates] = useState<UpdateRow[] | null>(null);
  const [mediaItems, setMediaItems] = useState<MediaRow[] | null>(null);
  const [canPost, setCanPost] = useState(false);
  const [updateBody, setUpdateBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!competitionId || !person) return;
    let cancelled = false;

    async function load() {
      const { data: compRow } = await supabase
        .from("competition")
        .select("id, name, venue_name, venue_address, starts_on, registration_note, created_by")
        .eq("id", competitionId!)
        .maybeSingle();
      if (cancelled) return;
      if (!compRow) {
        setCompetition(null);
        return;
      }

      const { data: creatorRow } = compRow.created_by
        ? await supabase.from("person").select("full_name").eq("id", compRow.created_by).maybeSingle()
        : { data: null as { full_name: string } | null };
      if (cancelled) return;
      setCompetition({ ...compRow, created_by_name: creatorRow?.full_name ?? null });

      const { data: entryRows } = await supabase
        .from("competition_entry")
        .select("comp_team_id, call_time, comp_team:comp_team_id(name, comp_team_type)")
        .eq("competition_id", competitionId!)
        .not("accepted_at", "is", null);
      if (cancelled) return;
      const acceptedEntries = (entryRows ?? [])
        .map((e) => {
          const ct = e.comp_team as unknown as { name: string; comp_team_type: CompTeamType } | null;
          return ct ? { comp_team_id: e.comp_team_id, call_time: e.call_time, name: ct.name, comp_team_type: ct.comp_team_type } : null;
        })
        .filter((e): e is EntryRow => !!e)
        .sort((a, b) => a.name.localeCompare(b.name));
      setEntries(acceptedEntries);

      const { data: choreoIds } = await callApp<string[]>("comp_teams_i_choreograph");
      if (cancelled) return;
      const enteredCompTeamIds = new Set(acceptedEntries.map((e) => e.comp_team_id));
      setCanPost(isDirector || (choreoIds ?? []).some((id) => enteredCompTeamIds.has(id)));

      const { data: postRows } = await supabase
        .from("post")
        .select("id, body, author_id, created_at, author:author_id(full_name)")
        .eq("competition_id", competitionId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      const authorIds = [...new Set((postRows ?? []).map((p) => p.author_id))];
      const { data: directorRows } = authorIds.length
        ? await supabase.from("person_role_assignment").select("person_id").eq("role", "director").in("person_id", authorIds)
        : { data: [] as { person_id: string }[] };
      if (cancelled) return;
      const directorIds = new Set((directorRows ?? []).map((r) => r.person_id));
      setUpdates(
        (postRows ?? []).map((p) => ({
          id: p.id,
          body: p.body,
          authorId: p.author_id,
          authorName: (p.author as unknown as { full_name: string } | null)?.full_name ?? "Someone",
          roleLabel: directorIds.has(p.author_id) ? "Director" : "Choreographer",
          createdAt: p.created_at,
        }))
      );

      const { data: mediaRows } = await supabase
        .from("media_item")
        .select("id, kind, file_name, storage_path, caption")
        .eq("competition_id", competitionId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (cancelled) return;
      setMediaItems(
        (mediaRows ?? []).map((m) => ({ id: m.id, kind: m.kind, fileName: m.file_name, storagePath: m.storage_path, caption: m.caption }))
      );
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [competitionId, person, isDirector, reloadKey]);

  async function postUpdate() {
    if (!person || !updateBody.trim() || posting) return;
    setPosting(true);
    const { data: season } = await supabase.from("season").select("id").eq("studio_id", person.studio_id).eq("is_current", true).single();
    const { error } = await supabase.from("post").insert({
      studio_id: person.studio_id,
      season_id: season!.id,
      scope: "studio",
      competition_id: competitionId!,
      author_id: person.id,
      body: updateBody.trim(),
    });
    setPosting(false);
    if (!error) {
      setUpdateBody("");
      setReloadKey((k) => k + 1);
    }
  }

  async function uploadMedia(files: FileList | null) {
    if (!person || !files || files.length === 0) return;
    setUploading(true);
    setMediaError(null);
    for (const file of Array.from(files).slice(0, 10)) {
      const path = studioMediaPath(person.studio_id, "media", null, file);
      const { error: uploadErr } = await uploadToStorage(path, file);
      if (uploadErr) {
        setMediaError(`Something went wrong uploading "${file.name}" — try again.`);
        setUploading(false);
        return;
      }
      const { error: insertErr } = await supabase.from("media_item").insert({
        studio_id: person.studio_id,
        competition_id: competitionId!,
        kind: mediaKindFromMime(file.type),
        processing_status: "ready",
        storage_path: path,
        file_name: file.name,
        byte_size: file.size,
        uploaded_by: person.id,
      });
      if (insertErr) {
        setMediaError(`"${file.name}" uploaded, but saving it failed — try again.`);
        setUploading(false);
        return;
      }
    }
    setUploading(false);
    setReloadKey((k) => k + 1);
  }

  if (!person) return null;
  if (competition === undefined) return null;
  if (competition === null) {
    return (
      <div style={{ padding: 24 }}>
        <p className="font-display" style={{ fontSize: 18 }}>
          Competition not found
        </p>
        <p style={{ color: "var(--ink-3)", fontSize: 13 }}>This competition doesn't exist, or isn't published yet.</p>
      </div>
    );
  }

  const dateLabel = new Date(competition.starts_on).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ padding: "16px 20px 14px", borderBottom: "1px solid var(--hairline)" }}>
        <div className="font-display" style={{ fontWeight: 700, fontSize: 16 }}>
          {competition.name}
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 1 }}>
          Dance competition · {dateLabel}
          {competition.venue_name ? ` · ${competition.venue_name}` : ""}
        </div>
      </div>

      <div style={{ padding: "18px 20px 40px" }}>
        <div style={{ borderRadius: 18, overflow: "hidden", boxShadow: "0 4px 14px -6px rgba(44,32,12,.22)" }}>
          <div style={{ background: "var(--band)", color: "var(--band-ink)", padding: "18px 18px" }}>
            <div className="font-display" style={{ fontWeight: 800, fontSize: 18 }}>{competition.name}</div>
            <div style={{ fontSize: 11, color: "var(--band-ink-2)", marginTop: 3 }}>
              {competition.venue_name ?? "Venue TBD"} · {dateLabel}
            </div>
          </div>
          <div style={{ background: "var(--surface)", padding: "14px 16px", display: "flex", gap: 14 }}>
            <div style={{ flex: 1 }}>
              <Eyebrow>Date</Eyebrow>
              <div className="font-display" style={{ fontWeight: 800, fontSize: 15, marginTop: 3 }}>{dateLabel}</div>
            </div>
            <div style={{ width: 1, background: "var(--sand)" }} />
            <div style={{ flex: 1.6 }}>
              <Eyebrow>Venue</Eyebrow>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 3 }}>{competition.venue_name ?? "Not set yet"}</div>
              {competition.venue_address && <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{competition.venue_address}</div>}
            </div>
          </div>
        </div>

        {competition.registration_note && (
          <div style={{ marginTop: 22 }}>
            <Eyebrow>Notes from {competition.created_by_name ?? "the Director"}</Eyebrow>
            <div className="card" style={{ marginTop: 10, border: "1px solid var(--hairline)", borderRadius: 16, padding: "14px 16px" }}>
              <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55 }}>{competition.registration_note}</div>
            </div>
          </div>
        )}

        <div style={{ marginTop: 22 }}>
          <Eyebrow>Our Comp Teams here · {entries?.length ?? 0}</Eyebrow>
          <div className="card" style={{ marginTop: 10, border: "1px solid var(--hairline)", borderRadius: 16, padding: "2px 16px" }}>
            {entries === null ? (
              <p style={{ padding: "13px 0", color: "var(--ink-2)", fontSize: 13 }}>Loading…</p>
            ) : entries.length === 0 ? (
              <p style={{ padding: "13px 0", color: "var(--ink-2)", fontSize: 13 }}>No Comp Teams entered yet.</p>
            ) : (
              entries.map((e, i) => (
                <Link
                  key={e.comp_team_id}
                  to={`/comp-team/${e.comp_team_id}`}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: i === 0 ? "none" : "1px solid var(--sand)", color: "inherit" }}
                >
                  <Avatar name={e.name} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>{e.name}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{TYPE_LABEL[e.comp_team_type]}</div>
                  </div>
                  {e.call_time && studio ? (
                    <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 12.5, background: "var(--sand)", borderRadius: 8, padding: "6px 11px", flexShrink: 0 }}>
                      {formatTimeInZone(e.call_time, studio.timezone).main}
                      {formatTimeInZone(e.call_time, studio.timezone).meridiem.toUpperCase()}
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-3)", border: "1.5px dashed var(--hairline)", borderRadius: 8, padding: "5px 10px", flexShrink: 0 }}>Not set yet</span>
                  )}
                  <ChevronIcon />
                </Link>
              ))
            )}
          </div>
          <p style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 8 }}>
            Tap a Comp Team to open its own Home, Schedule, roster &amp; rehearsals — this page only covers what's specific to the event itself.
          </p>
        </div>

        <div style={{ marginTop: 24 }}>
          <Eyebrow>Updates</Eyebrow>
          <div className="card" style={{ marginTop: 10, border: "1px solid var(--hairline)", borderRadius: 16, padding: "2px 16px" }}>
            {updates === null ? (
              <p style={{ padding: "13px 0", color: "var(--ink-2)", fontSize: 13 }}>Loading…</p>
            ) : updates.length === 0 ? (
              <p style={{ padding: "13px 0", color: "var(--ink-2)", fontSize: 13 }}>No updates yet.</p>
            ) : (
              updates.map((u, i) => (
                <div key={u.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 0", borderTop: i === 0 ? "none" : "1px solid var(--sand)" }}>
                  <Avatar name={u.authorName} size={32} tone="band" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>
                      {u.authorName} <span style={{ fontWeight: 600, color: "var(--ink-3)" }}>· {u.roleLabel}</span>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 2, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{u.body}</div>
                    <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 4 }}>{timeAgo(u.createdAt)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
          {canPost && (
            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
              <input
                type="text"
                value={updateBody}
                onChange={(e) => setUpdateBody(e.target.value)}
                placeholder="Post an update everyone competing here can see…"
                style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--hairline)", fontSize: 13, fontFamily: "inherit" }}
              />
              <button
                type="button"
                onClick={postUpdate}
                disabled={!updateBody.trim() || posting}
                style={{
                  padding: "10px 16px",
                  borderRadius: 10,
                  border: "none",
                  background: "var(--signal)",
                  color: "var(--signal-ink)",
                  fontSize: 13,
                  fontWeight: 700,
                  opacity: !updateBody.trim() || posting ? 0.6 : 1,
                  cursor: !updateBody.trim() || posting ? "default" : "pointer",
                }}
              >
                {posting ? "Posting…" : "Post"}
              </button>
            </div>
          )}
        </div>

        <div style={{ marginTop: 24 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <Eyebrow>Photos, video &amp; documents</Eyebrow>
            {canPost && (
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--signal-deep)", cursor: uploading ? "default" : "pointer" }}>
                <input type="file" accept="image/*,video/*,audio/*,application/pdf" multiple onChange={(e) => uploadMedia(e.target.files)} style={{ display: "none" }} disabled={uploading} />
                {uploading ? "Uploading…" : "+ Upload"}
              </label>
            )}
          </div>
          {mediaError && <div style={{ marginTop: 8, fontSize: 12, color: "var(--busy)" }}>{mediaError}</div>}
          {mediaItems === null ? (
            <p style={{ marginTop: 11, color: "var(--ink-2)", fontSize: 13 }}>Loading…</p>
          ) : mediaItems.length === 0 ? (
            <p style={{ marginTop: 11, color: "var(--ink-3)", fontSize: 12.5 }}>Nothing posted here yet.</p>
          ) : (
            <div style={{ display: "flex", gap: 12, marginTop: 11, overflowX: "auto", padding: "2px 2px 6px" }}>
              {mediaItems.map((m) => (
                <CompetitionMediaTile key={m.id} item={m} />
              ))}
            </div>
          )}
          <p style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 2 }}>
            Posted here by the Director or a choreographer, about the event itself — each Comp Team's own rehearsal footage and costume photos still live on its own Media tab.
          </p>
        </div>

        <p style={{ fontSize: 11, color: "var(--ink-3)", textAlign: "center", lineHeight: 1.5, marginTop: 30 }}>
          Questions about a call time or rehearsal? Message the Comp Team directly — this page is for what's shared across everyone competing here.
        </p>
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

function ChevronIcon() {
  return (
    <svg style={{ width: 15, height: 15, color: "var(--ink-3)", flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function CompetitionMediaTile({ item }: { item: MediaRow }) {
  const photoUrl = useSignedUrl(item.kind === "photo" ? item.storagePath : null);
  return (
    <div style={{ flex: "0 0 128px" }}>
      <div
        style={{
          position: "relative",
          height: 160,
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 4px 14px -6px rgba(44,32,12,.22)",
          background: "var(--surface)",
          border: "1px solid var(--hairline)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {photoUrl ? <img src={photoUrl} alt={item.caption ?? item.fileName ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <MediaKindIcon kind={item.kind} />}
      </div>
      <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {item.caption ?? item.fileName ?? "Untitled"}
      </div>
    </div>
  );
}

function MediaKindIcon({ kind }: { kind: MediaKind }) {
  if (kind === "photo" || kind === "video") {
    return (
      <svg style={{ width: 26, height: 26, color: "var(--ink-3)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="9" cy="10" r="2" />
        <path d="M21 16l-5-5-9 9" />
      </svg>
    );
  }
  return (
    <svg style={{ width: 26, height: 26, color: "var(--ink-3)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}
