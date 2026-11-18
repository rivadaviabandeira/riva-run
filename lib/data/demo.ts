/**
 * Dataset demonstrativo do PaceHub.
 *
 * Enquanto não houver Supabase configurado, o app roda com este conjunto local
 * para que as regras de pontuação, conquistas, desafios e da PaceStore possam
 * ser exercitadas de ponta a ponta. Datas são relativas a "hoje" para manter a
 * semana atual e a sequência de semanas coerentes em qualquer execução.
 */
import {
  CHALLENGE_BONUS_PP,
  WEEKLY_GOAL_KM,
  addDays,
  planWeek,
  startOfWeek,
  weekKey,
} from "../domain";
import type {
  Activity,
  Athlete,
  Challenge,
  LeaderboardEntry,
  Product,
  Profile,
  Reward,
  RunState,
  Shoe,
  TrainingSession,
} from "./types";

const at = (now: Date, weekOffset: number, dayIndex: number, hour: number, minute = 15): string => {
  const monday = startOfWeek(now);
  const date = addDays(monday, weekOffset * 7 + dayIndex);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};

const endOfWeek = (now: Date): string => {
  const date = addDays(startOfWeek(now), 7);
  date.setHours(23, 59, 59, 0);
  return date.toISOString();
};

const endOfMonth = (now: Date): string => {
  const date = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 0);
  return date.toISOString();
};

type Seed = {
  weekOffset: number;
  dayIndex: number;
  hour: number;
  title: string;
  distanceKm: number;
  paceS: number;
  shoeId: string | null;
};

const SEED: Seed[] = [
  { weekOffset: 0, dayIndex: 1, hour: 6, title: "Rodagem matinal", distanceKm: 6.2, paceS: 318, shoeId: "shoe-asics" },
  { weekOffset: 0, dayIndex: 3, hour: 7, title: "Corrida leve no parque", distanceKm: 5, paceS: 330, shoeId: "shoe-nike" },
  { weekOffset: -1, dayIndex: 0, hour: 6, title: "Longão de terça", distanceKm: 8, paceS: 338, shoeId: "shoe-asics" },
  { weekOffset: -1, dayIndex: 2, hour: 19, title: "Rodagem noturna", distanceKm: 5.5, paceS: 338, shoeId: "shoe-nike" },
  { weekOffset: -1, dayIndex: 4, hour: 6, title: "Progressivo", distanceKm: 6, paceS: 336, shoeId: "shoe-asics" },
  { weekOffset: -2, dayIndex: 1, hour: 6, title: "Rodagem de bairro", distanceKm: 7, paceS: 348, shoeId: "shoe-asics" },
  { weekOffset: -2, dayIndex: 3, hour: 18, title: "Trote regenerativo", distanceKm: 4, paceS: 354, shoeId: "shoe-nike" },
  { weekOffset: -2, dayIndex: 5, hour: 7, title: "Corrida de sábado", distanceKm: 5, paceS: 354, shoeId: "shoe-asics" },
  { weekOffset: -3, dayIndex: 0, hour: 6, title: "Intervalado na pista", distanceKm: 8.5, paceS: 348, shoeId: "shoe-asics" },
  { weekOffset: -3, dayIndex: 2, hour: 19, title: "Rodagem curta", distanceKm: 5, paceS: 348, shoeId: "shoe-nike" },
  { weekOffset: -3, dayIndex: 4, hour: 6, title: "Corrida leve", distanceKm: 4, paceS: 354, shoeId: "shoe-asics" },
  { weekOffset: -4, dayIndex: 1, hour: 6, title: "Primeira rodagem do mês", distanceKm: 4.5, paceS: 360, shoeId: "shoe-nike" },
  { weekOffset: -4, dayIndex: 3, hour: 20, title: "Corrida noturna", distanceKm: 3.8, paceS: 366, shoeId: null },
  { weekOffset: -4, dayIndex: 5, hour: 7, title: "Trote de recuperação", distanceKm: 3, paceS: 378, shoeId: null },
];

export const DEMO_PROFILE: Profile = {
  name: "Lucas Almeida",
  handle: "@lucasalmeida",
  city: "São Paulo, SP",
  joinedAt: "2026-08-04T12:00:00.000Z",
};

