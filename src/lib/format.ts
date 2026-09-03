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
// short registered/confirmed-on captions, not schedule rows. Used on both
// full timestamps (created_at/updated_at/expires_at — device-local is
// correct there, same as "2 hours ago") and plain date-only columns
// (date_of_birth, competition.starts_on). A bare "YYYY-MM-DD" has no time
// or timezone component at all — `new Date("2027-09-09")` parses it as UTC
// midnight, which renders a day early for any device west of UTC. Parsing
// the Y/M/D digits directly into the local-time Date constructor (not the
// ISO-string one) avoids that conversion entirely, since there's no
// instant to convert — it's just a calendar date. See docs/DEFICIENCIES.md
// #34.
export function formatShortDate(iso: string | null): string {
  if (!iso) return "";
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(iso);
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

// ---------------------------------------------------------------------------
// Studio-timezone-aware helpers for the Schedule screens (Task 11). All
// event times are stored UTC — every function here takes an IANA zone name
// (studio.timezone) explicitly and never falls back to the device's own
// timezone, per PROJECT_KNOWLEDGE.md's standing rule.

// "4:30p" / "8:15a" — meridiem split out so callers (ScheduleRow) can
// render it smaller.
export function formatTimeInZone(iso: string, timeZone: string): { main: string; meridiem: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(new Date(iso));
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const meridiem = (map.dayPeriod ?? "").toLowerCase().charAt(0); // "AM"/"PM" -> "a"/"p"
  return { main: `${map.hour}:${map.minute}`, meridiem };
}

// "Thursday 27 Aug" — PROJECT_KNOWLEDGE.md's stated convention for dates.
export function formatLongDateInZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

// "Mon"/"Tue"/... single-letter or short weekday label for day strips.
export function weekdayLabelInZone(iso: string, timeZone: string, width: "narrow" | "short" = "narrow"): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: width }).format(new Date(iso));
}

export function dayNumberInZone(iso: string, timeZone: string): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone, day: "numeric" }).format(new Date(iso)));
}

// Minutes since midnight *in timeZone* — the vertical axis of Studio
// Calendar Review's day grid (Task 13) is built from this, never from
// getUTCHours()/getUTCMinutes() directly, since starts_at/ends_at are UTC
// and the studio's timezone is virtually never UTC.
export function zonedMinutesOfDay(iso: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return Number(map.hour) * 60 + Number(map.minute);
}

// The event's Y-M-D in the studio's timezone, as a sortable "YYYY-MM-DD"
// grouping key — this is what "which day does this event fall on" actually
// means once the device and studio timezones can differ.
export function zonedDateKey(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(iso)
  );
}

function zonedYMDOf(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day) };
}

// The UTC instant that is midnight on (year, month, day) *in timeZone* —
// found by rendering a UTC guess into timeZone and correcting by however
// far the rendered wall-clock time drifted from the guess. Handles DST
// correctly since it works from the zone's actual rendered offset, not a
// fixed one.
function zonedMidnightUTC(year: number, month: number, day: number, timeZone: string): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(guess);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const renderedAsUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );
  const driftMs = renderedAsUTC - guess.getTime();
  return new Date(guess.getTime() - driftMs);
}

// The inverse of the display helpers above: a "YYYY-MM-DD" date plus
// "HH:MM" (24h) wall-clock time, both as entered in the studio's timezone,
// converted to the UTC instant to store. Same guess-and-correct approach as
// zonedMidnightUTC, generalized to an arbitrary time of day.
export function zonedDateTimeToUTC(dateYMD: string, timeHM: string, timeZone: string): Date {
  const [year, month, day] = dateYMD.split("-").map(Number);
  const [hour, minute] = timeHM.split(":").map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(guess);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const renderedAsUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );
  const driftMs = renderedAsUTC - guess.getTime();
  return new Date(guess.getTime() - driftMs);
}

// Monday-start week (matching every Schedule artboard's day strip) — the
// UTC instant for the start of "today"'s week in timeZone, and the instant
// one week later (exclusive upper bound for a starts_at range query).
export function weekRangeInZone(reference: Date, timeZone: string): { start: Date; end: Date } {
  const { year, month, day } = zonedYMDOf(reference, timeZone);
  const midnightToday = zonedMidnightUTC(year, month, day, timeZone);
  // ISO weekday (1 = Monday ... 7 = Sunday) of the zoned Y-M-D — safe to get
  // from a plain UTC noon Date built on those components, since day-of-week
  // doesn't depend on time-of-day or offset.
  const dow = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay(); // 0 = Sunday ... 6 = Saturday
  const isoWeekday = dow === 0 ? 7 : dow;
  const start = new Date(midnightToday.getTime() - (isoWeekday - 1) * 86400000);
  const end = new Date(start.getTime() + 7 * 86400000);
  return { start, end };
}

export function monthRangeInZone(reference: Date, timeZone: string): { start: Date; end: Date } {
  const { year, month } = zonedYMDOf(reference, timeZone);
  const start = zonedMidnightUTC(year, month, 1, timeZone);
  const nextMonth = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const end = zonedMidnightUTC(nextMonth.y, nextMonth.m, 1, timeZone);
  return { start, end };
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86400000);
}

// The UTC instants bounding a single "YYYY-MM-DD" calendar day *in
// timeZone* — Studio Calendar Review's day-by-space grid (Task 13) queries
// this exact range.
export function dayRangeInZone(dateYMD: string, timeZone: string): { start: Date; end: Date } {
  const [year, month, day] = dateYMD.split("-").map(Number);
  const start = zonedMidnightUTC(year, month, day, timeZone);
  const end = new Date(start.getTime() + 86400000);
  return { start, end };
}
