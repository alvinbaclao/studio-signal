// Maps a thrown Postgrest error to the friendly text a person should see,
// per BUILD_PLAN.md Task 12/13: catch the constraint error rather than
// working around it, never disable an option client-side alone.
export function friendlyPostgrestError(err: unknown): string {
  const code = (err as { code?: string })?.code;
  if (code === "23P01") return "That space is already booked for part of this time — pick a different time or location.";
  if (code === "23514") return "That event type and destination combination isn't allowed.";
  if (code === "42501") return "You don't have permission to do that here.";
  return "Something went wrong saving this — try again.";
}
