-- Riva Run initial schema (Supabase/PostgreSQL)
create extension if not exists pgcrypto;

create type public.app_role as enum ('participant', 'admin');
create type public.challenge_period as enum ('weekly', 'monthly');
create type public.activity_source as enum ('strava');
create type public.activity_status as enum ('pending', 'validated', 'rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 2 and 60),
  role public.app_role not null default 'participant',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  brand text not null check (char_length(trim(brand)) between 1 and 50),
  model text not null check (char_length(trim(model)) between 1 and 80),
  nickname text,
  retired_at timestamptz,
  created_at timestamptz not null default now()
);
create index shoes_user_id_idx on public.shoes(user_id);

-- Enforce the five-shoe limit in the database, including concurrent requests.
create or replace function public.enforce_shoe_limit()
returns trigger language plpgsql security definer set search_path = public
as $$
declare active_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  select count(*) into active_count from public.shoes
   where user_id = new.user_id and retired_at is null and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);
  if new.retired_at is null and active_count >= 5 then
    raise exception 'Limite de cinco tênis ativos por participante atingido';
  end if;
  return new;
end;
$$;
create trigger shoes_limit_before_write before insert or update of user_id, retired_at on public.shoes
for each row execute function public.enforce_shoe_limit();

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 3 and 100),
  description text not null default '',
  period public.challenge_period not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_published boolean not null default false,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table public.challenge_tasks (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 100),
  description text not null default '',
  target_value numeric(10,2) not null check (target_value > 0),
  unit text not null check (unit in ('km', 'runs', 'long_runs')),
  points integer not null check (points between 0 and 10000),
  created_at timestamptz not null default now()
);

create table public.challenge_memberships (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

-- OAuth credentials are server-only. No client-facing RLS policy is granted.
create table public.strava_connections (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  athlete_id bigint not null unique,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scopes text not null default '',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.strava_oauth_states (
  state text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null
);
create index strava_oauth_states_expiry_idx on public.strava_oauth_states(expires_at);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  shoe_id uuid references public.shoes(id) on delete set null,
  source public.activity_source not null default 'strava',
  external_activity_id bigint not null,
  activity_type text not null,
  title text not null default '',
  distance_m numeric(12,2) not null default 0 check (distance_m >= 0),
  moving_time_s integer not null default 0 check (moving_time_s >= 0),
  started_at timestamptz not null,
  status public.activity_status not null default 'pending',
  raw_summary jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_activity_id)
);
create index activities_user_started_idx on public.activities(user_id, started_at desc);

create table public.strava_webhook_events (
  object_id bigint not null,
  object_type text not null,
  aspect_type text not null,
  owner_id bigint not null,
  event_time bigint not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (object_id, object_type, aspect_type, event_time)
);

create table public.task_completions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.challenge_tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  progress numeric(10,2) not null default 0 check (progress >= 0),
  completed_at timestamptz,
  awarded_points integer not null default 0 check (awarded_points >= 0),
  updated_at timestamptz not null default now(),
  unique (task_id, user_id)
);

-- Create profile rows when a new Supabase Auth user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), 'Corredor'))
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.shoes enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_tasks enable row level security;
alter table public.challenge_memberships enable row level security;
alter table public.activities enable row level security;
alter table public.task_completions enable row level security;
alter table public.strava_connections enable row level security;
alter table public.strava_oauth_states enable row level security;
alter table public.strava_webhook_events enable row level security;

create policy "Profiles are visible to authenticated users" on public.profiles
for select to authenticated using (true);
create policy "Users can update their own profile" on public.profiles
for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create policy "Users manage their own shoes" on public.shoes
for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Published challenges are visible to authenticated users" on public.challenges
for select to authenticated using (is_published = true or created_by = auth.uid());
create policy "Admins manage challenges" on public.challenges
for all to authenticated using (exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Tasks for visible challenges" on public.challenge_tasks
for select to authenticated using (exists(select 1 from public.challenges c where c.id = challenge_id and (c.is_published = true or c.created_by = auth.uid())));
create policy "Admins manage tasks" on public.challenge_tasks
for all to authenticated using (exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Users can view memberships" on public.challenge_memberships
for select to authenticated using (true);
create policy "Users can join challenges" on public.challenge_memberships
for insert to authenticated with check (auth.uid() = user_id and exists(select 1 from public.challenges c where c.id = challenge_id and c.is_published = true));
create policy "Admins manage memberships" on public.challenge_memberships
for all to authenticated using (exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Users view their own activities" on public.activities
for select to authenticated using (auth.uid() = user_id);
create policy "Users can associate their own shoe" on public.activities
for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id and (shoe_id is null or exists(select 1 from public.shoes s where s.id = shoe_id and s.user_id = auth.uid())));

create policy "Users view task progress" on public.task_completions
for select to authenticated using (auth.uid() = user_id);
-- Writes to OAuth state, tokens, webhook events, activities and scoring are server-only via service role.
-- Do not create client policies for strava_connections, strava_oauth_states or strava_webhook_events.
