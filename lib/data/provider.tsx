import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  CHALLENGE_BONUS_PP,
  MAX_ACTIVE_SHOES,
  MAX_REALISTIC_PACE_S,
  MIN_REALISTIC_PACE_S,
  WEEKLY_GOAL_RUNS,
  achievementView,
  addDays,
  bestPaceSeconds,
  careerProgress,
  challengeProgress,
  countsForPoints,
  currentWeekSummary,
  evaluateAchievements,
  formatDecimal,
  planWeek,
  pointsBreakdown,
  ppDiscount,
  reviewWeek,
  round1,
  sessionsOfWeek,
  sessionType,
  startOfWeek,
  totalValidatedKm,
  weekKey,
  weeklyStreak,
  type AchievementView,
  type CareerProgress,
  type ChallengeProgress,
  type Discount,
  type RunnerStats,
  type SessionTypeId,
  type TrainingSession,
} from "../domain";
import { createProductOrderOnServer, isUuid, redeemRewardOnServer, storeBackendEnabled } from "../api/store";
import { auditData, shoeKm, type StewardReport } from "../steward";
import { DEMO_PRODUCTS, DEMO_REWARDS, DEMO_RIVALS, SYNC_POOL, buildDemoState } from "./demo";
import type {
  Activity,
  Athlete,
  Challenge,
  LeaderboardEntry,
  Product,
  Profile,
  Purchase,
  Redemption,
  Reward,
  RunState,
  Shoe,
  StravaState,
} from "./types";

export type ActionResult = { ok: boolean; message: string };
export type SyncResult = ActionResult & { imported: number; duplicates: number };

export type ChallengeView = Challenge & ChallengeProgress;

export type Stats = {
  totalKm: number;
  validatedRuns: number;
  bestPaceS: number | null;
  weeklyRuns: number;
  weeklyKm: number;
  weeklyGoalRuns: number;
  weeklyStreak: number;
  lifetimePP: number;
  balancePP: number;
  spentPP: number;
  level: CareerProgress;
  achievements: AchievementView[];
  unlockedAchievements: number;
  completedChallenges: number;
  activeShoes: number;
  shoeKmById: Record<string, number>;
};

export type NewSessionInput = {
  athleteId: string;
  date: string;
  typeId: SessionTypeId;
  distanceKm: number;
  targetPaceS: number;
  note?: string;
};

type Actions = {
  connectStrava: () => ActionResult;
  disconnectStrava: () => ActionResult;
  syncStrava: () => SyncResult;
  addShoe: (brand: string, model: string) => ActionResult;
  associateShoe: (activityId: string, shoeId: string) => ActionResult;
  /** Chama a RPC `redeem_reward` quando há backend; senão debita no estado local. */
  redeemReward: (rewardId: string) => Promise<ActionResult>;
  /** Chama a RPC `create_product_order` quando há backend; senão registra local. */
  buyProduct: (productId: string) => Promise<ActionResult>;
  joinChallenge: (challengeId: string) => ActionResult;
  reviewActivity: (activityId: string, decision: "validated" | "rejected") => ActionResult;
  runStewardAudit: () => StewardReport;
  buildWeekPlanFor: (athleteId: string) => ActionResult;
  addTrainingSession: (input: NewSessionInput) => ActionResult;
  removeTrainingSession: (sessionId: string) => ActionResult;
  toggleTrainingDone: (sessionId: string) => ActionResult;
  resetDemo: () => void;
};

type DataContextValue = {
  profile: Profile;
  activities: Activity[];
  shoes: Shoe[];
  challenges: Challenge[];
  challengeViews: ChallengeView[];
  rewards: Reward[];
  products: Product[];
  redemptions: Redemption[];
  purchases: Purchase[];
  strava: StravaState;
  athletes: Athlete[];
  /** Todos os treinos prescritos, de todos os atletas. */
  trainingSessions: TrainingSession[];
  steward: StewardReport;
  stats: Stats;
  rivals: LeaderboardEntry[];
  discountFor: (priceBRL: number) => Discount;
  actions: Actions;
};

const DataContext = createContext<DataContextValue | null>(null);

