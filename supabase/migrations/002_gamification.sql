-- PaceHub 002 — gamificação, PaceStore e governança de dados
-- Complementa 001_initial_schema.sql com o livro-razão de PP (1 km = 1 PP),
-- conquistas, recompensas, produtos, resgates e o registro de auditoria do
-- agente de dados. Toda escrita de pontuação é exclusiva do servidor.

begin;

-- ------------------------------------------------------------------ --
-- Configuração versionada das regras
-- ------------------------------------------------------------------ --
create table public.app_settings (
  key text primary key,
  value numeric not null,
  description text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value, description) values
  ('pp_per_km', 1, 'Pontos por quilômetro validado'),
  ('weekly_goal_runs', 3, 'Treinos necessários para cumprir a meta semanal'),
  ('weekly_bonus_pp', 5, 'Bônus por semana com a meta cumprida'),
  ('challenge_bonus_pp', 15, 'Bônus por desafio concluído'),
  ('max_active_shoes', 5, 'Limite de tênis ativos por participante'),
  ('pp_value_brl', 0.1, 'Valor de 1 PP em reais na PaceStore'),
  ('max_discount_rate', 0.2, 'Desconto máximo em produtos'),
  ('shoe_replace_km', 800, 'Quilometragem sugerida para troca do tênis')
on conflict (key) do nothing;

-- ------------------------------------------------------------------ --
-- Livro-razão de PP (idempotente por referência)
-- ------------------------------------------------------------------ --
create type public.points_kind as enum ('activity', 'weekly_bonus', 'challenge_bonus', 'redemption', 'purchase');

create table public.points_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind public.points_kind not null,
  points numeric(10,2) not null,
  reference text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, kind, reference),
  check (
    (kind in ('redemption', 'purchase') and points < 0)
    or (kind in ('activity', 'weekly_bonus', 'challenge_bonus') and points > 0)
  )
);
create index points_ledger_user_idx on public.points_ledger(user_id, created_at desc);

create table public.challenge_completions (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

-- ------------------------------------------------------------------ --
-- Conquistas (mesmas metas do módulo lib/domain.ts)
-- ------------------------------------------------------------------ --
create table public.achievements (
  id text primary key,
  category text not null check (category in ('passos', 'constancia', 'performance')),
  title text not null,
  description text not null default '',
  metric text not null check (metric in ('runs', 'streak', 'pace')),
  target numeric(10,2) not null check (target > 0),
  sort_order integer not null default 0
);

insert into public.achievements (id, category, title, description, metric, target, sort_order) values
  ('passos-1', 'passos', 'Primeira corrida', 'Tenha sua primeira atividade validada.', 'runs', 1, 1),
  ('passos-2', 'passos', 'Ritmo de rotina', 'Acumule 10 corridas validadas.', 'runs', 10, 2),
  ('passos-3', 'passos', 'Colecionador de km', 'Acumule 50 corridas validadas.', 'runs', 50, 3),
  ('constancia-1', 'constancia', 'Semana completa', 'Cumpra a meta de 3 treinos em uma semana.', 'streak', 1, 4),
  ('constancia-2', 'constancia', 'Mês em movimento', 'Cumpra a meta semanal por 4 semanas seguidas.', 'streak', 4, 5),
  ('constancia-3', 'constancia', 'Temporada perfeita', 'Cumpra a meta semanal por 12 semanas seguidas.', 'streak', 12, 6),
  ('performance-1', 'performance', 'Abaixo de 5:30', 'Registre um pace de 5:30/km ou melhor.', 'pace', 330, 7),
  ('performance-2', 'performance', 'Abaixo de 5:00', 'Registre um pace de 5:00/km ou melhor.', 'pace', 300, 8),
  ('performance-3', 'performance', 'Abaixo de 4:30', 'Registre um pace de 4:30/km ou melhor.', 'pace', 270, 9)
on conflict (id) do nothing;

create table public.user_achievements (
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id text not null references public.achievements(id) on delete cascade,
  progress numeric(10,2) not null default 0,
  unlocked_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

-- ------------------------------------------------------------------ --
-- PaceStore: recompensas, produtos, resgates e pedidos
-- ------------------------------------------------------------------ --
create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  category text not null default '',
  cost_pp numeric(10,2) not null check (cost_pp > 0),
  is_active boolean not null default true,
  stock integer check (stock is null or stock >= 0),
  created_at timestamptz not null default now()
);

create table public.redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reward_id uuid references public.rewards(id) on delete set null,
  reward_name text not null,
  cost_pp numeric(10,2) not null check (cost_pp > 0),
  status text not null default 'pending' check (status in ('pending', 'fulfilled', 'cancelled')),
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  origin text not null check (origin in ('propria', 'colecao', 'revenda')),
  price_brl numeric(10,2) not null check (price_brl > 0),
  max_discount_rate numeric(4,3) not null default 0.2 check (max_discount_rate between 0 and 0.2),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.product_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  pp_used numeric(10,2) not null default 0 check (pp_used >= 0),
  paid_brl numeric(10,2) not null check (paid_brl >= 0),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now()
);

