// Task 28 — the one Edge Function every notification-worthy database
// change routes through. A Postgres trigger (supabase/migrations, Phase 5)
// posts the raw row-change payload here for each of five tables; this
// function decides whether that change is actually notify-worthy, resolves
// who should hear about it, and calls OneSignal.
//
// Deliberately NOT using the app.* RPC helpers (teams_i_can_see() etc.) —
// those answer "what can this person see" (per-viewer, RLS-shaped), while
// this needs "who is in this audience" (per-destination, audience-out). A
// direct join against the same underlying tables the client already reads
// (team_member, comp_team_cast, guardian_link, thread_participant, person)
// is the correct direction and doesn't need RLS at all: this function runs
// with the service_role key by design, the same trust boundary a
// SECURITY DEFINER RPC already has, just written in Deno.
//
// The 8 triggers this resolves (see the Task 28 plan for why these 8):
//   1. booking_request decided (approved/declined)      -> the requester
//   2/3. message inserted (urgent vs. ordinary)          -> thread audience minus sender
//   4. competition_entry.call_time set or changed        -> comp_team cast + guardians
//   5. competition_entry proposal decided (accept/decline) -> the proposer
//   6. person confirmed                                  -> that person
//   7. a person newly needs review (status = pending)     -> the studio's Director(s)
//   8. post marked important                              -> that post's scope audience

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID")!;
const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("NOTIFY_WEBHOOK_SECRET")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: Row | null;
  old_record: Row | null;
}

interface Notification {
  personIds: string[];
  title: string;
  body: string;
}

