// Agente de dados do PaceHub (execução agendada no servidor).
//
// Responsabilidades:
//  1. Validar atividades importadas (tipo de esporte, distância, pace e janela de tempo).
//  2. Detectar duplicidades e quilometragem implausível antes de pontuar.
//  3. Registrar e resolver pendências em data_quality_issues.
//  4. Recalcular PP, bônus e medalhas de cada corredor afetado (idempotente).
//  5. Limpar estados OAuth expirados.
//
// Segredos necessários: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STEWARD_SECRET.
// Agende com pg_cron ou o agendador da Supabase e envie o header
// `x-steward-secret`. Nunca chame esta função pelo app cliente.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const required = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing server secret: ${name}`);
  return value;
};

const MIN_DISTANCE_M = 1000;
const MAX_DISTANCE_M = 100_000;
const MIN_PACE_S = 150; // 2:30/km
const MAX_PACE_S = 720; // 12:00/km
const RUN_TYPES = new Set(["Run", "TrailRun", "VirtualRun"]);
const PAGE_SIZE = 200;

type Severity = "alta" | "media" | "baixa";
type IssueKind = "duplicidade" | "pendente" | "sem_tenis" | "distancia" | "pace" | "tenis_desgastado";

type Issue = {
  kind: IssueKind;
  severity: Severity;
  detail: string;
  user_id: string;
  activity_id?: string;
  shoe_id?: string;
  dedupe_key: string;
};

type ActivityRow = {
  id: string;
  user_id: string;
  shoe_id: string | null;
  distance_m: number;
  moving_time_s: number;
  started_at: string;
  activity_type: string;
  title: string;
  status: "pending" | "validated" | "rejected";
};

const activityKey = (kind: IssueKind, activityId: string) => `${kind}:${activityId}`;

async function openIssues(admin: ReturnType<typeof createClient>, issues: Issue[]) {
  if (issues.length === 0) return;
  await admin.from("data_quality_issues").upsert(
    issues.map((issue) => ({
      ...issue,
      status: "open",
      detected_at: new Date().toISOString(),
      resolved_at: null,
    })),
    { onConflict: "dedupe_key" },
  );
}

async function resolveIssues(admin: ReturnType<typeof createClient>, dedupeKeys: string[]) {
  if (dedupeKeys.length === 0) return;
  await admin
    .from("data_quality_issues")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .in("dedupe_key", dedupeKeys)
    .eq("status", "open");
}

