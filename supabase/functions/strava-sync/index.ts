// Protected worker for processing queued Strava webhook events.
// Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRAVA_CLIENT_ID,
// STRAVA_CLIENT_SECRET, STRAVA_SYNC_SECRET.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const required = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing server secret: ${name}`);
  return value;
};

async function validAccessToken(admin: ReturnType<typeof createClient>, connection: any) {
  if (new Date(connection.expires_at).getTime() > Date.now() + 5 * 60 * 1000) return connection.access_token;
  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: required("STRAVA_CLIENT_ID"),
      client_secret: required("STRAVA_CLIENT_SECRET"),
      grant_type: "refresh_token",
      refresh_token: connection.refresh_token,
    }),
  });
  const tokens = await response.json();
  if (!response.ok || !tokens.access_token || !tokens.refresh_token || !tokens.expires_at) {
    throw new Error("Strava token refresh failed");
  }
  const { error } = await admin.from("strava_connections").update({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: new Date(tokens.expires_at * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("user_id", connection.user_id);
  if (error) throw new Error("Could not persist refreshed Strava token");
  return tokens.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  if (req.headers.get("x-riva-sync-secret") !== required("STRAVA_SYNC_SECRET")) {
    return json({ error: "Não autorizado." }, 401);
  }

  const admin = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
  const body = await req.json().catch(() => ({}));
  const batchSize = Math.min(Math.max(Number(body.batch_size) || 20, 1), 50);
  const { data: events, error: queueError } = await admin.from("strava_webhook_events")
    .select("*").is("processed_at", null).order("created_at", { ascending: true }).limit(batchSize);
  if (queueError) return json({ error: "Não foi possível consultar a fila." }, 500);

  let processed = 0;
  let failed = 0;
  for (const event of events ?? []) {
    try {
      if (event.object_type !== "activity") {
        await admin.from("strava_webhook_events")
          .update({ processed_at: new Date().toISOString() })
          .match({ object_id: event.object_id, object_type: event.object_type, aspect_type: event.aspect_type, event_time: event.event_time });
        processed++;
        continue;
      }

      const { data: connection, error: connectionError } = await admin.from("strava_connections")
        .select("*").eq("athlete_id", event.owner_id).maybeSingle();
      // If the athlete disconnected or revoked access, acknowledge without importing.
      if (connectionError || !connection) {
        await admin.from("strava_webhook_events")
          .update({ processed_at: new Date().toISOString() })
          .match({ object_id: event.object_id, object_type: event.object_type, aspect_type: event.aspect_type, event_time: event.event_time });
        processed++;
        continue;
      }

      if (event.aspect_type === "delete") {
        const { error } = await admin.from("activities")
          .delete().eq("source", "strava").eq("external_activity_id", event.object_id).eq("user_id", connection.user_id);
        if (error) throw new Error("Could not delete activity");
      } else if (event.aspect_type === "create" || event.aspect_type === "update") {
        const token = await validAccessToken(admin, connection);
        const response = await fetch(`https://www.strava.com/api/v3/activities/${event.object_id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.status === 404 || response.status === 403) {
          // Private/deleted/unavailable activities must not remain eligible for scoring.
          await admin.from("activities").delete()
            .eq("source", "strava").eq("external_activity_id", event.object_id).eq("user_id", connection.user_id);
        } else {
          const activity = await response.json();
          if (!response.ok) throw new Error(`Strava activity fetch failed: ${response.status}`);
          const { error } = await admin.from("activities").upsert({
            user_id: connection.user_id,
            source: "strava",
            external_activity_id: activity.id,
            activity_type: activity.sport_type ?? activity.type ?? "Unknown",
            title: activity.name ?? "",
            distance_m: Math.max(0, Number(activity.distance) || 0),
            moving_time_s: Math.max(0, Number(activity.moving_time) || 0),
            started_at: activity.start_date,
            status: "pending",
            raw_summary: {
              sport_type: activity.sport_type ?? null,
              trainer: activity.trainer ?? false,
              commute: activity.commute ?? false,
              private: activity.private ?? false,
            },
            updated_at: new Date().toISOString(),
          }, { onConflict: "source,external_activity_id" });
          if (error) throw new Error("Could not save imported activity");
        }
      }

      await admin.from("strava_webhook_events")
        .update({ processed_at: new Date().toISOString() })
        .match({ object_id: event.object_id, object_type: event.object_type, aspect_type: event.aspect_type, event_time: event.event_time });
      processed++;
    } catch (error) {
      failed++;
      // Leave processed_at null so transient failures can be retried.
      console.error("Strava event processing failed", event.object_id, error instanceof Error ? error.message : "unknown error");
    }
  }
  return json({ received: events?.length ?? 0, processed, failed });
});