const DEMO_STEWARD = (state: RunState): StewardReport => auditData(state.activities, state.shoes);

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RunState>(() => buildDemoState());
  const [steward, setSteward] = useState<StewardReport>(() => DEMO_STEWARD(buildDemoState()));

  const challengeViews = useMemo<ChallengeView[]>(
    () =>
      state.challenges.map((challenge) => ({
        ...challenge,
        ...challengeProgress(challenge.metric, challenge.targetValue, state.activities),
      })),
    [state.challenges, state.activities],
  );

  const completedChallenges = challengeViews.filter(
    (challenge) => challenge.joined && challenge.done,
  ).length;

  const stats = useMemo<Stats>(() => {
    const runnerStats: RunnerStats = {
      validatedRuns: state.activities.filter(countsForPoints).length,
      totalKm: totalValidatedKm(state.activities),
      bestPaceS: bestPaceSeconds(state.activities),
      weeklyStreak: weeklyStreak(state.activities),
    };
    const week = currentWeekSummary(state.activities);
    const breakdown = pointsBreakdown({
      activities: state.activities,
      challengesCompleted: completedChallenges,
    });
    const spentPP = round1(
      [...state.redemptions.map((item) => item.costPP), ...state.purchases.map((item) => item.ppUsed)].reduce(
        (sum, value) => sum + value,
        0,
      ),
    );
    const achievements = evaluateAchievements(runnerStats);
    const shoeKmById: Record<string, number> = {};
    for (const shoe of state.shoes) shoeKmById[shoe.id] = shoeKm(state.activities, shoe.id);

    return {
      totalKm: runnerStats.totalKm,
      validatedRuns: runnerStats.validatedRuns,
      bestPaceS: runnerStats.bestPaceS,
      weeklyRuns: week.runs,
      weeklyKm: week.km,
      weeklyGoalRuns: WEEKLY_GOAL_RUNS,
      weeklyStreak: runnerStats.weeklyStreak,
      lifetimePP: breakdown.lifetime,
      balancePP: round1(breakdown.lifetime - spentPP),
      spentPP,
      level: careerProgress(breakdown.lifetime),
      achievements,
      unlockedAchievements: achievements.filter((achievement) => achievement.unlocked).length,
      completedChallenges,
      activeShoes: state.shoes.length,
      shoeKmById,
    };
  }, [state.activities, state.shoes, state.redemptions, state.purchases, completedChallenges]);

  const balancePP = stats.balancePP;

  const discountFor = useCallback(
    (priceBRL: number) => ppDiscount(priceBRL, balancePP),
    [balancePP],
  );

  const connectStrava = useCallback((): ActionResult => {
    setState((current) => ({
      ...current,
      strava: {
        connected: true,
        athleteName: current.profile.name,
        lastSyncAt: current.strava.lastSyncAt ?? new Date().toISOString(),
      },
    }));
    return { ok: true, message: "Strava conectado. A sincronização do servidor está liberada." };
  }, []);

  const disconnectStrava = useCallback((): ActionResult => {
    setState((current) => ({
      ...current,
      strava: { connected: false, athleteName: null, lastSyncAt: null },
    }));
    return {
      ok: true,
      message: "Strava desconectado. As atividades já importadas continuam no histórico.",
    };
  }, []);

  const syncStrava = useCallback((): SyncResult => {
    if (!state.strava.connected) {
      return {
        ok: false,
        imported: 0,
        duplicates: 0,
        message: "Conecte o Strava antes de sincronizar.",
      };
    }

    const next = SYNC_POOL.find(
      (candidate) => !state.activities.some((activity) => activity.provider === "strava" && activity.externalId === candidate.externalId),
    );

    if (!next) {
      setState((current) => ({
        ...current,
        strava: { ...current.strava, lastSyncAt: new Date().toISOString() },
      }));
      return {
        ok: true,
        imported: 0,
        duplicates: SYNC_POOL.length,
        message: "Nenhuma atividade nova. Atividades repetidas foram ignoradas.",
      };
    }

    const activity: Activity = {
      id: `act-sync-${next.externalId}`,
      externalId: next.externalId,
      provider: "strava",
      title: next.title,
      distanceKm: next.distanceKm,
      movingTimeS: Math.round(next.distanceKm * next.paceS),
      startedAt: new Date().toISOString(),
      status: "pending",
      shoeId: null,
    };

    setState((current) => ({
      ...current,
      activities: [activity, ...current.activities],
      strava: { ...current.strava, lastSyncAt: new Date().toISOString() },
    }));

    return {
      ok: true,
      imported: 1,
      duplicates: 0,
      message: `${next.title} (${formatDecimal(next.distanceKm)} km) importada. O agente de dados ainda precisa validar.`,
    };
  }, [state.activities, state.strava]);

  const addShoe = useCallback(
    (brand: string, model: string): ActionResult => {
      const cleanBrand = brand.trim().toUpperCase();
      const cleanModel = model.trim();
      if (cleanBrand.length < 2) return { ok: false, message: "Informe a marca do tênis." };
      if (cleanModel.length < 2) return { ok: false, message: "Informe o modelo do tênis." };
      if (state.shoes.length >= MAX_ACTIVE_SHOES) {
        return { ok: false, message: `Limite de ${MAX_ACTIVE_SHOES} pares ativos atingido.` };
      }
      if (
        state.shoes.some(
          (shoe) => shoe.brand === cleanBrand && shoe.model.toLowerCase() === cleanModel.toLowerCase(),
        )
      ) {
        return { ok: false, message: "Este par já está cadastrado." };
      }
      const shoe: Shoe = {
        id: `shoe-${Date.now()}`,
        brand: cleanBrand,
        model: cleanModel,
        addedAt: new Date().toISOString(),
      };
      setState((current) => ({ ...current, shoes: [...current.shoes, shoe] }));
      return { ok: true, message: `${cleanBrand} ${cleanModel} cadastrado.` };
    },
    [state.shoes],
  );

  const associateShoe = useCallback((activityId: string, shoeId: string): ActionResult => {
    let found = false;
    setState((current) => ({
      ...current,
      activities: current.activities.map((activity) => {
        if (activity.id !== activityId) return activity;
        found = true;
        return { ...activity, shoeId };
      }),
    }));
    return found
      ? { ok: true, message: "Tênis associado. A quilometragem foi atualizada." }
      : { ok: false, message: "Atividade não encontrada." };
  }, []);

  const redeemReward = useCallback(
    async (rewardId: string): Promise<ActionResult> => {
      const reward = DEMO_REWARDS.find((item) => item.id === rewardId);
      if (!reward) return { ok: false, message: "Recompensa não encontrada." };

      // Com backend, quem decide o saldo é o Postgres: nada é debitado localmente
      // antes da RPC confirmar.
      if (storeBackendEnabled() && isUuid(rewardId)) {
        const remote = await redeemRewardOnServer(rewardId);
        if (!remote.ok) return { ok: false, message: remote.message };
        const redemption: Redemption = {
          id: `rd-${Date.now()}`,
          rewardId,
          name: reward.name,
          costPP: remote.costPP ?? reward.costPP,
          createdAt: new Date().toISOString(),
        };
        setState((current) => ({ ...current, redemptions: [redemption, ...current.redemptions] }));
        return { ok: true, message: remote.message };
      }

      if (balancePP < reward.costPP) {
        return {
          ok: false,
          message: `Saldo insuficiente: faltam ${formatDecimal(reward.costPP - balancePP)} PP.`,
        };
      }
      const redemption: Redemption = {
        id: `rd-${Date.now()}`,
        rewardId: reward.id,
        name: reward.name,
        costPP: reward.costPP,
        createdAt: new Date().toISOString(),
      };
      setState((current) => ({ ...current, redemptions: [redemption, ...current.redemptions] }));
      return { ok: true, message: `${reward.name} resgatado por ${reward.costPP} PP.` };
    },
    [balancePP],
  );

  const buyProduct = useCallback(
    async (productId: string): Promise<ActionResult> => {
      const product = DEMO_PRODUCTS.find((item) => item.id === productId);
      if (!product) return { ok: false, message: "Produto não encontrado." };
      const discount = ppDiscount(product.priceBRL, balancePP);

      // O teto de 20% e o saldo também são validados na RPC; aqui só espelhamos
      // o resultado para o histórico da tela.
      if (storeBackendEnabled() && isUuid(productId)) {
        const remote = await createProductOrderOnServer(productId, discount.ppUsed);
        if (!remote.ok) return { ok: false, message: remote.message };
        const purchase: Purchase = {
          id: `pc-${Date.now()}`,
          productId,
          ppUsed: remote.ppUsed ?? discount.ppUsed,
          paidBRL: remote.paidBRL ?? discount.finalPriceBRL,
          createdAt: new Date().toISOString(),
        };
        setState((current) => ({ ...current, purchases: [purchase, ...current.purchases] }));
        return { ok: true, message: remote.message };
      }

      const purchase: Purchase = {
        id: `pc-${Date.now()}`,
        productId: product.id,
        ppUsed: discount.ppUsed,
        paidBRL: discount.finalPriceBRL,
        createdAt: new Date().toISOString(),
      };
      setState((current) => ({ ...current, purchases: [purchase, ...current.purchases] }));
      return {
        ok: true,
        message:
          discount.ppUsed > 0
            ? `${product.name} por ${discount.finalPriceBRL.toFixed(2).replace(".", ",")} usando ${formatDecimal(discount.ppUsed)} PP.`
            : `${product.name} sem desconto (saldo insuficiente para abater o valor).`,
      };
    },
    [balancePP],
  );

  const buildWeekPlanFor = useCallback(
    (athleteId: string): ActionResult => {
      const athlete = state.athletes.find((item) => item.id === athleteId);
      if (!athlete) return { ok: false, message: "Atleta não encontrado." };

      const reference = new Date();
      const monday = startOfWeek(reference);
      const drafts = planWeek({
        goal: athlete.goal,
        level: athlete.level,
        basePaceS: athlete.basePaceS,
        weeklyKm: athlete.weeklyKm,
        daysPerWeek: athlete.daysPerWeek,
      });
      const stamp = Date.now();
      const sessions: TrainingSession[] = drafts.map((draft, index) => {
        const date = addDays(monday, draft.weekday);
        date.setHours(6, 30, 0, 0);
        return {
          id: `ts-${athlete.id}-${stamp}-${index}`,
          athleteId: athlete.id,
          date: date.toISOString(),
          typeId: draft.typeId,
          distanceKm: draft.distanceKm,
          targetPaceS: draft.targetPaceS,
          note: draft.note,
          done: false,
        };
      });

      const currentKey = weekKey(reference);
      setState((current) => ({
        ...current,
        sessions: [
          ...current.sessions.filter(
            (session) =>
              !(session.athleteId === athlete.id && weekKey(new Date(session.date)) === currentKey),
          ),
          ...sessions,
        ],
      }));

      const review = reviewWeek(sessions, athlete);
      return {
        ok: true,
        message: `Semana de ${athlete.name.split(" ")[0]}: ${sessions.length} treinos, ${formatDecimal(
          review.prescribedKm,
        )} km. ${review.messages[0] ?? "Plano dentro dos limites da carga."}`,
      };
    },
    [state.athletes],
  );

  const addTrainingSession = useCallback(
    (input: NewSessionInput): ActionResult => {
      const athlete = state.athletes.find((item) => item.id === input.athleteId);
      if (!athlete) return { ok: false, message: "Escolha o atleta do treino." };
      if (!Number.isFinite(input.distanceKm) || input.distanceKm < 0.5 || input.distanceKm > 60) {
        return { ok: false, message: "A distância deve ficar entre 0,5 km e 60 km." };
      }
      if (
        !Number.isFinite(input.targetPaceS) ||
        input.targetPaceS < MIN_REALISTIC_PACE_S ||
        input.targetPaceS > MAX_REALISTIC_PACE_S
      ) {
        return { ok: false, message: "Pace alvo deve ficar entre 2:30 e 12:00 por km." };
      }

      const session: TrainingSession = {
        id: `ts-${athlete.id}-${Date.now()}`,
        athleteId: athlete.id,
        date: input.date,
        typeId: input.typeId,
        distanceKm: round1(input.distanceKm),
        targetPaceS: Math.round(input.targetPaceS),
        note: input.note?.trim() || sessionType(input.typeId).purpose,
        done: false,
      };

      const week = reviewWeek(
        [
          ...sessionsOfWeek(state.sessions, new Date(input.date)).filter(
            (item) => item.athleteId === athlete.id,
          ),
          session,
        ],
        athlete,
      );

      setState((current) => ({ ...current, sessions: [...current.sessions, session] }));
      return {
        ok: true,
        message: `${sessionType(input.typeId).label} de ${formatDecimal(
          session.distanceKm,
        )} km para ${athlete.name.split(" ")[0]}. ${
          week.level === "ok" ? "Semana dentro dos limites." : week.messages[0]
        }`,
      };
    },
    [state.athletes, state.sessions],
  );

  const removeTrainingSession = useCallback((sessionId: string): ActionResult => {
    setState((current) => ({
      ...current,
      sessions: current.sessions.filter((session) => session.id !== sessionId),
    }));
    return { ok: true, message: "Treino removido do plano." };
  }, []);

  const toggleTrainingDone = useCallback((sessionId: string): ActionResult => {
    let done = false;
    setState((current) => ({
      ...current,
      sessions: current.sessions.map((session) => {
        if (session.id !== sessionId) return session;
        done = !session.done;
        return { ...session, done: !session.done };
      }),
    }));
    return done
      ? { ok: true, message: "Treino marcado como concluído." }
      : { ok: false, message: "Treino reaberto no plano." };
  }, []);

  const joinChallenge = useCallback((challengeId: string): ActionResult => {
    let joined = false;
    setState((current) => ({
      ...current,
      challenges: current.challenges.map((challenge) => {
        if (challenge.id !== challengeId) return challenge;
        joined = !challenge.joined;
        return { ...challenge, joined: !challenge.joined };
      }),
    }));
    return joined
      ? { ok: true, message: `Inscrição confirmada. Concluir o desafio vale +${CHALLENGE_BONUS_PP} PP.` }
      : { ok: false, message: "Você saiu do desafio." };
  }, []);

  const reviewActivity = useCallback(
    (activityId: string, decision: "validated" | "rejected"): ActionResult => {
      setState((current) => ({
        ...current,
        activities: current.activities.map((activity) =>
          activity.id === activityId ? { ...activity, status: decision } : activity,
        ),
      }));
      return {
        ok: true,
        message:
          decision === "validated"
            ? "Atividade validada e contabilizada."
            : "Atividade rejeitada e removida da pontuação.",
      };
    },
    [],
  );

  const runStewardAudit = useCallback((): StewardReport => {
    const report = auditData(state.activities, state.shoes);
    setSteward(report);
    return report;
  }, [state.activities, state.shoes]);

  const resetDemo = useCallback(() => {
    const fresh = buildDemoState();
    setState(fresh);
    setSteward(DEMO_STEWARD(fresh));
  }, []);

  const value = useMemo<DataContextValue>(
    () => ({
      profile: state.profile,
      activities: state.activities,
      shoes: state.shoes,
      challenges: state.challenges,
      challengeViews,
      rewards: DEMO_REWARDS,
      products: DEMO_PRODUCTS,
      redemptions: state.redemptions,
      purchases: state.purchases,
      strava: state.strava,
      athletes: state.athletes,
      trainingSessions: state.sessions,
      steward,
      stats,
      rivals: DEMO_RIVALS,
      discountFor,
      actions: {
        connectStrava,
        disconnectStrava,
        syncStrava,
        addShoe,
        associateShoe,
        redeemReward,
        buyProduct,
        joinChallenge,
        reviewActivity,
        runStewardAudit,
        buildWeekPlanFor,
        addTrainingSession,
        removeTrainingSession,
        toggleTrainingDone,
        resetDemo,
      },
    }),
    [
      state,
      challengeViews,
      steward,
      stats,
      discountFor,
      connectStrava,
      disconnectStrava,
      syncStrava,
      addShoe,
      associateShoe,
      redeemReward,
      buyProduct,
      joinChallenge,
      reviewActivity,
      runStewardAudit,
      buildWeekPlanFor,
      addTrainingSession,
      removeTrainingSession,
      toggleTrainingDone,
      resetDemo,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const context = useContext(DataContext);
  if (!context) throw new Error("useData deve ser usado dentro de <DataProvider>.");
  return context;
}

export { achievementView };
