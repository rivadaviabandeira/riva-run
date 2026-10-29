// Supabase Edge Function: Strava OAuth authorization and callback.
// Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRAVA_CLIENT_ID,
// STRAVA_CLIENT_SECRET, STRAVA_REDIRECT_URI, APP_REDIRECT_URI.
// Configure STRAVA_REDIRECT_URI to this function's /strava-auth/callback URL.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const required = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing server secret: ${name}`);
  return value;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const supabaseUrl = required("SUPABASE_URL");
  const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  try {
    // OAuth redirect callback: validate the one-time state before exchanging the code.
    if (url.pathname.endsWith("/callback")) {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const oauthError = url.searchParams.get("error");
      if (oauthError) return json({ error: "Autorização Strava cancelada ou negada." }, 400);
      if (!code || !state) return json({ error: "Parâmetros OAuth ausentes." }, 400);

      const { data: stateRow, error: stateError } = await admin
        .from("strava_oauth_states").select("state,user_id,expires_at").eq("state", state).maybeSingle();
      if (stateError || !stateRow || new Date(stateRow.expires_at).getTime() < Date.now()) {
        if (stateRow) await admin.from("strava_oauth_states").delete().eq("state", state);
        return json({ error: "Estado OAuth inválido ou expirado. Tente conectar novamente." }, 400);
      }
      // Consume the one-time state before calling the external provider.
      await admin.from("strava_oauth_states").delete().eq("state", state);

      const tokenResponse = await fetch("https://www.strava.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: required("STRAVA_CLIENT_ID"),
          client_secret: required("STRAVA_CLIENT_SECRET"),
          code,
          grant_type: "authorization_code",
        }),
      });
      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok || !tokenData.athlete?.id || !tokenData.access_token || !tokenData.refresh_token) {
        return json({ error: "Não foi possível concluir a autorização do Strava." }, 502);
      }

      const scopes = url.searchParams.get("scope") ?? "read,activity:read";
      const { error: saveError } = await admin.from("strava_connections").upsert({
        user_id: stateRow.user_id,
        athlete_id: tokenData.athlete.id,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: new Date(tokenData.expires_at * 1000).toISOString(),
        scopes,
        updated_at: new Date().toISOString(),
      });
      if (saveError) {
        console.error("Could not save Strava connection", saveError.message);
        return json({ error: "Autorização recebida, mas não foi possível salvar a conexão." }, 500);
      }

      const appRedirect = Deno.env.get("APP_REDIRECT_URI");
      if (appRedirect) return Response.redirect(`${appRedirect}?strava=connected`, 302);
      return json({ connected: true });
    }

    if (req.method !== "GET") return json({ error: "Método não permitido." }, 405);
    // Start authorization only for a logged-in Supabase user.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Autenticação obrigatória." }, 401);
    const userClient = createClient(supabaseUrl, required("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "Sessão inválida." }, 401);

    const stateBytes = crypto.getRandomValues(new Uint8Array(32));
    const state = Array.from(stateBytes, (b) => b.toString(16).padStart(2, "0")).join("");
    const { error: stateInsertError } = await admin.from("strava_oauth_states").insert({
      state, user_id: user.id, expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (stateInsertError) return json({ error: "Não foi possível iniciar a conexão." }, 500);

    const params = new URLSearchParams({
      client_id: required("STRAVA_CLIENT_ID"),
      response_type: "code",
      redirect_uri: required("STRAVA_REDIRECT_URI"),
      approval_prompt: "auto",
      scope: "read,activity:read",
      state,
    });
    return json({ authorization_url: `https://www.strava.com/oauth/authorize?${params.toString()}` });
  } catch (error) {
    console.error("Strava OAuth error", error instanceof Error ? error.message : "unknown error");
    return json({ error: "Erro interno ao conectar ao Strava." }, 500);
  }
});
