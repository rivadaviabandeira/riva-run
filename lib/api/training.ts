/**
 * Ponte entre a tela de treinos do treinador e a RPC `mark_training_session_done`
 * criada na migration 005 (`supabase/migrations/005_training_done_rpc.sql`).
 *
 * O servidor só é usado quando o Supabase está configurado, o usuário está logado
 * e a sessão tem id de verdade (UUID). O catálogo de demonstração usa ids como
 * `ts-ath-lucas-1`, que só existem no estado local - nesse caso o toggle fica
 * local como antes.
 */
import { getSupabaseClient } from "../supabase";

export const trainingBackendEnabled = (): boolean =>
  Boolean(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

export type MarkSessionDoneResult = {
  ok: boolean;
  message: string;
  /**
   * Dados da sessão que a RPC devolveu em caso de sucesso.
   *
   * `sessionId`: id da sessão marcada.
   * `scheduledDate`: data prevista da sessão (ISO).
   * `actualPaceS`: no momento é o target pace congravado da sessão (o que está
   * na coluna target_pace_s / pace_s da sessão), até a RPC evoluir para um pace
   * medido real.
   */
  sessionId?: string;
  scheduledDate?: string;
  actualPaceS?: number;
};

export async function markTrainingSessionDoneOnServer(
  sessionId: string,
): Promise<MarkSessionDoneResult> {
  // Requer usuário logado: a RPC SECURITY DEFINER usa auth.uid() como atleta.
  if (!trainingBackendEnabled()) {
    return {
      ok: false,
      message: "Backend de treinos não configurado. Marque a sessão localmente.",
    };
  }

  const supabase = getSupabaseClient();
  const { data: authProfile } = await supabase.auth.getUser();
  if (!authProfile?.user) {
    return {
      ok: false,
      message: "Faça login para marcar a sessão no servidor.",
    };
  }

  const { data, error } = await supabase.rpc("mark_training_session_done", { p_session_id: sessionId });
  if (error) {
    return { ok: false, message: error.message };
  }

  const payload = (data ?? {}) as {
    session_id?: string;
    scheduled_date?: string;
    actual_pace_s?: number;
  };

  // O retorno da RPC ajuda na hydration do cache local, não precisa de re-fetch.
  // Por enquanto, o retorno também não rejeita novamente quem não é o atleta:

  return {
    ok: true,
    message: "Treino marcado como concluído no servidor.",
    sessionId: payload.session_id,
    scheduledDate: payload.scheduled_date,
    actualPaceS: payload.actual_pace_s,
  };
}
