/**
 * Regras de negócio do PaceHub.
 *
 * Módulo puro (sem React Native, sem acesso a rede) para poder ser reutilizado
 * pelo app, pelos testes e pelo agente de dados. Toda pontuação exibida ao
 * corredor sai daqui: 1 km validado = 1 PP, meta semanal = +5 PP, desafio
 * concluído = +15 PP e desconto na PaceStore limitado a 20% do preço.
 */

export const PP_PER_KM = 1;
export const WEEKLY_GOAL_RUNS = 3;
export const WEEKLY_GOAL_KM = 30;
export const WEEKLY_BONUS_PP = 5;
export const CHALLENGE_BONUS_PP = 15;
export const MAX_ACTIVE_SHOES = 5;
export const PP_VALUE_BRL = 0.1;
export const MAX_DISCOUNT_RATE = 0.2;
export const MIN_RUN_DISTANCE_KM = 1;
export const MAX_RUN_DISTANCE_KM = 100;
export const SHOE_REPLACE_KM = 800;
export const MIN_REALISTIC_PACE_S = 150; // 2:30/km
export const MAX_REALISTIC_PACE_S = 720; // 12:00/km

export type ActivityStatus = "pending" | "validated" | "rejected";

export type DomainActivity = {
  distanceKm: number;
  movingTimeS: number;
  startedAt: string;
  status: ActivityStatus;
};

/* ------------------------------------------------------------------ *
 * Formatação
 * ------------------------------------------------------------------ */

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export const round1 = (value: number) => Math.round(value * 10) / 10;
const round2 = (value: number) => Math.round(value * 100) / 100;

/** 75.5 -> "75,5" */
export const formatDecimal = (value: number) => round1(value).toFixed(1).replace(".", ",");

/** 103.92 -> "R$ 103,92" */
export const formatBRL = (value: number) => `R$ ${value.toFixed(2).replace(".", ",")}`;

/** 318 -> "05:18" (segundos por km) */
export function formatPace(secondsPerKm: number | null | undefined): string {
  if (!secondsPerKm || !Number.isFinite(secondsPerKm)) return "--:--";
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.round(secondsPerKm % 60);
  if (seconds === 60) return formatPace(secondsPerKm + 1);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** 3720 -> "1h 02min" */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${String(minutes).padStart(2, "0")}min` : `${minutes}min`;
}

/** ISO -> "12 nov" */
export function formatShortDate(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getDate()).padStart(2, "0")} ${MONTHS[date.getMonth()]}`;
}

/** ISO -> "há 2 h" */
export function formatRelative(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "nunca";
  const diffMinutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  if (diffMinutes < 1) return "agora";
  if (diffMinutes < 60) return `há ${diffMinutes} min`;
  const hours = Math.round(diffMinutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "há 1 dia" : `há ${days} dias`;
}

/* ------------------------------------------------------------------ *
 * Semanas e pace
 * ------------------------------------------------------------------ */

const DAY_MS = 86_400_000;

/** Segunda-feira 00:00 do horário local. */
export function startOfWeek(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const offset = (result.getDay() + 6) % 7; // segunda = 0
  result.setDate(result.getDate() - offset);
  return result;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime() + days * DAY_MS);
  return result;
}

