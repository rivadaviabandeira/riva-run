import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";
import type {
  ActivityStatus,
  AthleteLevel,
  ChallengeMetric,
  TrainingGoal,
  TrainingSession,
} from "../domain";

export type { TrainingSession };

export type IconName = ComponentProps<typeof Ionicons>["name"];

export type Activity = {
  id: string;
  externalId: number;
  provider: "strava";
  title: string;
  distanceKm: number;
  movingTimeS: number;
  startedAt: string;
  status: ActivityStatus;
  /** Tênis associado. O Strava não informa o tênis, então a associação é manual. */
  shoeId: string | null;
};

export type Shoe = {
  id: string;
  brand: string;
  model: string;
  addedAt: string;
};

export type Challenge = {
  id: string;
  title: string;
  period: "SEMANAL" | "MENSAL";
  description: string;
  metric: ChallengeMetric;
  targetValue: number;
  points: number;
  endsAt: string;
  joined: boolean;
};

export type Reward = {
  id: string;
  name: string;
  description: string;
  category: string;
  costPP: number;
  icon: IconName;
};

export type Product = {
  id: string;
  name: string;
  detail: string;
  origin: "MARCA PRÓPRIA" | "COLEÇÃO" | "REVENDA";
  priceBRL: number;
  tint: string;
  icon: IconName;
};

export type Redemption = {
  id: string;
  rewardId: string;
  name: string;
  costPP: number;
  createdAt: string;
};

export type Purchase = {
  id: string;
  productId: string;
  ppUsed: number;
  paidBRL: number;
  createdAt: string;
};

export type StravaState = {
  connected: boolean;
  athleteName: string | null;
  lastSyncAt: string | null;
};

export type Profile = {
  name: string;
  handle: string;
  city: string;
  joinedAt: string;
};

export type LeaderboardEntry = {
  name: string;
  points: number;
  km: number;
  isMe?: boolean;
};

export type RunState = {
  profile: Profile;
  activities: Activity[];
  shoes: Shoe[];
  challenges: Challenge[];
  redemptions: Redemption[];
  purchases: Purchase[];
  strava: StravaState;
  athletes: Athlete[];
  sessions: TrainingSession[];
};

export type Athlete = {
  id: string;
  name: string;
  level: AthleteLevel;
  goal: TrainingGoal;
  /** Pace base (s/km) usado para calcular as zonas de cada tipo de treino. */
  basePaceS: number;
  /** Média de km por semana nas últimas semanas. */
  weeklyKm: number;
  daysPerWeek: number;
  isMe?: boolean;
};