insert into public.rewards (name, description, category, cost_pp)
select * from (values
  ('Desconto na inscrição', 'R$ 10 de desconto em qualquer prova PaceHub.', 'Desconto', 50::numeric),
  ('Camisa oficial', 'Camisa oficial PaceHub. Tamanho escolhido no resgate.', 'Vestuário', 120::numeric),
  ('Medalha física extra', 'Impressão 3D sob demanda da medalha do desafio.', 'Colecionável', 200::numeric)
) as seed(name, description, category, cost_pp)
where not exists (select 1 from public.rewards);

insert into public.products (name, description, origin, price_brl)
select * from (values
  ('Camisa Oficial PaceHub', 'Dry-fit unissex, tamanhos P ao GG.', 'propria', 129.90::numeric),
  ('Boné PaceHub', 'Aba curva e tecido leve para treino.', 'propria', 79.90::numeric),
  ('Medalha Física Extra', 'Impressão 3D sob demanda com o nome do desafio.', 'colecao', 49.90::numeric)
) as seed(name, description, origin, price_brl)
where not exists (select 1 from public.products);

-- ------------------------------------------------------------------ --
-- Governança de dados (agente)
-- ------------------------------------------------------------------ --
create type public.issue_severity as enum ('alta', 'media', 'baixa');
create type public.issue_status as enum ('open', 'resolved', 'ignored');
create type public.issue_kind as enum ('duplicidade', 'pendente', 'sem_tenis', 'distancia', 'pace', 'tenis_desgastado');

create table public.data_quality_issues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  activity_id uuid references public.activities(id) on delete cascade,
  shoe_id uuid references public.shoes(id) on delete cascade,
  kind public.issue_kind not null,
  severity public.issue_severity not null,
  status public.issue_status not null default 'open',
  detail text not null,
  dedupe_key text not null,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (dedupe_key)
);

create table public.steward_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  checked_activities integer not null default 0,
  issues_open integer not null default 0,
  summary text not null default ''
);

-- Visões de apoio ao agente (respeitam a RLS de quem consulta).
create view public.shoe_mileage with (security_invoker = true) as
select a.user_id,
       a.shoe_id,
       round(sum(a.distance_m) / 1000.0, 1) as km
  from public.activities a
 where a.status = 'validated' and a.shoe_id is not null
 group by a.user_id, a.shoe_id;

create view public.duplicate_activity_candidates with (security_invoker = true) as
select a.id,
       a.user_id,
       a.external_activity_id,
       count(*) over (partition by a.user_id, a.started_at, a.distance_m) as copies
  from public.activities a
 where a.status <> 'rejected';

create view public.user_points_summary with (security_invoker = true) as
select user_id,
       coalesce(sum(points) filter (where kind in ('activity', 'weekly_bonus', 'challenge_bonus')), 0) as lifetime_pp,
       coalesce(sum(points), 0) as balance_pp
  from public.points_ledger
 group by user_id;

