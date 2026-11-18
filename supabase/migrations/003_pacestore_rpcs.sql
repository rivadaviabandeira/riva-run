-- PaceHub 003 — PaceStore com escrita atômica de PP
--
-- As duas únicas operações em que o corredor gasta pontos ganham RPC própria
-- porque `points_ledger`, `redemptions` e `product_orders` recusam escrita de
-- `authenticated` (ver 002_gamification.sql). O app chama a função e o banco
-- valida saldo, estoque, preço e teto de desconto dentro de uma transação.
--
-- Regras (espelhadas de lib/domain.ts):
--   * 1 PP = R$ 0,10 (app_settings.pp_value_brl);
--   * desconto máximo de 20% do preço (o menor entre app_settings
--     .max_discount_rate, products.max_discount_rate e o teto fixo de 20%);
--   * resgate debita cost_pp e não mexe no PP de carreira (lifetime);
--   * o saldo nunca fica negativo: cada usuário é serializado por um advisory
--     lock durante a operação, então duas chamadas concorrentes não gastam o
--     mesmo PP;
--   * `p_user` só é aceito quando a chamada já está autenticada como o próprio
--     corredor ou quando vem do servidor (service role), sem JWT.

begin;

-- ------------------------------------------------------------------ --
-- Resgate de recompensa
-- ------------------------------------------------------------------ --
create or replace function public.redeem_reward(p_reward_id uuid, p_user uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_user uuid := coalesce(p_user, auth.uid());
  v_reward public.rewards%rowtype;
  v_balance numeric;
  v_redemption uuid;
begin
  if v_user is null then
    raise exception using message = 'Resgate sem usuário autenticado', errcode = '28000';
  end if;

  -- Um corredor nunca movimenta o saldo de outra pessoa.
  if v_caller is not null and v_caller <> v_user then
    raise exception using
      message = 'Um corredor só pode resgatar recompensas para a própria conta',
      errcode = '42501';
  end if;

  -- Serializa as operações de saldo do usuário.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  select * into v_reward from public.rewards where id = p_reward_id for update;
  if not found then
    raise exception using message = 'Recompensa não encontrada', errcode = 'P0002';
  end if;
  if not v_reward.is_active then
    raise exception using message = 'Recompensa indisponível', errcode = 'P0001';
  end if;
  if v_reward.stock is not null and v_reward.stock <= 0 then
    raise exception using message = 'Recompensa esgotada', errcode = 'P0001';
  end if;

  select coalesce(sum(points), 0) into v_balance
    from public.points_ledger
   where user_id = v_user;

  if v_balance < v_reward.cost_pp then
    raise exception using
      message = 'Saldo insuficiente: faltam '
                || to_char(v_reward.cost_pp - v_balance, 'FM999999990.0') || ' PP',
      errcode = 'P0001';
  end if;

  insert into public.redemptions (user_id, reward_id, reward_name, cost_pp)
  values (v_user, v_reward.id, v_reward.name, v_reward.cost_pp)
  returning id into v_redemption;

  insert into public.points_ledger (user_id, kind, points, reference, description)
  values (v_user,
          'redemption',
          -v_reward.cost_pp,
          'redemption:' || v_redemption::text,
          'Resgate: ' || v_reward.name);

  if v_reward.stock is not null then
    update public.rewards set stock = stock - 1 where id = v_reward.id;
  end if;

  return jsonb_build_object(
    'redemption_id', v_redemption,
    'reward_id', v_reward.id,
    'reward_name', v_reward.name,
    'cost_pp', v_reward.cost_pp,
    'balance_pp', v_balance - v_reward.cost_pp
  );
end;
$$;

revoke all on function public.redeem_reward(uuid, uuid) from public;
revoke all on function public.redeem_reward(uuid, uuid) from anon, authenticated;
grant execute on function public.redeem_reward(uuid, uuid) to authenticated, service_role;

-- ------------------------------------------------------------------ --
-- Pedido de produto com desconto em PP
-- ------------------------------------------------------------------ --
create or replace function public.create_product_order(
  p_product_id uuid,
  p_pp_used numeric default null,
  p_user uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_user uuid := coalesce(p_user, auth.uid());
  v_product public.products%rowtype;
  v_pp_value numeric := 0.1;
  v_rate numeric := 0.2;
  v_max_discount numeric;
  v_max_pp numeric;
  v_balance numeric;
  v_pp numeric;
  v_discount numeric;
  v_paid numeric;
  v_order uuid;
begin
  if v_user is null then
    raise exception using message = 'Pedido sem usuário autenticado', errcode = '28000';
  end if;

  if v_caller is not null and v_caller <> v_user then
    raise exception using
      message = 'Um corredor só pode criar pedidos para a própria conta',
      errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    raise exception using message = 'Produto não encontrado', errcode = 'P0002';
  end if;
  if not v_product.is_active then
    raise exception using message = 'Produto indisponível', errcode = 'P0001';
  end if;

  select value into v_pp_value from public.app_settings where key = 'pp_value_brl';
  v_pp_value := coalesce(v_pp_value, 0.1);
  if v_pp_value <= 0 then
    raise exception using
      message = 'Configuração inválida: pp_value_brl precisa ser positivo',
      errcode = 'P0001';
  end if;

  select value into v_rate from public.app_settings where key = 'max_discount_rate';
  -- Teto de 20%: nunca ampliado pela configuração do produto.
  v_rate := least(coalesce(v_rate, 0.2), coalesce(v_product.max_discount_rate, 0.2), 0.2);

  v_max_discount := round(v_product.price_brl * v_rate, 2);
  -- Arredonda o teto de PP para baixo: PP * valor nunca passa do teto em reais.
  v_max_pp := trunc(v_max_discount / v_pp_value * 10) / 10;

  select coalesce(sum(points), 0) into v_balance
    from public.points_ledger
   where user_id = v_user;

  if p_pp_used is null then
    -- Mesmo cálculo do app: o menor entre o teto da regra e o saldo.
    v_pp := least(v_max_pp, greatest(v_balance, 0));
  else
    if p_pp_used < 0 then
      raise exception using message = 'PP usado não pode ser negativo', errcode = '22023';
    end if;
    if p_pp_used <> round(p_pp_used, 1) then
      raise exception using message = 'PP usado aceita no máximo uma casa decimal', errcode = '22023';
    end if;
    if p_pp_used > v_max_pp then
      raise exception using
        message = 'Desconto acima do teto de 20% do produto: use até '
                  || to_char(v_max_pp, 'FM999999990.0') || ' PP',
        errcode = 'P0001';
    end if;
    if p_pp_used > v_balance then
      raise exception using
        message = 'Saldo insuficiente: você tem '
                  || to_char(v_balance, 'FM999999990.0') || ' PP',
        errcode = 'P0001';
    end if;
    v_pp := p_pp_used;
  end if;

  v_discount := round(v_pp * v_pp_value, 2);
  if v_discount > v_max_discount then
    v_pp := trunc(v_max_discount / v_pp_value * 10) / 10;
    v_discount := round(v_pp * v_pp_value, 2);
  end if;
  v_paid := round(v_product.price_brl - v_discount, 2);

  insert into public.product_orders (user_id, product_id, product_name, pp_used, paid_brl)
  values (v_user, v_product.id, v_product.name, v_pp, v_paid)
  returning id into v_order;

  -- Pedido sem PP não gera lançamento: o livro-razão só aceita débito em
  -- 'purchase' com pontos negativos.
  if v_pp > 0 then
    insert into public.points_ledger (user_id, kind, points, reference, description)
    values (v_user,
            'purchase',
            -v_pp,
            'purchase:' || v_order::text,
            'Pedido: ' || v_product.name);
  end if;

  return jsonb_build_object(
    'order_id', v_order,
    'product_id', v_product.id,
    'product_name', v_product.name,
    'pp_used', v_pp,
    'discount_brl', v_discount,
    'paid_brl', v_paid,
    'max_pp', v_max_pp,
    'balance_pp', v_balance - v_pp
  );
end;
$$;

revoke all on function public.create_product_order(uuid, numeric, uuid) from public;
revoke all on function public.create_product_order(uuid, numeric, uuid) from anon, authenticated;
grant execute on function public.create_product_order(uuid, numeric, uuid) to authenticated, service_role;

commit;