export const DEMO_SHOES: Shoe[] = [
  { id: "shoe-asics", brand: "ASICS", model: "Novablast 4", addedAt: "2026-08-10T12:00:00.000Z" },
  { id: "shoe-nike", brand: "NIKE", model: "Pegasus 41", addedAt: "2026-09-02T12:00:00.000Z" },
];

/** Importação pendente de revisão — o agente de dados precisa decidir sobre ela. */
const pendingActivity = (now: Date): Activity => ({
  id: "act-pending",
  externalId: 900777,
  provider: "strava",
  title: "Treino importado do Strava",
  distanceKm: 12.4,
  movingTimeS: 3968,
  startedAt: at(now, 0, 0, 5, 40),
  status: "pending",
  shoeId: null,
});

export const DEMO_REWARDS: Reward[] = [
  {
    id: "rw-inscricao",
    name: "Desconto na inscrição",
    description: "R$ 10 de desconto em qualquer prova PaceHub.",
    category: "Desconto",
    costPP: 50,
    icon: "ticket-outline",
  },
  {
    id: "rw-camisa",
    name: "Camisa oficial",
    description: "Camisa oficial PaceHub. Tamanho escolhido no resgate.",
    category: "Vestuário",
    costPP: 120,
    icon: "shirt-outline",
  },
  {
    id: "rw-medalha",
    name: "Medalha física extra",
    description: "Impressão 3D sob demanda da medalha do desafio.",
    category: "Colecionável",
    costPP: 200,
    icon: "medal-outline",
  },
];

export const DEMO_PRODUCTS: Product[] = [
  {
    id: "pd-camisa",
    name: "Camisa Oficial PaceHub",
    detail: "Dry-fit unissex, tamanhos P ao GG.",
    origin: "MARCA PRÓPRIA",
    priceBRL: 129.9,
    tint: "#263522",
    icon: "shirt-outline",
  },
  {
    id: "pd-bone",
    name: "Boné PaceHub",
    detail: "Aba curva e tecido leve para treino.",
    origin: "MARCA PRÓPRIA",
    priceBRL: 79.9,
    tint: "#202E3B",
    icon: "baseball-outline",
  },
  {
    id: "pd-medalha",
    name: "Medalha Física Extra",
    detail: "Impressão 3D sob demanda com o nome do desafio.",
    origin: "COLEÇÃO",
    priceBRL: 49.9,
    tint: "#3A2F1E",
    icon: "medal-outline",
  },
];

export const DEMO_RIVALS: LeaderboardEntry[] = [
  { name: "Marcos Lima", points: 580, km: 82.4 },
  { name: "Ana Ferreira", points: 540, km: 76.2 },
  { name: "João Costa", points: 510, km: 71.8 },
  { name: "Camila Alves", points: 470, km: 65.1 },
  { name: "Rafael Souza", points: 430, km: 60.3 },
  { name: "Bruna Melo", points: 310, km: 43.7 },
  { name: "Pedro Rocha", points: 180, km: 25.2 },
];

export const DEMO_ATHLETES: Athlete[] = [
  {
    id: "ath-lucas",
    name: "Lucas Almeida",
    level: "intermediario",
    goal: "21k",
    basePaceS: 318,
    weeklyKm: 24,
    daysPerWeek: 4,
    isMe: true,
  },
  {
    id: "ath-ana",
    name: "Ana Ferreira",
    level: "avancado",
    goal: "42k",
    basePaceS: 296,
    weeklyKm: 52,
    daysPerWeek: 5,
  },
  {
    id: "ath-marcos",
    name: "Marcos Lima",
    level: "intermediario",
    goal: "10k",
    basePaceS: 305,
    weeklyKm: 32,
    daysPerWeek: 5,
  },
  {
    id: "ath-bruna",
    name: "Bruna Melo",
    level: "iniciante",
    goal: "5k",
    basePaceS: 372,
    weeklyKm: 12,
    daysPerWeek: 3,
  },
];

/**
 * Semana prescrita pelo treinador para cada atleta. Treinos com data anterior a
 * hoje entram como concluídos, para a aderência já aparecer preenchida.
 */