-- ------------------------------------------------------------------ --
-- Recálculo idempotente de PP e conquistas (somente servidor)
-- ------------------------------------------------------------------ --
create or replace function public.recalculate_user_progress(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pp_per_km numeric;
  v_weekly_goal integer;
  v_weekly_bonus numeric;
  v_challenge_bonus numeric;
  v_runs integer;
  v_km numeric;
  v_best_pace numeric;
  v_streak integer := 0;
  v_lifetime numeric;
  v_balance numeric;
  v_week date;
begin
  select value into v_pp_per_km from public.app_settings where key = 'pp_per_km';
  select value into v_weekly_goal from public.app_settings where key = 'weekly_goal_runs';
  select value into v_weekly_bonus from public.app_settings where key = 'weekly_bonus_pp';
  select value into v_challenge_bonus from public.app_settings where key = 'challenge_bonus_pp';

  -- Pontos por atividade validada (1 km = 1 PP).
  delete from public.points_ledger where user_id = p_user and kind = 'activity';
  insert into public.points_ledger (user_id, kind, points, reference, description)
  select a.user_id,
         'activity',
         round(a.distance_m / 1000.0 * coalesce(v_pp_per_km, 1), 1),
         'activity:' || a.id,
         coalesce(nullif(a.title, ''), a.activity_type)
    from public.activities a
   where a.user_id = p_user
     and a.status = 'validated'
     and a.distance_m between 1000 and 100000;

  -- Bônus de meta semanal. Só contam treinos que pontuam (1 km a 100 km):
  -- uma atividade de 300 m não pode fechar a meta de três treinos.
  delete from public.points_ledger where user_id = p_user and kind = 'weekly_bonus';
  insert into public.points_ledger (user_id, kind, points, reference, description)
  select p_user,
         'weekly_bonus',
         coalesce(v_weekly_bonus, 5),
         'week:' || to_char(week_start, 'YYYY-MM-DD'),
         'Meta semanal de ' || coalesce(v_weekly_goal, 3) || ' treinos cumprida'
    from (
      select date_trunc('week', a.started_at)::date as week_start
        from public.activities a
       where a.user_id = p_user
         and a.status = 'validated'
         and a.distance_m between 1000 and 100000
       group by 1
      having count(*) >= coalesce(v_weekly_goal, 3)
    ) weeks;

  -- Bônus de desafio concluído.
  delete from public.points_ledger where user_id = p_user and kind = 'challenge_bonus';
  insert into public.points_ledger (user_id, kind, points, reference, description)
  select p_user,
         'challenge_bonus',
         coalesce(v_challenge_bonus, 15),
         'challenge:' || c.challenge_id,
         'Desafio concluído'
    from public.challenge_completions c
   where c.user_id = p_user and c.completed_at is not null;

  -- Estatísticas apenas de treinos válidos (1 km a 100 km).
  -- O pace ignora atividades sem tempo de movimento e valores implausíveis
  -- (abaixo de 2:30/km), que de outra forma desbloqueariam medalhas de recorde.
  select count(*)::int,
         coalesce(round(sum(a.distance_m) / 1000.0, 1), 0),
         min(a.moving_time_s::numeric / nullif(a.distance_m / 1000.0, 0))
           filter (where a.moving_time_s > 0
                     and a.moving_time_s >= 150 * (a.distance_m / 1000.0))
    into v_runs, v_km, v_best_pace
    from public.activities a
   where a.user_id = p_user
     and a.status = 'validated'
     and a.distance_m between 1000 and 100000;

  -- Sequência de semanas com a meta cumprida.
  v_week := date_trunc('week', now())::date;
  if not exists (
    select 1 from public.activities a
     where a.user_id = p_user
       and a.status = 'validated'
       and a.distance_m between 1000 and 100000
       and date_trunc('week', a.started_at)::date = v_week
     group by date_trunc('week', a.started_at)::date
    having count(*) >= coalesce(v_weekly_goal, 3)
  ) then
    v_week := v_week - 7;
  end if;

  loop
    exit when not exists (
      select 1 from public.activities a
       where a.user_id = p_user
         and a.status = 'validated'
         and a.distance_m between 1000 and 100000
         and date_trunc('week', a.started_at)::date = v_week
       group by date_trunc('week', a.started_at)::date
      having count(*) >= coalesce(v_weekly_goal, 3)
    );
    v_streak := v_streak + 1;
    v_week := v_week - 7;
  end loop;

  insert into public.user_achievements (user_id, achievement_id, progress, unlocked_at, updated_at)
  select p_user,
         a.id,
         case a.metric
           when 'runs' then least(v_runs, a.target)
           when 'streak' then least(v_streak, a.target)
           else case when v_best_pace is null then 0 else least(v_best_pace, a.target) end
         end,
         case
           when a.metric = 'runs' and v_runs >= a.target then now()
           when a.metric = 'streak' and v_streak >= a.target then now()
           when a.metric = 'pace' and v_best_pace is not null and v_best_pace <= a.target then now()
           else null
         end,
         now()
    from public.achievements a
  on conflict (user_id, achievement_id) do update
    set progress = excluded.progress,
        unlocked_at = coalesce(public.user_achievements.unlocked_at, excluded.unlocked_at),
        updated_at = now();

  select coalesce(sum(points) filter (where kind in ('activity', 'weekly_bonus', 'challenge_bonus')), 0),
         coalesce(sum(points), 0)
    into v_lifetime, v_balance
    from public.points_ledger
   where user_id = p_user;

  return jsonb_build_object(
    'user_id', p_user,
    'runs', v_runs,
    'km', v_km,
    'best_pace_s', v_best_pace,
    'streak_weeks', v_streak,
    'lifetime_pp', v_lifetime,
    'balance_pp', v_balance
  );
end;
$$;

revoke all on function public.recalculate_user_progress(uuid) from public;
revoke all on function public.recalculate_user_progress(uuid) from anon, authenticated;
grant execute on function public.recalculate_user_progress(uuid) to service_role;

-- ------------------------------------------------------------------ --
-- RLS
-- ------------------------------------------------------------------ --
alter table public.app_settings enable row level security;
alter table public.points_ledger enable row level security;
alter table public.challenge_completions enable row level security;
alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;
alter table public.rewards enable row level security;
alter table public.redemptions enable row level security;
alter table public.products enable row level security;
alter table public.product_orders enable row level security;
alter table public.data_quality_issues enable row level security;
alter table public.steward_runs enable row level security;

-- Catálogos públicos para quem está autenticado.
create policy "Authenticated users read achievements" on public.achievements
for select to authenticated using (true);
create policy "Authenticated users read active rewards" on public.rewards
for select to authenticated using (is_active = true);
create policy "Authenticated users read active products" on public.products
for select to authenticated using (is_active = true);

-- Dados pessoais: somente o próprio corredor.
create policy "Users read their own ledger" on public.points_ledger
for select to authenticated using (auth.uid() = user_id);
create policy "Users read their own achievements" on public.user_achievements
for select to authenticated using (auth.uid() = user_id);
create policy "Users read their own redemptions" on public.redemptions
for select to authenticated using (auth.uid() = user_id);
create policy "Users read their own orders" on public.product_orders
for select to authenticated using (auth.uid() = user_id);
create policy "Users read their own challenge completions" on public.challenge_completions
for select to authenticated using (auth.uid() = user_id);
create policy "Users read their own data issues" on public.data_quality_issues
for select to authenticated using (auth.uid() = user_id);
create policy "Admins read all data issues" on public.data_quality_issues
for all to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Pontuação, resgates, pedidos e auditoria são escritos apenas com service role.
revoke insert, update, delete on public.points_ledger from authenticated;
revoke insert, update, delete on public.user_achievements from authenticated;
revoke insert, update, delete on public.redemptions from authenticated;
revoke insert, update, delete on public.product_orders from authenticated;
revoke insert, update, delete on public.challenge_completions from authenticated;
revoke insert, update, delete on public.steward_runs from authenticated;
revoke all on public.steward_runs from anon;
revoke all on public.app_settings from anon, authenticated;

grant select on public.user_points_summary to authenticated;
grant select on public.shoe_mileage to authenticated;
grant select on public.duplicate_activity_candidates to authenticated;

commit;
