export function ageFromDob(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const hasHadBirthdayThisYear =
    now.getMonth() > birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

// Compact "26 Aug" form for inline meta captions — see PROJECT_KNOWLEDGE.md's
// "Thursday 27 Aug" convention; the weekday is dropped here since these are
// short registered/confirmed-on captions, not schedule rows.
export function formatShortDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
