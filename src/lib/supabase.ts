import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to " +
      ".env.local and fill in the values from your Supabase project's " +
      "Settings → API page. See docs/SETUP.md."
  );
}

// Typed against the generated schema (see database.types.ts + docs/SETUP.md's
// "Generate types from the real schema" step — run that once your Supabase
// project has the four migrations applied, and re-run it any time the schema
// changes, which should be never: the schema is fixed, see PROJECT_KNOWLEDGE.md.
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

/**
 * Every RPC call into the private `app` schema goes through this helper so
 * the `.schema('app')` call form is never retyped (and never gotten subtly
 * wrong) at each call site. Argument keys must match the Postgres function's
 * parameter names exactly (p_token, p_code, p_scope, ...) — see each
 * function's signature in backend/migrations/000{3,4}_*.sql.
 *
 * Example:
 *   const { data, error } = await callApp('redeem_invite', { p_token: token })
 */
type AppFunctionName = keyof Database["app"]["Functions"];

export function callApp<T = unknown>(
  fn: AppFunctionName,
  args?: Record<string, unknown>
) {
  return supabase.schema("app").rpc(fn, (args ?? {}) as never) as unknown as Promise<{
    data: T | null;
    error: { message: string } | null;
  }>;
}
