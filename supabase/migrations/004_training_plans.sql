-- PaceHub 004 — treinos prescritos pelo treinador
--
-- Até aqui os planos e as sessões do modo treinador existiam apenas no estado
-- local do app e desapareciam ao recarregar. Esta migration dá casa a eles:
--
--   * coach_athletes: quem treina quem (vínculo criado por um admin);
--   * training_plans: plano do atleta (meta, nível, pace base, volume e dias);
--   * training_sessions: cada sessão prescrita (tipo, data, distância, pace);
--   * o atleta lê o próprio plano; escrever é papel do treinador vinculado ou
--     de um admin — nenhum corredor altera o próprio treino pelas tabelas;
--   * invariantes que a RLS não alcança ficam em trigger: a sessão pertence ao
--     atleta do plano, só o treinador do plano prescreve a sessão e ninguém
--     prescreve treino para si mesmo.
--
-- As faixas numéricas espelham lib/domain.ts: pace entre 2:30 e 12:00/km,
-- 2 a 6 dias por semana e no máximo 200 km por sessão.

begin;

-- ------------------------------------------------------------------ --
-- Vínculo treinador → atleta
-- ------------------------------------------------------------------ --
create table public.coach_athletes (
  coach_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (coach_id, athlete_id),
  check (coach_id <> athlete_id)
);
create index coach_athletes_athlete_idx on public.coach_athletes(athlete_id);

comment on table public.coach_athletes is
  'Quem pode prescrever treino para quem. Criado apenas por administradores.';

-- ------------------------------------------------------------------ --
-- Plano do atleta
-- ------------------------------------------------------------------ --
create table public.training_plans (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default '' check (char_length(title) <= 120),
  goal text not null check (goal in ('5k', '10k', '21k', '42k')),
  level text not null check (level in ('iniciante', 'intermediario', 'avancado')),
  base_pace_s integer not null check (base_pace_s between 150 and 720),
  weekly_km numeric(6,1) not null default 0 check (weekly_km between 0 and 300),
  days_per_week integer not null default 3 check (days_per_week between 2 and 6),
  starts_on date not null default current_date,
  notes text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (athlete_id <> coach_id)
);
create index training_plans_athlete_idx on public.training_plans(athlete_id, starts_on desc);
create index training_plans_coach_idx on public.training_plans(coach_id);
-- Um atleta tem no máximo um plano ativo; o histórico fica como inativo.
create unique index training_plans_one_active_idx
  on public.training_plans(athlete_id) where is_active;

comment on table public.training_plans is
  'Plano vigente de cada atleta: meta, nível, pace base e frequência semanal.';

-- ------------------------------------------------------------------ --
-- Sessões prescritas
-- ------------------------------------------------------------------ --
create table public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references public.training_plans(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  scheduled_date date not null,
  type_id text not null check (type_id in ('regenerativo', 'leve', 'longao', 'tempo', 'intervalado', 'prova')),
  distance_km numeric(5,1) not null check (distance_km > 0 and distance_km <= 200),
  target_pace_s integer not null check (target_pace_s between 150 and 720),
  note text not null default '',
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (athlete_id <> coach_id)
);
create index training_sessions_athlete_date_idx on public.training_sessions(athlete_id, scheduled_date);
create index training_sessions_plan_idx on public.training_sessions(plan_id);
-- Prescrever duas vezes o mesmo tipo no mesmo dia é o sintoma de uma
-- geração de semana repetida (retry, duplo toque): o banco recusa.
create unique index training_sessions_slot_idx
  on public.training_sessions(athlete_id, scheduled_date, type_id);

comment on table public.training_sessions is
  'Sessões prescritas pelo treinador, com ou sem plano (treino avulso).';

-- ------------------------------------------------------------------ --
-- Invariantes de autoria
-- ------------------------------------------------------------------ --
-- Quem pode prescrever para quem, independente do caminho de escrita (app,
-- service role ou backfill). A RLS continua valendo para os clientes.
create or replace function public.assert_training_authorship(p_athlete uuid, p_coach uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_athlete = p_coach then
    raise exception using
      message = 'Um corredor não prescreve treino para si mesmo',
      errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_coach and p.role = 'admin')
     and not exists (
       select 1 from public.coach_athletes ca
        where ca.coach_id = p_coach and ca.athlete_id = p_athlete
     ) then
    raise exception using
      message = 'Treinador sem vínculo com este atleta',
      errcode = '42501';
  end if;
end;
$$;

revoke all on function public.assert_training_authorship(uuid, uuid) from public;

create or replace function public.enforce_training_plan_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_training_authorship(new.athlete_id, new.coach_id);
  return new;
end;
$$;

create or replace function public.enforce_training_session_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.training_plans%rowtype;
begin
  perform public.assert_training_authorship(new.athlete_id, new.coach_id);

  if new.plan_id is not null then
    select * into v_plan from public.training_plans where id = new.plan_id;
    if not found then
      raise exception using message = 'Plano de treino não encontrado', errcode = 'P0002';
    end if;
    if v_plan.athlete_id <> new.athlete_id then
      raise exception using
        message = 'A sessão precisa pertencer ao atleta do plano',
        errcode = '23514';
    end if;
    if v_plan.coach_id <> new.coach_id then
      raise exception using
        message = 'Somente o treinador do plano pode prescrever a sessão',
        errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger training_plans_owner_guard
before insert or update of athlete_id, coach_id on public.training_plans
for each row execute function public.enforce_training_plan_ownership();

create trigger training_sessions_owner_guard
before insert or update of athlete_id, coach_id, plan_id on public.training_sessions
for each row execute function public.enforce_training_session_ownership();

-- ------------------------------------------------------------------ --
-- Auxiliares de permissão (usados pelas políticas)
-- ------------------------------------------------------------------ --
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.role = 'admin'
  );
$$;

create or replace function public.can_coach(p_athlete uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and (
       public.is_admin()
       or exists (
         select 1 from public.coach_athletes ca
          where ca.coach_id = auth.uid() and ca.athlete_id = p_athlete
       )
     );
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.can_coach(uuid) from public;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.can_coach(uuid) to authenticated, service_role;

-- ------------------------------------------------------------------ --
-- RLS: atleta lê, treinador/admin escreve
-- ------------------------------------------------------------------ --
alter table public.coach_athletes enable row level security;
alter table public.training_plans enable row level security;
alter table public.training_sessions enable row level security;

create policy "Coaches and athletes read their link" on public.coach_athletes
for select to authenticated
using (coach_id = auth.uid() or athlete_id = auth.uid());

create policy "Admins manage coach links" on public.coach_athletes
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Athletes read their own plans" on public.training_plans
for select to authenticated
using (athlete_id = auth.uid() or public.can_coach(athlete_id));

create policy "Coaches manage plans of their athletes" on public.training_plans
for all to authenticated
using (public.can_coach(athlete_id))
with check (public.can_coach(athlete_id) and athlete_id <> auth.uid());

create policy "Athletes read their own sessions" on public.training_sessions
for select to authenticated
using (athlete_id = auth.uid() or public.can_coach(athlete_id));

create policy "Coaches manage sessions of their athletes" on public.training_sessions
for all to authenticated
using (public.can_coach(athlete_id))
with check (public.can_coach(athlete_id) and athlete_id <> auth.uid());

-- O Supabase concede privilégios padrão a anon em tabelas novas do schema
-- public; estas tabelas são de corredor autenticado.
revoke all on public.coach_athletes from anon;
revoke all on public.training_plans from anon;
revoke all on public.training_sessions from anon;

commit;