/** Chave da semana (AAAA-MM-DD da segunda-feira). */
export function weekKey(date: Date): string {
  const monday = startOfWeek(date);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(
    monday.getDate(),
  ).padStart(2, "0")}`;
}

export function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function paceSecondsOf(activity: { distanceKm: number; movingTimeS: number }): number | null {
  if (!activity.distanceKm || activity.distanceKm < 0.1 || !activity.movingTimeS) return null;
  return activity.movingTimeS / activity.distanceKm;
}

export const validated = <T extends { status: ActivityStatus }>(activities: T[]): T[] =>
  activities.filter((activity) => activity.status === "validated");

/**
 * Atividade que conta para pontuação, meta semanal, sequência e melhor pace.
 *
 * Espelha o recorte de `public.recalculate_user_progress`
 * (`distance_m between 1000 and 100000`): um trote de 900 m não rende PP, não
 * fecha a meta de treinos e não vira recorde de pace.
 */
export const countsForPoints = <T extends { status: ActivityStatus; distanceKm: number }>(
  activity: T,
): boolean =>
  activity.status === "validated" &&
  activity.distanceKm >= MIN_RUN_DISTANCE_KM &&
  activity.distanceKm <= MAX_RUN_DISTANCE_KM;

export function totalValidatedKm(activities: DomainActivity[]): number {
  return round1(activities.filter(countsForPoints).reduce((sum, activity) => sum + activity.distanceKm, 0));
}

/**
 * Melhor pace das atividades que pontuam. O banco ignora atividades sem tempo
 * de movimento e paces abaixo de 2:30/km (dado implausível); aqui também.
 */
export function bestPaceSeconds(activities: DomainActivity[]): number | null {
  let best: number | null = null;
  for (const activity of activities.filter(countsForPoints)) {
    const pace = paceSecondsOf(activity);
    if (pace === null || pace < MIN_REALISTIC_PACE_S) continue;
    if (best === null || pace < best) best = pace;
  }
  return best;
}

export type WeekSummary = {
  key: string;
  startsAt: Date;
  runs: number;
  km: number;
  goalMet: boolean;
};

/** Resumo das semanas com atividades, da mais recente para a mais antiga. */
export function summarizeWeeks(activities: DomainActivity[]): WeekSummary[] {
  const weeks = new Map<string, WeekSummary>();
  for (const activity of activities.filter(countsForPoints)) {
    const startedAt = new Date(activity.startedAt);
    const key = weekKey(startedAt);
    const current = weeks.get(key) ?? {
      key,
      startsAt: startOfWeek(startedAt),
      runs: 0,
      km: 0,
      goalMet: false,
    };
    current.runs += 1;
    current.km = round1(current.km + activity.distanceKm);
    weeks.set(key, current);
  }
  return [...weeks.values()]
    .map((week) => ({ ...week, goalMet: week.runs >= WEEKLY_GOAL_RUNS }))
    .sort((a, b) => (a.key < b.key ? 1 : -1));
}

export function currentWeekSummary(activities: DomainActivity[], now: Date = new Date()): WeekSummary {
  const key = weekKey(now);
  const match = summarizeWeeks(activities).find((week) => week.key === key);
  return match ?? { key, startsAt: startOfWeek(now), runs: 0, km: 0, goalMet: false };
}

/**
 * Semanas consecutivas com a meta cumprida.
 * A semana em andamento só entra na contagem quando a meta já foi batida.
 */
export function weeklyStreak(activities: DomainActivity[], now: Date = new Date()): number {
  const met = new Set(summarizeWeeks(activities).filter((week) => week.goalMet).map((week) => week.key));
  let cursor = startOfWeek(now);
  if (!met.has(weekKey(cursor))) cursor = addDays(cursor, -7);
  let streak = 0;
  while (met.has(weekKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -7);
  }
  return streak;
}

/* ------------------------------------------------------------------ *
 * Pontuação e nível
 * ------------------------------------------------------------------ */

export const CAREER_LEVELS = [
  { level: 1, minXp: 0, title: "Corredor Iniciante" },
  { level: 2, minXp: 50, title: "Corredor Constante" },
  { level: 3, minXp: 200, title: "Corredor Dedicado" },
  { level: 4, minXp: 500, title: "Corredor Forte" },
  { level: 5, minXp: 1000, title: "Corredor de Elite" },
];

export type CareerProgress = {
  level: number;
  title: string;
  minXp: number;
  nextXp: number | null;
  remaining: number;
  progress: number;
  maxed: boolean;
};

export function careerProgress(xp: number): CareerProgress {
  const current = [...CAREER_LEVELS].reverse().find((entry) => xp >= entry.minXp) ?? CAREER_LEVELS[0];
  const next = CAREER_LEVELS.find((entry) => entry.minXp > xp) ?? null;
  const span = next ? next.minXp - current.minXp : 1;
  const done = next ? xp - current.minXp : span;
  return {
    level: current.level,
    title: current.title,
    minXp: current.minXp,
    nextXp: next ? next.minXp : null,
    remaining: next ? round1(next.minXp - xp) : 0,
    progress: next ? Math.min(1, Math.max(0, done / span)) : 1,
    maxed: !next,
  };
}

export type PointsInput = {
  activities: DomainActivity[];
  challengesCompleted?: number;
  now?: Date;
};

export type PointsBreakdown = {
  kmPoints: number;
  weeklyBonus: number;
  challengeBonus: number;
  lifetime: number;
};

/** PP acumulados (XP de carreira) — nunca diminui com resgates. */
export function pointsBreakdown({
  activities,
  challengesCompleted = 0,
  now = new Date(),
}: PointsInput): PointsBreakdown {
  const kmPoints = round1(totalValidatedKm(activities) * PP_PER_KM);
  const weeksMet = summarizeWeeks(activities).filter((week) => week.goalMet).length;
  const weeklyBonus = weeksMet * WEEKLY_BONUS_PP;
  const challengeBonus = Math.max(0, challengesCompleted) * CHALLENGE_BONUS_PP;
  return {
    kmPoints,
    weeklyBonus,
    challengeBonus,
    lifetime: round1(kmPoints + weeklyBonus + challengeBonus),
  };
}

/* ------------------------------------------------------------------ *
 * Conquistas
 * ------------------------------------------------------------------ */

export type AchievementMetric = "runs" | "streak" | "pace";
export type AchievementCategory = "passos" | "constancia" | "performance";

export type Achievement = {
  id: string;
  category: AchievementCategory;
  title: string;
  description: string;
  metric: AchievementMetric;
  target: number;
};

export const ACHIEVEMENT_CATEGORIES: {
  id: AchievementCategory;
  title: string;
  icon: string;
  color: string;
}[] = [
  { id: "passos", title: "Primeiros passos", icon: "flag-outline", color: "#B8F34A" },
  { id: "constancia", title: "Constância", icon: "calendar-outline", color: "#65B8FF" },
  { id: "performance", title: "Performance", icon: "speedometer-outline", color: "#E6B84B" },
];

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "passos-1",
    category: "passos",
    title: "Primeira corrida",
    description: "Tenha sua primeira atividade validada no PaceHub.",
    metric: "runs",
    target: 1,
  },
  {
    id: "passos-2",
    category: "passos",
    title: "Ritmo de rotina",
    description: "Acumule 10 corridas validadas.",
    metric: "runs",
    target: 10,
  },
  {
    id: "passos-3",
    category: "passos",
    title: "Colecionador de km",
    description: "Acumule 50 corridas validadas.",
    metric: "runs",
    target: 50,
  },
  {
    id: "constancia-1",
    category: "constancia",
    title: "Semana completa",
    description: "Cumpra a meta de 3 treinos em uma semana.",
    metric: "streak",
    target: 1,
  },
  {
    id: "constancia-2",
    category: "constancia",
    title: "Mês em movimento",
    description: "Cumpra a meta semanal por 4 semanas seguidas.",
    metric: "streak",
    target: 4,
  },
  {
    id: "constancia-3",
    category: "constancia",
    title: "Temporada perfeita",
    description: "Cumpra a meta semanal por 12 semanas seguidas.",
    metric: "streak",
    target: 12,
  },
  {
    id: "performance-1",
    category: "performance",
    title: "Abaixo de 5:30",
    description: "Registre um pace de 5:30/km ou melhor.",
    metric: "pace",
    target: 330,
  },
  {
    id: "performance-2",
    category: "performance",
    title: "Abaixo de 5:00",
    description: "Registre um pace de 5:00/km ou melhor.",
    metric: "pace",
    target: 300,
  },
  {
    id: "performance-3",
    category: "performance",
    title: "Abaixo de 4:30",
    description: "Registre um pace de 4:30/km ou melhor.",
    metric: "pace",
    target: 270,
  },
];

export type RunnerStats = {
  validatedRuns: number;
  totalKm: number;
  bestPaceS: number | null;
  weeklyStreak: number;
};

export type AchievementView = {
  spec: Achievement;
  unlocked: boolean;
  progress: number;
  value: number;
  valueLabel: string;
};

export function achievementView(spec: Achievement, stats: RunnerStats): AchievementView {
  if (spec.metric === "runs") {
    const value = stats.validatedRuns;
    return {
      spec,
      unlocked: value >= spec.target,
      progress: Math.min(1, value / spec.target),
      value,
      valueLabel:
        value >= spec.target ? `${value} corridas validadas` : `${value} de ${spec.target} corridas`,
    };
  }
  if (spec.metric === "streak") {
    const value = stats.weeklyStreak;
    return {
      spec,
      unlocked: value >= spec.target,
      progress: Math.min(1, value / spec.target),
      value,
      valueLabel: value >= spec.target ? `${value} semanas na meta` : `${value} de ${spec.target} semanas`,
    };
  }
  const best = stats.bestPaceS;
  if (best === null) {
    return {
      spec,
      unlocked: false,
      progress: 0,
      value: 0,
      valueLabel: `Meta ${formatPace(spec.target)}/km`,
    };
  }
  const unlocked = best <= spec.target;
  return {
    spec,
    unlocked,
    progress: unlocked ? 1 : Math.min(0.99, spec.target / best),
    value: best,
    valueLabel: `Melhor ${formatPace(best)} · meta ${formatPace(spec.target)}`,
  };
}

export function evaluateAchievements(stats: RunnerStats): AchievementView[] {
  return ACHIEVEMENTS.map((spec) => achievementView(spec, stats));
}

/* ------------------------------------------------------------------ *
 * Desafios
 * ------------------------------------------------------------------ */

export type ChallengeMetric = "km_week" | "runs_month" | "long_runs_month";

export type ChallengeProgress = {
  current: number;
  target: number;
  unit: string;
  pct: number;
  done: boolean;
};

export function challengeProgress(
  metric: ChallengeMetric,
  target: number,
  activities: DomainActivity[],
  now: Date = new Date(),
): ChallengeProgress {
  const runs = validated(activities);
  let current = 0;
  let unit = "km";

  if (metric === "km_week") {
    const key = weekKey(now);
    current = round1(
      runs
        .filter((activity) => weekKey(new Date(activity.startedAt)) === key)
        .reduce((sum, activity) => sum + activity.distanceKm, 0),
    );
  } else {
    const monthRuns = runs.filter((activity) => sameMonth(new Date(activity.startedAt), now));
    unit = "corridas";
    current =
      metric === "runs_month"
        ? monthRuns.length
        : monthRuns.filter((activity) => activity.distanceKm >= 10).length;
  }

  return {
    current,
    target,
    unit,
    pct: Math.min(1, current / target),
    done: current >= target,
  };
}

/* ------------------------------------------------------------------ *
 * PaceStore
 * ------------------------------------------------------------------ */

export type Discount = {
  discountBRL: number;
  ppUsed: number;
  finalPriceBRL: number;
  maxPP: number;
  limitedBy: "regra" | "saldo";
};

/** Desconto máximo permitido pela regra (20% do produto). */
export function maxDiscountPP(priceBRL: number): number {
  return round1((priceBRL * MAX_DISCOUNT_RATE) / PP_VALUE_BRL);
}

/** 1 PP = R$ 0,10, com teto de 20% do preço e do saldo disponível. */
export function ppDiscount(priceBRL: number, balancePP: number): Discount {
  const maxByRule = priceBRL * MAX_DISCOUNT_RATE;
  const maxByBalance = Math.max(0, balancePP) * PP_VALUE_BRL;
  const discount = Math.min(maxByRule, maxByBalance);
  return {
    discountBRL: round2(discount),
    ppUsed: round1(discount / PP_VALUE_BRL),
    finalPriceBRL: round2(priceBRL - discount),
    maxPP: maxDiscountPP(priceBRL),
    limitedBy: maxByBalance < maxByRule ? "saldo" : "regra",
  };
}

/* ------------------------------------------------------------------ *
 * Ranking
 * ------------------------------------------------------------------ */

export type RankBand = { label: string; color: string };

export const RANK_BANDS: { until: number; label: string; color: string }[] = [
  { until: 3, label: "1º–3º", color: "#E6B84B" },
  { until: 10, label: "4º–10º", color: "#65B8FF" },
  { until: 20, label: "11º–20º", color: "#69D6A5" },
  { until: Number.POSITIVE_INFINITY, label: "21º+", color: "#82909A" },
];

export function rankBand(position: number): RankBand {
  const band = RANK_BANDS.find((item) => position <= item.until) ?? RANK_BANDS[RANK_BANDS.length - 1];
  return { label: band.label, color: band.color };
}

/* ------------------------------------------------------------------ *
 * Treinos prescritos (modo treinador)
 *
 * O treinador monta a semana de cada atleta escolhendo o tipo de sessão, a
 * distância e o pace alvo. O pace de cada tipo sai do pace base do atleta
 * (mesma ideia de zonas usada pelo app ZYLA) e a revisão da semana barra
 * aumentos de volume acima de 10%, excesso de sessões intensas e falta de
 * descanso — os erros que mais lesionam corredores.
 * ------------------------------------------------------------------ */

export const WEEKDAYS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"] as const;

export type AthleteLevel = "iniciante" | "intermediario" | "avancado";
export type TrainingGoal = "5k" | "10k" | "21k" | "42k";
export type SessionTypeId =
  | "regenerativo"
  | "leve"
  | "longao"
  | "tempo"
  | "intervalado"
  | "prova";

export type SessionType = {
  id: SessionTypeId;
  label: string;
  purpose: string;
  icon: string;
  color: string;
  /** Multiplicador do pace base: acima de 1 é mais leve, abaixo é mais forte. */
  paceFactor: number;
  /** Sessão intensa: entra no limite semanal de qualidade. */
  quality: boolean;
  /** Fração típica do volume da semana. */
  volumeShare: number;
};

export const SESSION_TYPES: SessionType[] = [
  {
    id: "regenerativo",
    label: "Regenerativo",
    purpose: "Soltar as pernas e acelerar a recuperação.",
    icon: "heart-outline",
    color: "#69D6A5",
    paceFactor: 1.16,
    quality: false,
    volumeShare: 0.1,
  },
  {
    id: "leve",
    label: "Rodagem leve",
    purpose: "Base aeróbica em ritmo de conversa.",
    icon: "walk-outline",
    color: "#65B8FF",
    paceFactor: 1.08,
    quality: false,
    volumeShare: 0.16,
  },
  {
    id: "longao",
    label: "Longão",
    purpose: "Resistência e eficiência para a prova-alvo.",
    icon: "map-outline",
    color: "#E6B84B",
    paceFactor: 1.05,
    quality: false,
    volumeShare: 0.3,
  },
  {
    id: "tempo",
    label: "Tempo run",
    purpose: "Ritmo de prova e limiar confortável.",
    icon: "speedometer-outline",
    color: "#FFA24C",
    paceFactor: 0.94,
    quality: true,
    volumeShare: 0.14,
  },
  {
    id: "intervalado",
    label: "Intervalado",
    purpose: "VO2: tiros curtos e fortes com trote entre eles.",
    icon: "flash-outline",
    color: "#FF8A7A",
    paceFactor: 0.9,
    quality: true,
    volumeShare: 0.12,
  },
  {
    id: "prova",
    label: "Prova / simulado",
    purpose: "Ensaio do ritmo e da estratégia do dia da prova.",
    icon: "trophy-outline",
    color: "#B8F34A",
    paceFactor: 1,
    quality: true,
    volumeShare: 0.18,
  },
];

export const sessionType = (id: SessionTypeId): SessionType =>
  SESSION_TYPES.find((type) => type.id === id) ?? SESSION_TYPES[1];

export type AthleteLevelRule = {
  id: AthleteLevel;
  label: string;
  maxDays: number;
  maxQuality: number;
  maxGrowth: number;
};

export const ATHLETE_LEVELS: AthleteLevelRule[] = [
  { id: "iniciante", label: "Iniciante", maxDays: 3, maxQuality: 1, maxGrowth: 1.05 },
  { id: "intermediario", label: "Intermediário", maxDays: 5, maxQuality: 2, maxGrowth: 1.08 },
  { id: "avancado", label: "Avançado", maxDays: 6, maxQuality: 3, maxGrowth: 1.1 },
];

export const levelRules = (level: AthleteLevel): AthleteLevelRule =>
  ATHLETE_LEVELS.find((rule) => rule.id === level) ?? ATHLETE_LEVELS[1];

export const GOALS: { id: TrainingGoal; label: string; distanceKm: number }[] = [
  { id: "5k", label: "5 km", distanceKm: 5 },
  { id: "10k", label: "10 km", distanceKm: 10 },
  { id: "21k", label: "21 km", distanceKm: 21.1 },
  { id: "42k", label: "42 km", distanceKm: 42.2 },
];

export const goalLabel = (goal: TrainingGoal) =>
  GOALS.find((item) => item.id === goal)?.label ?? goal;

export type TrainingSession = {
  id: string;
  athleteId: string;
  /** Início previsto do treino (ISO). */
  date: string;
  typeId: SessionTypeId;
  distanceKm: number;
  targetPaceS: number;
  note: string;
  done: boolean;
};

/** Pace alvo de um tipo de sessão a partir do pace base do atleta. */
export function targetPaceS(basePaceS: number, typeId: SessionTypeId): number {
  const base = basePaceS > 0 ? basePaceS : 330;
  return Math.round(base * sessionType(typeId).paceFactor);
}

const sessionNote = (typeId: SessionTypeId, distanceKm: number): string => {
  const km = Math.max(1, distanceKm);
  switch (typeId) {
    case "regenerativo":
      return "Ritmo de conversa, foco em soltar as pernas.";
    case "leve":
      return `${formatDecimal(km)} km contínuos, respiração confortável.`;
    case "longao":
      return "Ritmo constante; últimos 2 km um pouco mais fortes.";
    case "tempo":
      return `2 km de aquecimento + ${formatDecimal(Math.max(1, km - 3))} km no limiar + 1 km de trote.`;
    case "intervalado":
      return `${Math.max(4, Math.round(km * 1.2))}x 800 m forte com 2 min de trote entre os tiros.`;
    case "prova":
      return `Simulado de ${formatDecimal(km)} km no ritmo de prova.`;
    default:
      return "";
  }
};

/** Dias da semana (segunda = 0) e tipos usados em cada frequência. */
const DAY_PATTERNS: Record<number, number[]> = {
  2: [1, 5],
  3: [1, 3, 5],
  4: [0, 2, 4, 5],
  5: [0, 1, 3, 4, 5],
  6: [0, 1, 2, 3, 4, 5],
};

const TYPE_PATTERNS: Record<number, SessionTypeId[]> = {
  2: ["leve", "longao"],
  3: ["leve", "intervalado", "longao"],
  4: ["leve", "intervalado", "regenerativo", "longao"],
  5: ["leve", "intervalado", "regenerativo", "tempo", "longao"],
  6: ["regenerativo", "leve", "intervalado", "regenerativo", "tempo", "longao"],
};

const GOAL_VOLUME_FACTOR: Record<TrainingGoal, number> = {
  "5k": 0.9,
  "10k": 1,
  "21k": 1.05,
  "42k": 1.12,
};

export type SessionDraft = {
  weekday: number;
  typeId: SessionTypeId;
  distanceKm: number;
  targetPaceS: number;
  note: string;
};

export type PlanRequest = {
  goal: TrainingGoal;
  level: AthleteLevel;
  basePaceS: number;
  weeklyKm: number;
  daysPerWeek: number;
};

/**
 * Semana de treinos a partir do perfil do atleta. Os dias são escolhidos para
 * nunca deixar duas sessões intensas seguidas e o volume cresce no máximo 10%.
 */
export function planWeek({ goal, level, basePaceS, weeklyKm, daysPerWeek }: PlanRequest): SessionDraft[] {
  const rules = levelRules(level);
  const days = Math.max(2, Math.min(rules.maxDays, Math.round(daysPerWeek || 3)));
  const weekdays = DAY_PATTERNS[days] ?? DAY_PATTERNS[3];
  const types = (TYPE_PATTERNS[days] ?? TYPE_PATTERNS[3]).slice(0, days);
  const share = types.reduce((sum, id) => sum + sessionType(id).volumeShare, 0);
  // A prova-alvo ajusta o volume dentro da faixa segura do nível: o plano nunca
  // fica mais de 10% acima da média recente do atleta.
  const growth = Math.min(1.1, rules.maxGrowth + (GOAL_VOLUME_FACTOR[goal] - 1));
  const total = round1(Math.max(6, weeklyKm > 0 ? weeklyKm : 18) * growth);

  return types.map((typeId, index) => {
    const distanceKm = round1((total * sessionType(typeId).volumeShare) / share);
    return {
      weekday: weekdays[index] ?? index,
      typeId,
      distanceKm,
      targetPaceS: targetPaceS(basePaceS, typeId),
      note: sessionNote(typeId, distanceKm),
    };
  });
}

/** Sessões de uma semana, da segunda a domingo. */
export function sessionsOfWeek(
  sessions: TrainingSession[],
  reference: Date = new Date(),
): TrainingSession[] {
  const key = weekKey(reference);
  return sessions
    .filter((session) => weekKey(new Date(session.date)) === key)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type WeekAdherence = {
  done: number;
  total: number;
  kmDone: number;
  kmTotal: number;
  pct: number;
};

export function weekAdherence(sessions: TrainingSession[]): WeekAdherence {
  const done = sessions.filter((session) => session.done);
  const kmTotal = round1(sessions.reduce((sum, session) => sum + session.distanceKm, 0));
  const kmDone = round1(done.reduce((sum, session) => sum + session.distanceKm, 0));
  return {
    done: done.length,
    total: sessions.length,
    kmDone,
    kmTotal,
    pct: sessions.length > 0 ? done.length / sessions.length : 0,
  };
}

export type WeekReviewLevel = "ok" | "atencao" | "risco";

export type WeekReview = {
  level: WeekReviewLevel;
  messages: string[];
  prescribedKm: number;
  qualitySessions: number;
  restDays: number;
  longRunShare: number;
};

/**
 * Revisão da semana prescrita: volume, sessões intensas, descanso e paces.
 * Devolve avisos prontos para o treinador ver antes de liberar o plano.
 */
export function reviewWeek(
  sessions: TrainingSession[],
  athlete: { level: AthleteLevel; weeklyKm: number },
): WeekReview {
  const rules = levelRules(athlete.level);
  const messages: string[] = [];
  let level: WeekReviewLevel = "ok";

  const flag = (target: WeekReviewLevel, message: string) => {
    if (target === "risco" || level === "ok") level = target;
    messages.push(message);
  };

  if (sessions.length === 0) {
    return {
      level: "atencao",
      messages: ["Nenhum treino prescrito para esta semana."],
      prescribedKm: 0,
      qualitySessions: 0,
      restDays: 7,
      longRunShare: 0,
    };
  }

  const prescribedKm = round1(sessions.reduce((sum, session) => sum + session.distanceKm, 0));
  const qualitySessions = sessions.filter((session) => sessionType(session.typeId).quality).length;
  const usedDays = new Set(sessions.map((session) => new Date(session.date).getDay()));
  const restDays = 7 - usedDays.size;
  const longest = sessions.reduce((max, session) => Math.max(max, session.distanceKm), 0);
  const longRunShare = prescribedKm > 0 ? longest / prescribedKm : 0;

  if (athlete.weeklyKm > 0 && prescribedKm > athlete.weeklyKm * 1.1) {
    flag(
      "risco",
      `Volume de ${formatDecimal(prescribedKm)} km é mais de 10% acima da média recente (${formatDecimal(
        athlete.weeklyKm,
      )} km).`,
    );
  }
  if (qualitySessions > rules.maxQuality) {
    flag(
      "risco",
      `${qualitySessions} sessões intensas na semana; para nível ${rules.label.toLowerCase()} o limite é ${rules.maxQuality}.`,
    );
  }
  if (restDays === 0) {
    flag("risco", "Nenhum dia de descanso: inclua pelo menos uma folga na semana.");
  }
  if (longRunShare > 0.45) {
    flag(
      "atencao",
      `O treino mais longo é ${Math.round(longRunShare * 100)}% do volume da semana (ideal até 45%).`,
    );
  }

  for (const session of sessions) {
    if (session.distanceKm <= 0) {
      flag("risco", "Há treino sem distância definida.");
    }
    if (
      session.targetPaceS < MIN_REALISTIC_PACE_S ||
      session.targetPaceS > MAX_REALISTIC_PACE_S
    ) {
      flag(
        "risco",
        `Pace ${formatPace(session.targetPaceS)}/km está fora da faixa plausível (2:30 a 12:00).`,
      );
    }
  }

  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    const gapDays = Math.round(
      (new Date(current.date).getTime() - new Date(previous.date).getTime()) / DAY_MS,
    );
    if (
      gapDays === 1 &&
      sessionType(previous.typeId).quality &&
      sessionType(current.typeId).quality
    ) {
      flag("atencao", "Sessões intensas em dias consecutivos: separe-as por pelo menos 48 h.");
      break;
    }
  }

  return { level, messages, prescribedKm, qualitySessions, restDays, longRunShare };
}

/** "05:30" -> 330; devolve null para formato ou faixa inválidos. */
export function parsePaceInput(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2})\s*[:h]\s*(\d{2})$/);
  if (!match) return null;
  const seconds = Number(match[1]) * 60 + Number(match[2]);
  if (seconds < MIN_REALISTIC_PACE_S || seconds > MAX_REALISTIC_PACE_S) return null;
  return seconds;
}

/** "dias" -> rótulo curto de um dia da semana (0 = segunda). */
export const weekdayLabel = (weekday: number) => WEEKDAYS[((weekday % 7) + 7) % 7];
