import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./AuthProvider";

interface StudioInfo {
  name: string;
  timezone: string;
}

// All event times are stored UTC and must display in studio.timezone, never
// the device's own timezone — see PROJECT_KNOWLEDGE.md's standing rule.
// Load it once per screen via this hook rather than re-deriving it.
export function useStudio(): StudioInfo | null {
  const { person } = useAuth();
  const [studio, setStudio] = useState<StudioInfo | null>(null);

  useEffect(() => {
    if (!person) return;
    let cancelled = false;
    supabase
      .from("studio")
      .select("name, timezone")
      .eq("id", person.studio_id)
      .single()
      .then(({ data }) => {
        if (!cancelled && data) setStudio(data);
      });
    return () => {
      cancelled = true;
    };
  }, [person]);

  return studio;
}
