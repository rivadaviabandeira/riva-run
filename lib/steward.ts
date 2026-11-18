/**
 * Agente de dados do PaceHub (versão local).
 *
 * O agente é responsável por manter a base confiável: encontra duplicidades,
 * atividades pendentes há muito tempo, quilometragens implausíveis, corridas
 * sem tênis associado e tênis no limite de troca. No app ele roda sob demanda
 * na tela de Perfil; no servidor a mesma verificação é executada pela função
 * agendada `supabase/functions/data-steward`.
 */
import {
  MAX_REALISTIC_PACE_S,
  MIN_REALISTIC_PACE_S,
  MIN_RUN_DISTANCE_KM,
  MAX_RUN_DISTANCE_KM,
  SHOE_REPLACE_KM,
  formatDecimal,
  formatPace,
  paceSecondsOf,
  round1,
} from "./domain";
import type { Activity, Shoe } from "./data/types";

export type StewardSeverity = "alta" | "média" | "baixa";

export type StewardIssue = {
  id: string;
  severity: StewardSeverity;
  kind: "duplicidade" | "pendente" | "sem_tenis" | "distancia" | "pace" | "tenis_desgastado";
  title: string;
  detail: string;
  activityId?: string;
  shoeId?: string;
};

export type StewardReport = {
  checkedAt: string;
  checkedActivities: number;
  checkedShoes: number;
  issues: StewardIssue[];
  summary: string;
};

const SEVERITY_ORDER: Record<StewardSeverity, number> = { alta: 0, "média": 1, baixa: 2 };

export function shoeKm(activities: Activity[], shoeId: string): number {
  return round1(
    activities
      .filter((activity) => activity.status === "validated" && activity.shoeId === shoeId)
      .reduce((sum, activity) => sum + activity.distanceKm, 0),
  );
}

export function auditData(activities: Activity[], shoes: Shoe[], now: Date = new Date()): StewardReport {
  const issues: StewardIssue[] = [];

  const seen = new Map<number, string>();
  for (const activity of activities) {
    const duplicate = seen.get(activity.externalId);
    if (duplicate) {
      issues.push({
        id: `duplicidade-${activity.id}`,
        severity: "alta",
        kind: "duplicidade",
        title: "Atividade duplicada",
        detail: `A atividade ${activity.externalId} já existe como "${duplicate}". Não deve pontuar duas vezes.`,
        activityId: activity.id,
      });
    } else {
      seen.set(activity.externalId, activity.title);
    }
  }

  for (const activity of activities) {
    if (activity.status === "pending") {
      const hours = (now.getTime() - new Date(activity.startedAt).getTime()) / 3_600_000;
      issues.push({
        id: `pendente-${activity.id}`,
        severity: hours > 24 ? "baixa" : "média",
        kind: "pendente",
        title: "Importação aguardando revisão",
        detail: `${activity.title} · ${formatDecimal(activity.distanceKm)} km importados do Strava precisam de validação.`,
        activityId: activity.id,
      });
      continue;
    }

    if (activity.status !== "validated") continue;

    if (activity.distanceKm < MIN_RUN_DISTANCE_KM || activity.distanceKm > MAX_RUN_DISTANCE_KM) {
      issues.push({
        id: `distancia-${activity.id}`,
        severity: "alta",
        kind: "distancia",
        title: "Distância fora da faixa aceita",
        detail: `${formatDecimal(activity.distanceKm)} km em "${activity.title}" — a faixa aceita é de ${MIN_RUN_DISTANCE_KM} a ${MAX_RUN_DISTANCE_KM} km.`,
        activityId: activity.id,
      });
    }

    const pace = paceSecondsOf(activity);
    if (pace !== null && (pace < MIN_REALISTIC_PACE_S || pace > MAX_REALISTIC_PACE_S)) {
      issues.push({
        id: `pace-${activity.id}`,
        severity: "média",
        kind: "pace",
        title: "Pace implausível",
        detail: `${formatPace(pace)}/km em "${activity.title}" está fora do intervalo aceito para corrida de rua.`,
        activityId: activity.id,
      });
    }

    if (!activity.shoeId) {
      issues.push({
        id: `sem-tenis-${activity.id}`,
        severity: "baixa",
        kind: "sem_tenis",
        title: "Corrida sem tênis associado",
        detail: `"${activity.title}" (${formatDecimal(activity.distanceKm)} km) não entra na quilometragem de nenhum par.`,
        activityId: activity.id,
      });
    }
  }

  for (const shoe of shoes) {
    const km = shoeKm(activities, shoe.id);
    if (km >= SHOE_REPLACE_KM) {
      issues.push({
        id: `tenis-${shoe.id}`,
        severity: "média",
        kind: "tenis_desgastado",
        title: "Tênis no limite de troca",
        detail: `${shoe.brand} ${shoe.model} já soma ${formatDecimal(km)} km (limite sugerido ${SHOE_REPLACE_KM} km).`,
        shoeId: shoe.id,
      });
    }
  }

  issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const high = issues.filter((issue) => issue.severity === "alta").length;
  return {
    checkedAt: now.toISOString(),
    checkedActivities: activities.length,
    checkedShoes: shoes.length,
    issues,
    summary:
      issues.length === 0
        ? `Nenhum problema encontrado em ${activities.length} atividades.`
        : `${issues.length} ponto(s) de atenção, ${high} crítico(s).`,
  };
}
