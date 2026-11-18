/**
 * Ponte entre a PaceStore do app e as RPCs do Postgres
 * (`supabase/migrations/003_pacestore_rpcs.sql`).
 *
 * O servidor só é usado quando o Supabase está configurado e o item tem id de
 * verdade (UUID) — o catálogo de demonstração usa ids como "rw-camisa", que só
 * existem no estado local. Sem backend, o app segue no modo local e as mesmas
 * regras de saldo e teto de desconto de `lib/domain.ts` continuam valendo.
 */
import { getSupabaseClient } from "../supabase";

const configured = () =>
  Boolean(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string) => UUID_PATTERN.test(value);

export const storeBackendEnabled = () => configured();

export type StoreGatewayResult = {
  ok: boolean;
  message: string;
  costPP?: number;
  ppUsed?: number;
  paidBRL?: number;
  balancePP?: number;
};

type RedemptionPayload = { reward_name?: string; cost_pp?: number; balance_pp?: number };
type OrderPayload = {
  product_name?: string;
  pp_used?: number;
  paid_brl?: number;
  balance_pp?: number;
};

const num = (value: unknown) => Number(value ?? 0);

const brl = (value: number) => `R$ ${value.toFixed(2).replace(".", ",")}`;

export async function redeemRewardOnServer(rewardId: string): Promise<StoreGatewayResult> {
  const { data, error } = await getSupabaseClient().rpc("redeem_reward", { p_reward_id: rewardId });
  if (error) return { ok: false, message: error.message };

  const payload = (data ?? {}) as RedemptionPayload;
  const costPP = num(payload.cost_pp);
  return {
    ok: true,
    message: `${payload.reward_name ?? "Recompensa"} resgatado por ${costPP} PP.`,
    costPP,
    balancePP: num(payload.balance_pp),
  };
}

export async function createProductOrderOnServer(
  productId: string,
  ppUsed: number,
): Promise<StoreGatewayResult> {
  const { data, error } = await getSupabaseClient().rpc("create_product_order", {
    p_product_id: productId,
    p_pp_used: ppUsed,
  });
  if (error) return { ok: false, message: error.message };

  const payload = (data ?? {}) as OrderPayload;
  const pp = num(payload.pp_used);
  const paid = num(payload.paid_brl);
  return {
    ok: true,
    message:
      pp > 0
        ? `${payload.product_name ?? "Pedido"} por ${brl(paid)} usando ${pp.toFixed(1).replace(".", ",")} PP.`
        : `${payload.product_name ?? "Pedido"} por ${brl(paid)}, sem desconto.`,
    ppUsed: pp,
    paidBRL: paid,
    balancePP: num(payload.balance_pp),
  };
}