async function classifyActivity(
  admin: ReturnType<typeof createClient>,
  activity: ActivityRow,
  duplicateIds: Set<string>,
): Promise<{ status: "pending" | "validated" | "rejected"; issues: Issue[]; resolved: string[] }> {
  const issues: Issue[] = [];
  const resolved: string[] = [];
  const km = activity.distance_m / 1000;
  const pace = activity.moving_time_s > 0 && km > 0 ? activity.moving_time_s / km : null;

  if (!RUN_TYPES.has(activity.activity_type)) {
    return {
      status: "rejected",
      resolved: [
        activityKey("duplicidade", activity.id),
        activityKey("pendente", activity.id),
        activityKey("sem_tenis", activity.id),
        activityKey("distancia", activity.id),
        activityKey("pace", activity.id),
      ],
      issues,
    };
  }

  if (activity.distance_m < MIN_DISTANCE_M || activity.distance_m > MAX_DISTANCE_M) {
    issues.push({
      kind: "distancia",
      severity: "alta",
      user_id: activity.user_id,
      activity_id: activity.id,
      dedupe_key: activityKey("distancia", activity.id),
      detail: `Distância de ${km.toFixed(1)} km fora da faixa aceita (1 a 100 km).`,
    });
  } else {
    resolved.push(activityKey("distancia", activity.id));
  }

  if (pace === null || pace < MIN_PACE_S || pace > MAX_PACE_S) {
    issues.push({
      kind: "pace",
      severity: "media",
      user_id: activity.user_id,
      activity_id: activity.id,
      dedupe_key: activityKey("pace", activity.id),
      detail: pace === null ? "Pace não pôde ser calculado." : `Pace de ${Math.round(pace)} s/km fora do intervalo aceito.`,
    });
  } else {
    resolved.push(activityKey("pace", activity.id));
  }

  if (duplicateIds.has(activity.id)) {
    issues.push({
      kind: "duplicidade",
      severity: "alta",
      user_id: activity.user_id,
      activity_id: activity.id,
      dedupe_key: activityKey("duplicidade", activity.id),
      detail: "Existe outra atividade com o mesmo horário e distância. Não deve pontuar duas vezes.",
    });
  } else {
    resolved.push(activityKey("duplicidade", activity.id));
  }

  if (!activity.shoe_id) {
    issues.push({
      kind: "sem_tenis",
      severity: "baixa",
      user_id: activity.user_id,
      activity_id: activity.id,
      dedupe_key: activityKey("sem_tenis", activity.id),
      detail: `"${activity.title || "Corrida"}" (${km.toFixed(1)} km) ainda não tem tênis associado.`,
    });
  } else {
    resolved.push(activityKey("sem_tenis", activity.id));
  }

  await openIssues(admin, issues);
  await resolveIssues(admin, resolved);
  await admin.from("data_quality_issues")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("dedupe_key", activityKey("pendente", activity.id))
    .eq("status", "open");

  const blocking = issues.some((issue) => issue.severity === "alta");
  return { status: blocking ? "rejected" : "validated", issues, resolved };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const secret = Deno.env.get("STEWARD_SECRET");
  if (!secret) return json({ error: "Agente de dados não configurado." }, 503);
  if (req.headers.get("x-steward-secret") !== secret) return json({ error: "Não autorizado." }, 401);

  const admin = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  const runId = crypto.randomUUID();
  await admin.from("steward_runs").insert({ id: runId, status: "running" });

  let checked = 0;
  let validated = 0;
  let rejected = 0;
  const affectedUsers = new Set<string>();

  try {
    // Candidatos a duplicidade (mesmo dono, mesmo horário e distância).
    const { data: duplicates } = await admin
      .from("duplicate_activity_candidates")
      .select("id, copies")
      .gt("copies", 1);
    const duplicateIds = new Set<string>((duplicates ?? []).map((row: { id: string }) => row.id));

    let from = 0;
    while (true) {
      const { data, error } = await admin
        .from("activities")
        .select("id, user_id, shoe_id, distance_m, moving_time_s, started_at, activity_type, title, status")
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw new Error(`Falha ao ler atividades: ${error.message}`);
      const rows = (data ?? []) as ActivityRow[];
      if (rows.length === 0) break;

      for (const activity of rows) {
        const outcome = await classifyActivity(admin, activity, duplicateIds);
        checked += 1;
        affectedUsers.add(activity.user_id);
        if (outcome.status !== activity.status) {
          await admin.from("activities").update({
            status: outcome.status,
            updated_at: new Date().toISOString(),
          }).eq("id", activity.id);
        }
        if (outcome.status === "validated") validated += 1;
        if (outcome.status === "rejected") rejected += 1;
      }

      if (rows.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    // Tênis no limite de troca.
    const { data: heavyShoes } = await admin
      .from("shoe_mileage")
      .select("user_id, shoe_id, km")
      .gte("km", 800);

    const shoeIssues: Issue[] = (heavyShoes ?? []).map((row: { user_id: string; shoe_id: string; km: number }) => ({
      kind: "tenis_desgastado",
      severity: "media",
      user_id: row.user_id,
      shoe_id: row.shoe_id,
      dedupe_key: `tenis_desgastado:${row.shoe_id}`,
      detail: `Par com ${row.km} km validados — acima do limite sugerido de 800 km.`,
    }));
    await openIssues(admin, shoeIssues);

    // Recalcula PP, bônus e medalhas de quem foi tocado pela varredura.
    for (const userId of affectedUsers) {
      const { error } = await admin.rpc("recalculate_user_progress", { p_user: userId });
      if (error) throw new Error(`Falha ao recalcular progresso de ${userId}: ${error.message}`);
    }

    // Higiene: estados OAuth expirados não podem ser reaproveitados.
    await admin.from("strava_oauth_states").delete().lt("expires_at", new Date().toISOString());

    const { count: openIssuesCount } = await admin
      .from("data_quality_issues")
      .select("id", { count: "exact", head: true })
      .eq("status", "open");

    const summary = `${checked} atividades verificadas, ${validated} validadas, ${rejected} rejeitadas, ${openIssuesCount ?? 0} pendências abertas.`;

    await admin.from("steward_runs").update({
      status: "succeeded",
      finished_at: new Date().toISOString(),
      checked_activities: checked,
      issues_open: openIssuesCount ?? 0,
      summary,
    }).eq("id", runId);

    return json({ ok: true, run_id: runId, checked, validated, rejected, issues_open: openIssuesCount ?? 0, users: affectedUsers.size, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("Data steward failed", message);
    await admin.from("steward_runs").update({
      status: "failed",
      finished_at: new Date().toISOString(),
      checked_activities: checked,
      summary: message.slice(0, 500),
    }).eq("id", runId);
    return json({ ok: false, run_id: runId, error: "Falha na auditoria de dados." }, 500);
  }
});