Deno.serve(async (req) => {
  if (req.headers.get("x-notify-secret") !== WEBHOOK_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const notification = await resolveNotification(payload);
  if (!notification || notification.personIds.length === 0) {
    return new Response("ok (no-op)", { status: 200 });
  }

  await sendPush(notification);
  return new Response("ok", { status: 200 });
});

async function resolveNotification(payload: WebhookPayload): Promise<Notification | null> {
  switch (payload.table) {
    case "booking_request":
      return resolveBookingRequest(payload);
    case "message":
      return resolveMessage(payload);
    case "competition_entry":
      return resolveCompetitionEntry(payload);
    case "person":
      return resolvePerson(payload);
    case "post":
      return resolvePost(payload);
    default:
      return null;
  }
}

// 1. Booking request decided
async function resolveBookingRequest(payload: WebhookPayload): Promise<Notification | null> {
  const { record, old_record } = payload;
  if (!record || !old_record) return null;
  if (record.status === old_record.status) return null;
  if (record.status !== "approved" && record.status !== "declined") return null;

  const destName = await resolveDestinationName(record.team_id, record.comp_team_id);
  return {
    personIds: [record.requested_by],
    title: record.status === "approved" ? "Request approved" : "Request declined",
    body:
      record.status === "approved"
        ? `${destName}: your studio time request was approved.`
        : `${destName}: your studio time request was declined.${record.decline_reason ? ` "${record.decline_reason}"` : ""}`,
  };
}

// 2/3. New message — urgent and ordinary share the same audience logic,
// they only differ in title/priority (that's the whole reason they were
// designed as one shared resolver instead of two separate DB triggers).
async function resolveMessage(payload: WebhookPayload): Promise<Notification | null> {
  const { record } = payload;
  if (!record || record.deleted_at) return null;

  const { data: thread } = await supabase
    .from("message_thread")
    .select("scope, team_id, comp_team_id, studio_id, subject")
    .eq("id", record.thread_id)
    .single();
  if (!thread) return null;

  const audience = await resolveThreadAudience(record.thread_id, thread);
  const recipients = audience.filter((id) => id !== record.author_id);
  if (recipients.length === 0) return null;

  const label = thread.subject ?? (await threadFallbackLabel(thread));
  return {
    personIds: recipients,
    title: record.is_urgent ? `🔴 Urgent — ${label}` : label,
    body: truncate(record.body, 120),
  };
}

async function resolveThreadAudience(
  threadId: string,
  thread: { scope: string; team_id: string | null; comp_team_id: string | null; studio_id: string }
): Promise<string[]> {
  if (thread.scope === "direct") {
    const { data } = await supabase.from("thread_participant").select("person_id").eq("thread_id", threadId);
    return (data ?? []).map((r) => r.person_id);
  }
  if (thread.scope === "team" && thread.team_id) {
    const { data } = await supabase.from("team_member").select("person_id").eq("team_id", thread.team_id);
    return (data ?? []).map((r) => r.person_id);
  }
  if (thread.scope === "comp_team" && thread.comp_team_id) {
    const { data } = await supabase.from("comp_team_cast").select("person_id").eq("comp_team_id", thread.comp_team_id);
    return (data ?? []).map((r) => r.person_id);
  }
  // studio-wide
  const { data } = await supabase.from("person").select("id").eq("studio_id", thread.studio_id).eq("status", "confirmed");
  return (data ?? []).map((r) => r.id);
}

async function threadFallbackLabel(thread: { scope: string; team_id: string | null; comp_team_id: string | null }): Promise<string> {
  if (thread.scope === "team" && thread.team_id) return await resolveDestinationName(thread.team_id, null);
  if (thread.scope === "comp_team" && thread.comp_team_id) return await resolveDestinationName(null, thread.comp_team_id);
  if (thread.scope === "studio") return "Studio";
  return "New message";
}

// 4 & 5. Call time set/changed, and proposal decided — both live on
// competition_entry, one via UPDATE, the other via UPDATE (accept) or
// DELETE (decline — declineProposal() in CompetitionWizard.tsx really
// deletes the row, it doesn't set a status column).
async function resolveCompetitionEntry(payload: WebhookPayload): Promise<Notification | null> {
  const { type, record, old_record } = payload;

  // 5b. Declined: the pending proposal row was deleted outright.
  if (type === "DELETE") {
    if (!old_record || !old_record.proposed_by || old_record.accepted_at) return null;
    const compTeamName = await resolveDestinationName(null, old_record.comp_team_id);
    return {
      personIds: [old_record.proposed_by],
      title: "Entry declined",
      body: `${compTeamName}'s competition entry proposal was declined.`,
    };
  }

  if (!record || !old_record) return null;

  // 5a. Accepted
  if (!old_record.accepted_at && record.accepted_at && record.proposed_by) {
    const compTeamName = await resolveDestinationName(null, record.comp_team_id);
    return {
      personIds: [record.proposed_by],
      title: "Entry accepted",
      body: `${compTeamName}'s competition entry proposal was accepted.`,
    };
  }

  // 4. Call time set or changed
  if (record.call_time && record.call_time !== old_record.call_time) {
    const audience = await resolveCompTeamAudienceWithGuardians(record.comp_team_id);
    if (audience.length === 0) return null;
    const compTeamName = await resolveDestinationName(null, record.comp_team_id);
    return {
      personIds: audience,
      title: "Call time set",
      body: `${compTeamName}'s call time has been ${old_record.call_time ? "changed" : "set"}.`,
    };
  }

  return null;
}

async function resolveCompTeamAudienceWithGuardians(compTeamId: string): Promise<string[]> {
  const { data: castRows } = await supabase.from("comp_team_cast").select("person_id").eq("comp_team_id", compTeamId);
  const castIds = (castRows ?? []).map((r) => r.person_id);
  if (castIds.length === 0) return [];

  const { data: guardianRows } = await supabase.from("guardian_link").select("guardian_id").in("dancer_id", castIds);
  const guardianIds = (guardianRows ?? []).map((r) => r.guardian_id);

  return [...new Set([...castIds, ...guardianIds])];
}

// 6 & 7. Person status transitions
async function resolvePerson(payload: WebhookPayload): Promise<Notification | null> {
  const { type, record, old_record } = payload;
  if (!record) return null;

  const wasConfirmed = old_record?.status === "confirmed";
  const wasPending = old_record?.status === "pending";

  // 6. Newly confirmed
  if (record.status === "confirmed" && !wasConfirmed) {
    return {
      personIds: [record.id],
      title: "You're in!",
      body: "Your account has been confirmed — welcome aboard.",
    };
  }

  // 7. Newly pending (a brand-new signup, or a transition back into pending)
  const newlyPending = record.status === "pending" && (type === "INSERT" || !wasPending);
  if (newlyPending) {
    const { data: directors } = await supabase
      .from("person_role_assignment")
      .select("person_id")
      .eq("studio_id", record.studio_id)
      .eq("role", "director");
    const directorIds = (directors ?? []).map((r) => r.person_id).filter((id) => id !== record.id);
    if (directorIds.length === 0) return null;
    return {
      personIds: directorIds,
      title: "New person to confirm",
      body: `${record.full_name} is waiting in your Confirm Queue.`,
    };
  }

  return null;
}

// 8. Bulletin post marked Important
async function resolvePost(payload: WebhookPayload): Promise<Notification | null> {
  const { type, record } = payload;
  if (type !== "INSERT" || !record || !record.important) return null;

  const audience = await resolveScopeAudience(record.scope, record.team_id, record.comp_team_id, record.studio_id);
  if (audience.length === 0) return null;

  const destName = await resolveDestinationName(record.team_id, record.comp_team_id);
  return {
    personIds: audience,
    title: `📌 Important — ${destName}`,
    body: truncate(record.body, 120),
  };
}

async function resolveScopeAudience(
  scope: string,
  teamId: string | null,
  compTeamId: string | null,
  studioId: string
): Promise<string[]> {
  if (scope === "team" && teamId) {
    const { data } = await supabase.from("team_member").select("person_id").eq("team_id", teamId);
    return (data ?? []).map((r) => r.person_id);
  }
  if (scope === "comp_team" && compTeamId) {
    const { data } = await supabase.from("comp_team_cast").select("person_id").eq("comp_team_id", compTeamId);
    return (data ?? []).map((r) => r.person_id);
  }
  const { data } = await supabase.from("person").select("id").eq("studio_id", studioId).eq("status", "confirmed");
  return (data ?? []).map((r) => r.id);
}

// Shared: a Team or Comp Team's display name, whichever id is non-null.
async function resolveDestinationName(teamId: string | null, compTeamId: string | null): Promise<string> {
  if (teamId) {
    const { data } = await supabase.from("team").select("name").eq("id", teamId).single();
    return data?.name ?? "Your Team";
  }
  if (compTeamId) {
    const { data } = await supabase.from("comp_team").select("name").eq("id", compTeamId).single();
    return data?.name ?? "Your Comp Team";
  }
  return "Studio";
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

async function sendPush(notification: Notification): Promise<void> {
  const res = await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${ONESIGNAL_REST_API_KEY}`,
    },
    body: JSON.stringify({
      app_id: ONESIGNAL_APP_ID,
      include_external_user_ids: notification.personIds,
      headings: { en: notification.title },
      contents: { en: notification.body },
    }),
  });
  if (!res.ok) {
    console.error("OneSignal send failed", res.status, await res.text());
  }
}
