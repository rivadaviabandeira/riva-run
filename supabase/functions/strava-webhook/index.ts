// Supabase Edge Function for Strava webhook verification and event intake.
// Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRAVA_VERIFY_TOKEN.
// Register this public endpoint as the Strava webhook callback URL.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const required = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing server secret: ${name}`);
  return value;
};

Deno.serve(async (req) => {
  const url = new URL(req.url);
  try {
    // Strava's initial webhook subscription handshake uses GET query parameters.
    if (req.method === "GET") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");
      if (mode !== "subscribe" || !challenge || token !== required("STRAVA_VERIFY_TOKEN")) {
        return json({ error: "Verificação de webhook inválida." }, 403);
      }
      return json({ "hub.challenge": challenge });
    }

    if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
    const event = await req.json();
    const objectId = Number(event.object_id);
    const ownerId = Number(event.owner_id);
    const eventTime = Number(event.event_time);
    if (!Number.isSafeInteger(objectId) || !Number.isSafeInteger(ownerId) ||
        !Number.isSafeInteger(eventTime) || !event.object_type || !event.aspect_type) {
      return json({ error: "Evento inválido." }, 400);
    }

    const admin = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });
    // Webhook delivery may be repeated; the composite primary key makes intake idempotent.
    const { error } = await admin.from("strava_webhook_events").upsert({
      object_id: objectId,
      object_type: String(event.object_type),
      aspect_type: String(event.aspect_type),
      owner_id: ownerId,
      event_time: eventTime,
      payload: event,
    }, { onConflict: "object_id,object_type,aspect_type,event_time", ignoreDuplicates: true });
    if (error) {
      console.error("Could not store Strava webhook event", error.message);
      return json({ error: "Não foi possível registrar o evento." }, 500);
    }
    // Follow-up worker must process create/update/delete events, refresh expired tokens,
    // fetch activity details from Strava, and upsert/delete activities by external ID.
    return json({ received: true });
  } catch (error) {
    console.error("Strava webhook error", error instanceof Error ? error.message : "unknown error");
    return json({ error: "Erro interno." }, 500);
  }
});
