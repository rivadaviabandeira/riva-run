/**
 * Hidrata o estado do app a partir do Supabase para o usuário autenticado.
 *
 * O modo demonstração (`buildDemoState`) continua existindo como atalho explícito,
 * mas quando há sessão do Supabase Auth a fonte da verdade é o banco: perfil,
 * corridas, tênis, desafios, catálogo da loja, resgates, pedidos e treinos.
 *
 * Leitura apenas: as RPCs de resgate, compra e conclusão de treino já são chamadas
 * pelas pontes em `lib/api/`. Escritas que ainda não têm RPC seguem locais e
 * desaparecem ao recarregar.
 */
import type { User } from "@supabase/supabase-js";
import { getSupabaseClient } from "../supabase";
import { round1, type ChallengeMetric, type TrainingGoal, type AthleteLevel } from "../domain";
import type {
  Activity,
  Athlete,
  Challenge,
  Product,
  Profile,
  Purchase,
  Redemption,
  Reward,
  RunState,
  Shoe,
  TrainingSession,
} from "./types";

type ProfileRow = { id: string; display_name: string; created_at: string };
type ActivityRow = {
  id: string;
  external_activity_id: number;
  title: string;
  distance_m: number;
  moving_time_s: number;
  started_at: string;
  status: "pending" | "validated" | "rejected";
  shoe_id: string | null;
};
type ShoeRow = { id: string; brand: string; model: string; created_at: string };
type ChallengeRow = {
  id: string;
  title: string;
  description: string;
  period: "weekly" | "monthly";
  ends_at: string;
};
type TaskRow = {
  challenge_id: string;
  title: string;
  description: string;
  target_value: number;
  unit: "km" | "runs" | "long_runs";
  points: number;
};
type MembershipRow = { challenge_id: string };
type RewardRow = { id: string; name: string; description: string; category: string; cost_pp: number };
type ProductRow = {
  id: string;
  name: string;
  description: string;
  origin: "propria" | "colecao" | "revenda";
  price_brl: number;
};
type RedemptionRow = {
  id: string;
  reward_id: string | null;
  reward_name: string;
  cost_pp: number;
  created_at: string;
};
type OrderRow = {
  id: string;
  product_id: string | null;
  pp_used: number;
  paid_brl: number;
  created_at: string;
};
type SessionRow = {
  id: string;
  athlete_id: string;
  scheduled_date: string;
  type_id: TrainingSession["typeId"];
  distance_km: number;
  target_pace_s: number;
  note: string;
  done: boolean;
};

const METRIC_BY_UNIT: Record<TaskRow["unit"], ChallengeMetric> = {
  km: "km_week",
  runs: "runs_month",
  long_runs: "long_runs_month",
};

const ORIGIN_BY_DB: Record<ProductRow["origin"], Product["origin"]> = {
  propria: "MARCA PRÓPRIA",
  colecao: "COLEÇÃO",
  revenda: "REVENDA",
};

const handleFromName = (name: string) => {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "");
  return `@${slug || "corredor"}`;
};

/**
 * Meta e nível ainda não são editáveis no app, então partimos de um plano base
 * coerente com o volume real das últimas quatro semanas.
 */
function buildAthlete(user: User, name: string, activities: Activity[]): Athlete {
  const now = Date.now();
  const fourWeeksAgo = now - 28 * 24 * 60 * 60 * 1000;
  const recentKm = activities
    .filter((activity) => activity.status === "validated")
    .filter((activity) => new Date(activity.startedAt).getTime() >= fourWeeksAgo)
    .reduce((sum, activity) => sum + activity.distanceKm, 0);

  const paces = activities
    .filter((activity) => activity.status === "validated" && activity.movingTimeS > 0 && activity.distanceKm > 0)
    .map((activity) => activity.movingTimeS / activity.distanceKm)
    .filter((pace) => pace >= 150 && pace <= 720);

  const basePaceS = paces.length > 0 ? Math.round(paces.reduce((a, b) => a + b, 0) / paces.length) : 360;

  const level: AthleteLevel = recentKm >= 60 ? "avancado" : recentKm >= 30 ? "intermediario" : "iniciante";
  const goal: TrainingGoal = recentKm >= 45 ? "21k" : recentKm >= 20 ? "10k" : "5k";

  return {
    id: user.id,
    name,
    level,
    goal,
    basePaceS,
    weeklyKm: round1(recentKm / 4),
    daysPerWeek: 3,
    isMe: true,
  };
}

