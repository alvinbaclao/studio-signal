import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { Database } from "./database.types";

export const STUDIO_MEDIA_BUCKET = "studio-media";

type MediaKind = Database["public"]["Enums"]["media_kind"];

// Every path under studio-media starts with the studio_id — that's what
// the bucket's RLS policies key off (see the migration that created it,
// 20260903132309_create_studio_media_bucket.sql), and it's also how a
// signed URL request implicitly proves "I'm asking for something in my
// own studio," since app.my_confirmed_studio_ids() gates the read.
export function studioMediaPath(studioId: string, category: "people" | "studio-logo" | "media", personId: string | null, file: File): string {
  const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
  return personId ? `${studioId}/${category}/${personId}/${safeName}` : `${studioId}/${category}/${safeName}`;
}

export function mediaKindFromMime(mime: string): MediaKind {
  if (mime.startsWith("image/")) return "photo";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "doc";
}

export async function uploadToStorage(path: string, file: File): Promise<{ error: string | null }> {
  const { error } = await supabase.storage.from(STUDIO_MEDIA_BUCKET).upload(path, file, { upsert: true });
  return { error: error?.message ?? null };
}

// Private bucket — every read needs a signed URL, not a plain public one
// (see the migration's own note on why: this holds photos of dancers,
// some of them minors). Cached client-side for the URL's own lifetime
// minus a safety margin, so re-rendering the same tile doesn't re-sign it.
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const SIGNED_URL_TTL_SECONDS = 3600;

async function getSignedUrl(path: string): Promise<string | null> {
  const cached = signedUrlCache.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  const { data, error } = await supabase.storage.from(STUDIO_MEDIA_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  signedUrlCache.set(path, { url: data.signedUrl, expiresAt: Date.now() + (SIGNED_URL_TTL_SECONDS - 300) * 1000 });
  return data.signedUrl;
}

export function useSignedUrl(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    getSignedUrl(path).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);
  return url;
}