export function buildDemoSessions(now: Date = new Date()): TrainingSession[] {
  const monday = startOfWeek(now);
  const sessions: TrainingSession[] = [];

  for (const athlete of DEMO_ATHLETES) {
    const drafts = planWeek({
      goal: athlete.goal,
      level: athlete.level,
      basePaceS: athlete.basePaceS,
      weeklyKm: athlete.weeklyKm,
      daysPerWeek: athlete.daysPerWeek,
    });

    drafts.forEach((draft, index) => {
      const date = addDays(monday, draft.weekday);
      date.setHours(6, 30, 0, 0);
      sessions.push({
        id: `ts-${athlete.id}-${index + 1}`,
        athleteId: athlete.id,
        date: date.toISOString(),
        typeId: draft.typeId,
        distanceKm: draft.distanceKm,
        targetPaceS: draft.targetPaceS,
        note: draft.note,
        done: date.getTime() < now.getTime(),
      });
    });
  }

  return sessions;
}

export function buildDemoState(now: Date = new Date()): RunState {
  const todayIndex = (now.getDay() + 6) % 7; // segunda = 0
  // Na semana corrente, distribui as duas corridas de demonstração em dias distintos até hoje.
  const currentWeekDays = [Math.max(0, todayIndex - 1), todayIndex];
  let currentWeekCursor = 0;

  const activities: Activity[] = SEED.map((seed, index) => {
    const dayIndex =
      seed.weekOffset === 0
        ? currentWeekDays[Math.min(currentWeekCursor++, currentWeekDays.length - 1)]
        : seed.dayIndex;
    return {
      id: `act-${index + 1}`,
      externalId: 900100 + index,
      provider: "strava",
      title: seed.title,
      distanceKm: seed.distanceKm,
      movingTimeS: Math.round(seed.distanceKm * seed.paceS),
      startedAt: at(now, seed.weekOffset, dayIndex, seed.hour),
      status: "validated",
      shoeId: seed.shoeId,
    };
  });

  const weekGoalKm = WEEKLY_GOAL_KM;

  const challenges: Challenge[] = [
    {
      id: "ch-semana",
      title: "Semana em movimento",
      period: "SEMANAL",
      description: `Corra ${weekGoalKm} km dentro da semana.`,
      metric: "km_week",
      targetValue: weekGoalKm,
      points: CHALLENGE_BONUS_PP,
      endsAt: endOfWeek(now),
      joined: true,
    },
    {
      id: "ch-constancia",
      title: "Constância é tudo",
      period: "MENSAL",
      description: "Complete 12 corridas dentro do mês.",
      metric: "runs_month",
      targetValue: 12,
      points: CHALLENGE_BONUS_PP,
      endsAt: endOfMonth(now),
      joined: true,
    },
    {
      id: "ch-longao",
      title: "Longão do mês",
      period: "MENSAL",
      description: "Complete 4 corridas de 10 km ou mais no mês.",
      metric: "long_runs_month",
      targetValue: 4,
      points: CHALLENGE_BONUS_PP,
      endsAt: endOfMonth(now),
      joined: false,
    },
  ];

  return {
    profile: DEMO_PROFILE,
    activities: [...activities, pendingActivity(now)],
    shoes: DEMO_SHOES,
    challenges,
    redemptions: [],
    purchases: [],
    strava: {
      connected: true,
      athleteName: "Lucas Almeida",
      lastSyncAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    },
    athletes: DEMO_ATHLETES,
    sessions: buildDemoSessions(now),
  };
}

/** Corridas usadas pelo simulador de sincronização (IDs fixos garantem deduplicação). */
export const SYNC_POOL: { externalId: number; title: string; distanceKm: number; paceS: number }[] = [
  { externalId: 991001, title: "Corrida leve no parque", distanceKm: 7.4, paceS: 336 },
  { externalId: 991002, title: "Intervalado na pista", distanceKm: 5.2, paceS: 306 },
  { externalId: 991003, title: "Rodagem de bairro", distanceKm: 8.6, paceS: 348 },
];

export { weekKey };