export async function loadRemoteRunState(user: User): Promise<RunState> {
  const supabase = getSupabaseClient();

  const [
    profileResult,
    activitiesResult,
    shoesResult,
    challengesResult,
    tasksResult,
    membershipsResult,
    rewardsResult,
    productsResult,
    redemptionsResult,
    ordersResult,
    sessionsResult,
  ] = await Promise.all([
    supabase.from("profiles").select("id, display_name, created_at").eq("id", user.id).maybeSingle(),
    supabase
      .from("activities")
      .select("id, external_activity_id, title, distance_m, moving_time_s, started_at, status, shoe_id")
      .order("started_at", { ascending: false }),
    supabase.from("shoes").select("id, brand, model, created_at").is("retired_at", null),
    supabase
      .from("challenges")
      .select("id, title, description, period, ends_at")
      .eq("is_published", true)
      .order("ends_at", { ascending: true }),
    supabase
      .from("challenge_tasks")
      .select("challenge_id, title, description, target_value, unit, points"),
    supabase.from("challenge_memberships").select("challenge_id").eq("user_id", user.id),
    supabase.from("rewards").select("id, name, description, category, cost_pp").eq("is_active", true),
    supabase
      .from("products")
      .select("id, name, description, origin, price_brl")
      .eq("is_active", true),
    supabase
      .from("redemptions")
      .select("id, reward_id, reward_name, cost_pp, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("product_orders")
      .select("id, product_id, pp_used, paid_brl, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("training_sessions")
      .select("id, athlete_id, scheduled_date, type_id, distance_km, target_pace_s, note, done")
      .eq("athlete_id", user.id)
      .order("scheduled_date", { ascending: true }),
  ]);

  const firstError =
    profileResult.error ??
    activitiesResult.error ??
    shoesResult.error ??
    challengesResult.error ??
    tasksResult.error ??
    membershipsResult.error ??
    rewardsResult.error ??
    productsResult.error ??
    redemptionsResult.error ??
    ordersResult.error ??
    sessionsResult.error;

  if (firstError) {
    throw new Error(`Não foi possível carregar seus dados: ${firstError.message}`);
  }

  const profileRow = (profileResult.data ?? null) as ProfileRow | null;
  const displayName =
    profileRow?.display_name?.trim() ||
    (user.user_metadata?.display_name as string | undefined)?.trim() ||
    user.email?.split("@")[0] ||
    "Corredor";

  const activities: Activity[] = ((activitiesResult.data ?? []) as ActivityRow[]).map((row) => ({
    id: row.id,
    externalId: Number(row.external_activity_id),
    provider: "strava",
    title: row.title,
    distanceKm: round1(Number(row.distance_m) / 1000),
    movingTimeS: Number(row.moving_time_s),
    startedAt: row.started_at,
    status: row.status,
    shoeId: row.shoe_id,
  }));

  const shoes: Shoe[] = ((shoesResult.data ?? []) as ShoeRow[]).map((row) => ({
    id: row.id,
    brand: row.brand,
    model: row.model,
    addedAt: row.created_at,
  }));

  const tasks = (tasksResult.data ?? []) as TaskRow[];
  const joinedIds = new Set(((membershipsResult.data ?? []) as MembershipRow[]).map((row) => row.challenge_id));

  const challenges: Challenge[] = ((challengesResult.data ?? []) as ChallengeRow[]).flatMap((row) => {
    const task = tasks.find((item) => item.challenge_id === row.id);
    // Sem tarefa não há meta para acompanhar, então o desafio não entra na lista.
    if (!task) return [];
    return [
      {
        id: row.id,
        title: row.title,
        period: row.period === "monthly" ? "MENSAL" : "SEMANAL",
        description: row.description,
        metric: METRIC_BY_UNIT[task.unit],
        targetValue: Number(task.target_value),
        points: Number(task.points),
        endsAt: row.ends_at,
        joined: joinedIds.has(row.id),
      },
    ];
  });

  const rewards: Reward[] = ((rewardsResult.data ?? []) as RewardRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    costPP: Number(row.cost_pp),
    icon: "gift-outline",
  }));

  const products: Product[] = ((productsResult.data ?? []) as ProductRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    detail: row.description,
    origin: ORIGIN_BY_DB[row.origin],
    priceBRL: Number(row.price_brl),
    tint: "#1E2A1B",
    icon: "shirt-outline",
  }));

  const redemptions: Redemption[] = ((redemptionsResult.data ?? []) as RedemptionRow[]).map((row) => ({
    id: row.id,
    rewardId: row.reward_id ?? "",
    name: row.reward_name,
    costPP: Number(row.cost_pp),
    createdAt: row.created_at,
  }));

  const purchases: Purchase[] = ((ordersResult.data ?? []) as OrderRow[]).map((row) => ({
    id: row.id,
    productId: row.product_id ?? "",
    ppUsed: Number(row.pp_used),
    paidBRL: Number(row.paid_brl),
    createdAt: row.created_at,
  }));

  const sessions: TrainingSession[] = ((sessionsResult.data ?? []) as SessionRow[]).map((row) => ({
    id: row.id,
    athleteId: row.athlete_id,
    date: new Date(`${row.scheduled_date}T06:30:00`).toISOString(),
    typeId: row.type_id,
    distanceKm: Number(row.distance_km),
    targetPaceS: Number(row.target_pace_s),
    note: row.note,
    done: row.done,
  }));

  const profile: Profile = {
    name: displayName,
    handle: handleFromName(displayName),
    city: "",
    joinedAt: profileRow?.created_at ?? user.created_at ?? new Date().toISOString(),
  };

  return {
    profile,
    activities,
    shoes,
    challenges,
    rewards,
    products,
    redemptions,
    purchases,
    // Tokens do Strava são server-only: o app não lê strava_connections.
    strava: { connected: false, athleteName: null, lastSyncAt: null },
    athletes: [buildAthlete(user, displayName, activities)],
    sessions,
  };
}
