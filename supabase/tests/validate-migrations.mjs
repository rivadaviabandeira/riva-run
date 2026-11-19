#!/usr/bin/env node
/**
 * Validação local das migrations do PaceHub.
 *
 * Roda um Postgres 17 de verdade (PGlite/WASM), recria o mínimo que o Supabase
 * fornece (schema `auth`, papéis `anon`/`authenticated`/`service_role` e os
 * grants padrão), aplica as migrations do repo e exercita as funções criadas
 * por elas.
 *
 * Uso: npm run db:test
 *
 * Observação: `create extension pgcrypto` é removido do 001 apenas neste
 * harness — o PGlite não distribui a extensão e `gen_random_uuid()` é nativo
 * no Postgres 13+. O restante do SQL é executado exatamente como está no repo.
 *
 * Cobre também as tabelas de treino prescrito (004): plano único por atleta,
 * sessões e RLS de leitura para o atleta com escrita restrita ao treinador.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const readMigration = (file) => readFileSync(resolve(root, "supabase/migrations", file), "utf8");
const firstLine = (error) => String(error?.message ?? error).split("\n")[0].slice(0, 160);

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
const USER_C = "33333333-3333-3333-3333-333333333333";
const SHOE_A = "aaaaaaaa-0000-0000-0000-000000000001";
const CHALLENGE = "cccccccc-0000-0000-0000-000000000001";

const db = new PGlite();
const query = async (sql, params) => (await db.query(sql, params)).rows;
const scalar = async (sql, params) => {
  const rows = await query(sql, params);
  return rows[0] ? Object.values(rows[0])[0] : undefined;
};
const expectError = async (name, sql, params = [], expected = "") => {
  try {
    await db.query(sql, params);
    check(name, false, "nenhum erro foi lançado");
  } catch (error) {
    const message = firstLine(error);
    check(name, message.toLowerCase().includes(expected.toLowerCase()), message);
  }
};

// ------------------------------------------------------------------ --
// Ambiente mínimo equivalente ao Supabase
// ------------------------------------------------------------------ --
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to authenticated, service_role;
  alter default privileges in schema public grant all on sequences to authenticated, service_role;

  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
`);

try {
  await db.exec(
    readMigration("001_initial_schema.sql").replace(
      /create extension if not exists pgcrypto;/i,
      "-- pgcrypto dispensável no teste local: gen_random_uuid() é nativo",
    ),
  );
  await db.exec(readMigration("002_gamification.sql"));
  await db.exec(readMigration("003_pacestore_rpcs.sql"));
  await db.exec(readMigration("004_training_plans.sql"));
  await db.exec(readMigration("005_training_done_rpc.sql"));
  await db.exec(readMigration("006_strava_status.sql"));
  check("001 a 006 aplicam sem erro", true);
} catch (error) {
  check("001 a 006 aplicam sem erro", false, firstLine(error));
  console.error(error);
  process.exit(1);
}

// ------------------------------------------------------------------ --
// Dados de teste
// ------------------------------------------------------------------ --
await db.exec(`
  insert into auth.users (id, raw_user_meta_data) values
    ('${USER_A}', '{"display_name":"Lucas Almeida"}'::jsonb),
    ('${USER_B}', '{"display_name":"Ana Ferreira"}'::jsonb);

  insert into public.shoes (id, user_id, brand, model)
  values ('${SHOE_A}', '${USER_A}', 'ASICS', 'Novablast 4');

  insert into public.activities
    (id, user_id, shoe_id, source, external_activity_id, activity_type, title, distance_m, moving_time_s, started_at, status)
  values
    ('b0000000-0000-0000-0000-000000000001', '${USER_A}', '${SHOE_A}', 'strava', 1001, 'Run', 'Corrida 1', 5000, 1500, date_trunc('week', now()) + interval '1 day 6 hours', 'validated'),
    ('b0000000-0000-0000-0000-000000000002', '${USER_A}', '${SHOE_A}', 'strava', 1002, 'Run', 'Corrida 2', 5000, 1500, date_trunc('week', now()) + interval '2 days 6 hours', 'validated'),
    ('b0000000-0000-0000-0000-000000000003', '${USER_A}', '${SHOE_A}', 'strava', 1003, 'Run', 'Corrida 3', 5000, 1500, date_trunc('week', now()) + interval '3 days 6 hours', 'validated'),
    ('b0000000-0000-0000-0000-000000000004', '${USER_A}', '${SHOE_A}', 'strava', 1004, 'Run', 'Corrida 4', 5000, 1600, date_trunc('week', now()) - interval '5 days 6 hours', 'validated'),
    ('b0000000-0000-0000-0000-000000000005', '${USER_A}', '${SHOE_A}', 'strava', 1005, 'Run', 'Corrida 5', 5000, 1600, date_trunc('week', now()) - interval '4 days 6 hours', 'validated'),
    ('b0000000-0000-0000-0000-000000000006', '${USER_A}', '${SHOE_A}', 'strava', 1006, 'Run', 'Corrida 6', 5000, 1600, date_trunc('week', now()) - interval '3 days 6 hours', 'validated');
`);

check("trigger handle_new_user cria os perfis", (await scalar("select count(*)::int from public.profiles")) === 2);

// ------------------------------------------------------------------ --
// 006: status da conexão Strava sem expor tokens
// ------------------------------------------------------------------ --
await db.exec(`
  insert into public.strava_connections (user_id, athlete_id, access_token, refresh_token, expires_at, scopes)
  values ('${USER_A}', 987654, 'access-a', 'refresh-a', now() + interval '6 hours', 'read,activity:read');
`);

const stravaViewColumns = (
  await query(
    `select column_name::text as name
       from information_schema.columns
      where table_schema = 'public' and table_name = 'strava_connection_status'`,
  )
).map((row) => row.name);
check(
  "006 status do Strava expõe apenas campos públicos",
  stravaViewColumns.length === 4 &&
    ["athlete_id", "scopes", "connected_at", "updated_at"].every((name) =>
      stravaViewColumns.includes(name),
    ),
  stravaViewColumns.join(", "),
);

await db.exec(`select set_config('request.jwt.claim.sub', '${USER_A}', false); set role authenticated;`);
const ownStravaStatus = await query("select athlete_id from public.strava_connection_status");
check(
  "006 atleta vê a própria conexão Strava",
  ownStravaStatus.length === 1 && Number(ownStravaStatus[0].athlete_id) === 987654,
);
await db.exec(`select set_config('request.jwt.claim.sub', '${USER_B}', false);`);
check(
  "006 outro atleta não vê a conexão alheia",
  (await query("select athlete_id from public.strava_connection_status")).length === 0,
);
await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);");
await db.exec("set role anon;");
await expectError(
  "006 anon não lê o status do Strava",
  "select athlete_id from public.strava_connection_status",
  [],
  "permission denied",
);
await db.exec("reset role;");

const recalc = async (userId = USER_A) => {
  const raw = await scalar("select public.recalculate_user_progress($1) as result", [userId]);
  return typeof raw === "string" ? JSON.parse(raw) : raw;
};

const ledgerTotals = async (userId = USER_A) =>
  Object.fromEntries(
    (
      await query(
        `select kind::text as kind,
                coalesce(sum(points), 0)::numeric as total,
                count(*)::int as rows
           from public.points_ledger
          where user_id = $1
          group by kind`,
        [userId],
      )
    ).map((row) => [row.kind, { total: Number(row.total), rows: Number(row.rows) }]),
  );

// ------------------------------------------------------------------ --
// Pontuação: 1 km = 1 PP, +5 PP por semana com 3 treinos
// ------------------------------------------------------------------ --
let summary = await recalc();
check("6 corridas validadas de 5 km = 30 PP", Number(summary.km) === 30, `km=${summary.km}`);
check("PP de carreira = 30 km + 2 semanas (2 x 5)", Number(summary.lifetime_pp) === 40, `lifetime=${summary.lifetime_pp}`);
check("saldo inicial igual ao PP de carreira", Number(summary.balance_pp) === 40, `saldo=${summary.balance_pp}`);
check("sequência de semanas = 2", Number(summary.streak_weeks) === 2, `streak=${summary.streak_weeks}`);

let totals = await ledgerTotals();
check("livro-razão tem 6 lançamentos de atividade somando 30 PP", totals.activity?.rows === 6 && totals.activity?.total === 30);
check("livro-razão tem 2 bônus semanais de 5 PP", totals.weekly_bonus?.rows === 2 && totals.weekly_bonus?.total === 10);

const unlocked = await scalar(
  "select count(*)::int from public.user_achievements where user_id = $1 and unlocked_at is not null",
  [USER_A],
);
check("4 medalhas desbloqueadas (2 passos/constância + 2 performance)", unlocked === 4, `desbloqueadas=${unlocked}`);
check(
  "medalha de 10 corridas permanece bloqueada com 6 corridas",
  (await scalar(
    "select count(*)::int from public.user_achievements where user_id = $1 and achievement_id = 'passos-2' and unlocked_at is null",
    [USER_A],
  )) === 1,
);

// ------------------------------------------------------------------ --
// Idempotência
// ------------------------------------------------------------------ --
const before = await ledgerTotals();
summary = await recalc();
summary = await recalc();
const after = await ledgerTotals();
check(
  "recálculo repetido não duplica lançamentos",
  JSON.stringify(before) === JSON.stringify(after),
  `antes=${JSON.stringify(before)} depois=${JSON.stringify(after)}`,
);
check("medalhas não são duplicadas em recálculos", (await scalar("select count(*)::int from public.user_achievements where user_id = $1", [USER_A])) === 9);

// ------------------------------------------------------------------ --
// Bônus de desafio e resgates
// ------------------------------------------------------------------ --
await db.exec(`
  insert into public.challenges (id, title, period, starts_at, ends_at, is_published, created_by)
  values ('${CHALLENGE}', 'Semana em movimento', 'weekly', now() - interval '1 day', now() + interval '5 days', true, '${USER_A}');

  insert into public.challenge_completions (challenge_id, user_id)
  values ('${CHALLENGE}', '${USER_A}');
`);

summary = await recalc();
check("desafio concluído adiciona 15 PP", Number(summary.lifetime_pp) === 55, `lifetime=${summary.lifetime_pp}`);
totals = await ledgerTotals();
check("bônus de desafio registrado uma única vez", totals.challenge_bonus?.rows === 1 && totals.challenge_bonus?.total === 15);

await db.exec(`
  insert into public.points_ledger (user_id, kind, points, reference, description)
  values ('${USER_A}', 'redemption', -20, 'redemption:teste-1', 'Resgate de teste');
`);
summary = await recalc();
check("resgate reduz o saldo sem reduzir o XP", Number(summary.lifetime_pp) === 55 && Number(summary.balance_pp) === 35, `lifetime=${summary.lifetime_pp} saldo=${summary.balance_pp}`);

await expectError(
  "livro-razão rejeita resgate com pontos positivos",
  `insert into public.points_ledger (user_id, kind, points, reference) values ('${USER_A}', 'redemption', 10, 'redemption:invalido')`,
);
await expectError(
  "livro-razão rejeita bônus com pontos negativos",
  `insert into public.points_ledger (user_id, kind, points, reference) values ('${USER_A}', 'weekly_bonus', -5, 'week:invalida')`,
);
await expectError(
  "unique (source, external_activity_id) bloqueia atividade duplicada",
  `insert into public.activities (user_id, source, external_activity_id, activity_type, title, distance_m, moving_time_s, started_at, status)
   values ('${USER_A}', 'strava', 1001, 'Run', 'Duplicada', 5000, 1500, now(), 'validated')`,
);

// ------------------------------------------------------------------ --
// Atividade rejeitada sai da pontuação
// ------------------------------------------------------------------ --
await db.exec(`update public.activities set status = 'rejected' where id = 'b0000000-0000-0000-0000-000000000001'`);
summary = await recalc();
totals = await ledgerTotals();
check("corrida rejeitada sai do livro-razão (25 km)", totals.activity?.total === 25, `km=${totals.activity?.total}`);
check(
  "semana que perdeu a meta deixa de render bônus",
  totals.weekly_bonus?.rows === 1 && totals.weekly_bonus?.total === 5,
  `semanas=${totals.weekly_bonus?.rows}`,
);
check(
  "lifetime = atividades + bônus semanais + desafios",
  Number(summary.lifetime_pp) === 45,
  `lifetime=${summary.lifetime_pp}`,
);
check("saldo = lifetime - resgates", Number(summary.balance_pp) === 25, `saldo=${summary.balance_pp}`);

// ------------------------------------------------------------------ --
// Views de apoio ao agente
// ------------------------------------------------------------------ --
await db.exec(`
  insert into public.activities (id, user_id, source, external_activity_id, activity_type, title, distance_m, moving_time_s, started_at, status)
  select 'b0000000-0000-0000-0000-000000000007', '${USER_A}', 'strava', 1007, 'Run', 'Mesmo horário', distance_m, 1500, started_at, 'validated'
    from public.activities where id = 'b0000000-0000-0000-0000-000000000002';
`);
check(
  "duplicate_activity_candidates aponta duplicidade por horário e distância",
  (await scalar("select count(*)::int from public.duplicate_activity_candidates where copies > 1")) === 2,
);
check(
  "shoe_mileage soma apenas atividades validadas associadas",
  Number(await scalar("select km from public.shoe_mileage where shoe_id = $1", [SHOE_A])) === 25,
  `km=${await scalar("select km from public.shoe_mileage where shoe_id = $1", [SHOE_A])}`,
);

// ------------------------------------------------------------------ --
// RLS e privilégios
// ------------------------------------------------------------------ --
await db.exec(`
  insert into public.activities (id, user_id, source, external_activity_id, activity_type, title, distance_m, moving_time_s, started_at, status)
  values ('b0000000-0000-0000-0000-000000000101', '${USER_B}', 'strava', 2001, 'Run', 'Corrida B', 4000, 1600, date_trunc('week', now()) + interval '1 day 7 hours', 'validated');
`);
await recalc(USER_B);

await db.exec(`set role authenticated; set request.jwt.claim.sub = '${USER_A}';`);
check(
  "RLS: corredor lê o próprio extrato",
  (await scalar("select count(*)::int from public.points_ledger")) > 0,
);
check(
  "RLS: corredor não vê o extrato de outra pessoa",
  (await scalar("select count(*)::int from public.points_ledger where user_id = $1", [USER_B])) === 0,
);
check(
  "RLS: corredor não vê medalhas de outra pessoa",
  (await scalar("select count(*)::int from public.user_achievements where user_id = $1", [USER_B])) === 0,
);
check("catálogo de recompensas visível para autenticados", (await scalar("select count(*)::int from public.rewards")) === 3);
check("catálogo de produtos visível para autenticados", (await scalar("select count(*)::int from public.products")) === 3);

await expectError(
  "RLS: corredor não escreve no livro-razão",
  `insert into public.points_ledger (user_id, kind, points, reference) values ('${USER_A}', 'activity', 99, 'activity:hack')`,
);
await expectError(
  "RLS: corredor não executa o recálculo de progresso",
  `select public.recalculate_user_progress('${USER_A}')`,
);
check(
  "RLS: corredor não enxerga o log do agente de dados",
  (await scalar("select count(*)::int from public.steward_runs")) === 0,
);
await expectError(
  "RLS: corredor não escreve no log do agente de dados",
  `insert into public.steward_runs (status) values ('succeeded')`,
);
await db.exec("reset role");

// ------------------------------------------------------------------ --
// Limite de cinco tênis
// ------------------------------------------------------------------ --
await db.exec(`
  insert into public.shoes (user_id, brand, model)
  select '${USER_A}', 'MARCA ' || g, 'MODELO ' || g from generate_series(2, 5) as g;
`);
check("limite de 5 pares: cinco cadastros aceitos", (await scalar("select count(*)::int from public.shoes where user_id = $1", [USER_A])) === 5);
await expectError(
  "limite de 5 pares: sexto tênis é bloqueado pelo banco",
  `insert into public.shoes (user_id, brand, model) values ('${USER_A}', 'EXTRA', 'MODELO 6')`,
);

// ------------------------------------------------------------------ --
// Dados inválidos não podem pontuar, fechar meta nem desbloquear medalhas
// ------------------------------------------------------------------ --
await db.exec(`
  insert into auth.users (id, raw_user_meta_data)
  values ('${USER_C}', '{"display_name":"Teste Inválidos"}'::jsonb);

  insert into public.activities
    (id, user_id, source, external_activity_id, activity_type, title, distance_m, moving_time_s, started_at, status)
  values
    ('c0000000-0000-0000-0000-000000000001', '${USER_C}', 'strava', 3001, 'Run', 'Trote 400 m A', 400, 150, date_trunc('week', now()) + interval '1 day 7 hours', 'validated'),
    ('c0000000-0000-0000-0000-000000000002', '${USER_C}', 'strava', 3002, 'Run', 'Trote 400 m B', 400, 150, date_trunc('week', now()) + interval '2 days 7 hours', 'validated'),
    ('c0000000-0000-0000-0000-000000000003', '${USER_C}', 'strava', 3003, 'Run', 'Trote 400 m C', 400, 150, date_trunc('week', now()) + interval '3 days 7 hours', 'validated'),
    ('c0000000-0000-0000-0000-000000000004', '${USER_C}', 'strava', 3004, 'Run', 'Sem tempo de movimento', 5000, 0, date_trunc('week', now()) + interval '4 days 7 hours', 'validated'),
    ('c0000000-0000-0000-0000-000000000005', '${USER_C}', 'strava', 3005, 'Run', 'Rodagem válida', 5000, 1800, date_trunc('week', now()) + interval '5 days 7 hours', 'validated');
`);

const invalidSummary = await recalc(USER_C);
const invalidTotals = await ledgerTotals(USER_C);
check(
  "corridas de 400 m não entram no livro-razão",
  invalidTotals.activity?.rows === 2 && invalidTotals.activity?.total === 10,
  `lançamentos=${invalidTotals.activity?.rows} total=${invalidTotals.activity?.total}`,
);
check(
  "corridas de 400 m não contam como treino da meta",
  Number(invalidSummary.runs) === 2,
  `runs=${invalidSummary.runs}`,
);
check(
  "semana com 3 trotes curtos não rende bônus",
  invalidTotals.weekly_bonus === undefined,
  `bonus=${JSON.stringify(invalidTotals.weekly_bonus ?? null)}`,
);
check("sem meta cumprida a sequência é zero", Number(invalidSummary.streak_weeks) === 0);
check(
  "atividade sem tempo de movimento não gera pace 00:00",
  Number(invalidSummary.best_pace_s) === 360,
  `pace=${invalidSummary.best_pace_s}`,
);
check(
  "nenhuma medalha de performance desbloqueada por pace inválido",
  (await scalar(
    "select count(*)::int from public.user_achievements where user_id = $1 and achievement_id like 'performance-%' and unlocked_at is not null",
    [USER_C],
  )) === 0,
);
check(
  "km do resumo = km do livro-razão",
  Number(invalidSummary.km) === Number(invalidTotals.activity?.total),
  `resumo=${invalidSummary.km} livro=${invalidTotals.activity?.total}`,
);

const USER_EMPTY = "44444444-4444-4444-4444-444444444444";
await db.exec(`insert into auth.users (id, raw_user_meta_data) values ('${USER_EMPTY}', '{"display_name":"Teste Vazio"}'::jsonb)`);
const emptySummary = await recalc(USER_EMPTY);
check(
  "usuário sem atividades não quebra o recálculo e zera tudo",
  Number(emptySummary.lifetime_pp) === 0 &&
    Number(emptySummary.balance_pp) === 0 &&
    Number(emptySummary.runs) === 0 &&
    Number(emptySummary.streak_weeks) === 0 &&
    emptySummary.best_pace_s === null,
  JSON.stringify(emptySummary),
);
check(
  "usuário sem atividades recebe as 9 medalhas bloqueadas",
  (await scalar(
    "select count(*)::int from public.user_achievements where user_id = $1 and unlocked_at is null",
    [USER_EMPTY],
  )) === 9,
);

// ------------------------------------------------------------------ --
// PaceStore: resgate e pedido via RPC (SECURITY DEFINER)
// ------------------------------------------------------------------ --
const USER_STORE = "55555555-5555-5555-5555-555555555555";
const REWARD_CHEAP = "dddddddd-0000-0000-0000-000000000001";
const REWARD_SOLD_OUT = "dddddddd-0000-0000-0000-000000000002";
const REWARD_INACTIVE = "dddddddd-0000-0000-0000-000000000003";
const REWARD_MISSING = "dddddddd-0000-0000-0000-0000000000ff";
const PRODUCT_INACTIVE = "ffffffff-0000-0000-0000-000000000001";
const PRODUCT_MISSING = "ffffffff-0000-0000-0000-0000000000ff";

const callRpc = async (expression, params = []) => {
  const raw = await scalar(`select ${expression} as result`, params);
  return typeof raw === "string" ? JSON.parse(raw) : raw;
};
const ledgerSum = async (userId, filter = "true") =>
  Number(
    await scalar(
      `select coalesce(sum(points), 0) from public.points_ledger where user_id = $1 and ${filter}`,
      [userId],
    ),
  );

await db.exec(`
  -- O bloco de RLS acima deixou o claim do JWT na sessão; aqui falamos como
  -- servidor (service role), sem usuário autenticado.
  select set_config('request.jwt.claim.sub', '', false);

  insert into auth.users (id, raw_user_meta_data)
  values ('${USER_STORE}', '{"display_name":"Teste Loja"}'::jsonb);

  insert into public.activities
    (id, user_id, source, external_activity_id, activity_type, title, distance_m, moving_time_s, started_at, status)
  values
    ('e0000000-0000-0000-0000-000000000001', '${USER_STORE}', 'strava', 5001, 'Run', 'Longão 1', 20000, 6600, date_trunc('week', now()) + interval '1 day 6 hours', 'validated'),
    ('e0000000-0000-0000-0000-000000000002', '${USER_STORE}', 'strava', 5002, 'Run', 'Longão 2', 20000, 6600, date_trunc('week', now()) + interval '2 days 6 hours', 'validated'),
    ('e0000000-0000-0000-0000-000000000003', '${USER_STORE}', 'strava', 5003, 'Run', 'Longão 3', 20000, 6600, date_trunc('week', now()) + interval '3 days 6 hours', 'validated');

  insert into public.rewards (id, name, description, category, cost_pp, stock) values
    ('${REWARD_CHEAP}', 'Recompensa de teste', 'Item usado no harness', 'Teste', 20, 2),
    ('${REWARD_SOLD_OUT}', 'Recompensa esgotada', 'Estoque zerado', 'Teste', 10, 0),
    ('${REWARD_INACTIVE}', 'Recompensa antiga', 'Fora do catálogo', 'Teste', 10, null);

  update public.rewards set is_active = false where id = '${REWARD_INACTIVE}';

  insert into public.products (id, name, description, origin, price_brl, is_active)
  values ('${PRODUCT_INACTIVE}', 'Produto fora de linha', 'Descontinuado', 'propria', 59.90, false);
`);

const productId = async (name) => scalar("select id from public.products where name = $1", [name]);
const BONE = await productId("Boné PaceHub");
const MEDAL = await productId("Medalha Física Extra");

const storeStart = await recalc(USER_STORE);
check(
  "usuário de teste da loja começa com 65 PP",
  Number(storeStart.lifetime_pp) === 65 && Number(storeStart.balance_pp) === 65,
  `lifetime=${storeStart.lifetime_pp} saldo=${storeStart.balance_pp}`,
);

// --- resgate: caminho feliz ----------------------------------------
const redemption = await callRpc("public.redeem_reward($1, $2)", [REWARD_CHEAP, USER_A]);
check(
  "resgate de 20 PP debita o saldo e devolve o restante",
  Number(redemption.cost_pp) === 20 && Number(redemption.balance_pp) === 5,
  JSON.stringify(redemption),
);
check(
  "resgate grava o pedido pendente com o nome da recompensa",
  (await scalar(
    "select count(*)::int from public.redemptions where id = $1 and status = 'pending' and reward_name = 'Recompensa de teste' and cost_pp = 20",
    [redemption.redemption_id],
  )) === 1,
);
check(
  "resgate baixa o estoque da recompensa",
  Number(await scalar("select stock from public.rewards where id = $1", [REWARD_CHEAP])) === 1,
);
check(
  "resgate lança um único débito de 20 PP no livro-razão",
  (await scalar(
    "select count(*)::int from public.points_ledger where user_id = $1 and kind = 'redemption' and reference = $2",
    [USER_A, `redemption:${redemption.redemption_id}`],
  )) === 1 && (await ledgerSum(USER_A, `reference = 'redemption:${redemption.redemption_id}'`)) === -20,
);
check(
  "saldo do livro-razão bate com o retorno da RPC",
  (await ledgerSum(USER_A)) === 5,
  `saldo=${await ledgerSum(USER_A)}`,
);

// --- resgate: saldo insuficiente -----------------------------------
const redemptionsBefore = Number(await scalar("select count(*)::int from public.redemptions"));
await expectError(
  "resgate recusa saldo insuficiente",
  "select public.redeem_reward($1, $2)",
  [REWARD_CHEAP, USER_A],
  "Saldo insuficiente",
);
check(
  "resgate recusado não cria pedido nem debita PP",
  Number(await scalar("select count(*)::int from public.redemptions")) === redemptionsBefore &&
    (await ledgerSum(USER_A)) === 5,
  `saldo=${await ledgerSum(USER_A)}`,
);
await expectError(
  "resgate recusa recompensa esgotada",
  "select public.redeem_reward($1, $2)",
  [REWARD_SOLD_OUT, USER_A],
  "esgotada",
);
await expectError(
  "resgate recusa recompensa inativa",
  "select public.redeem_reward($1, $2)",
  [REWARD_INACTIVE, USER_A],
  "indisponível",
);
await expectError(
  "resgate recusa recompensa inexistente",
  "select public.redeem_reward($1, $2)",
  [REWARD_MISSING, USER_A],
  "não encontrada",
);
check(
  "recompensa esgotada não teve o estoque alterado",
  Number(await scalar("select stock from public.rewards where id = $1", [REWARD_SOLD_OUT])) === 0,
);

// --- pedido: teto de 20%, débito e saldo ---------------------------
// Boné de R$ 79,90: teto de 20% = R$ 15,98 = 159,8 PP.
await expectError(
  "pedido recusa PP acima do teto de 20% do produto",
  "select public.create_product_order($1, $2, $3)",
  [BONE, 159.9, USER_STORE],
  "teto de 20%",
);
const order = await callRpc("public.create_product_order($1, $2, $3)", [BONE, 40, USER_STORE]);
check(
  "pedido dentro do teto debita 40 PP e cobra o preço com desconto",
  Number(order.pp_used) === 40 &&
    Number(order.discount_brl) === 4 &&
    Number(order.paid_brl) === 75.9 &&
    Number(order.balance_pp) === 25,
  JSON.stringify(order),
);
check(
  "pedido lança o débito de compra ligado ao pedido",
  (await scalar(
    "select count(*)::int from public.points_ledger where user_id = $1 and kind = 'purchase' and reference = $2",
    [USER_STORE, `purchase:${order.order_id}`],
  )) === 1 && (await ledgerSum(USER_STORE, "kind = 'purchase'")) === -40,
);

const defaultOrder = await callRpc("public.create_product_order($1, null, $2)", [BONE, USER_STORE]);
check(
  "pedido sem informar PP usa o menor entre teto e saldo (25 PP)",
  Number(defaultOrder.pp_used) === 25 &&
    Number(defaultOrder.discount_brl) === 2.5 &&
    Number(defaultOrder.paid_brl) === 77.4 &&
    Number(defaultOrder.balance_pp) === 0 &&
    Number(defaultOrder.max_pp) === 159.8,
  JSON.stringify(defaultOrder),
);

const ordersBefore = Number(await scalar("select count(*)::int from public.product_orders"));
await expectError(
  "pedido recusa saldo insuficiente",
  "select public.create_product_order($1, $2, $3)",
  [MEDAL, 10, USER_STORE],
  "Saldo insuficiente",
);
check(
  "pedido recusado não cria registro nem debita PP",
  Number(await scalar("select count(*)::int from public.product_orders")) === ordersBefore &&
    (await ledgerSum(USER_STORE)) === 0,
  `saldo=${await ledgerSum(USER_STORE)}`,
);

const zeroOrder = await callRpc("public.create_product_order($1, $2, $3)", [MEDAL, 0, USER_STORE]);
check(
  "pedido sem PP cobra o preço cheio e não gera lançamento",
  Number(zeroOrder.pp_used) === 0 &&
    Number(zeroOrder.paid_brl) === 49.9 &&
    (await scalar(
      "select count(*)::int from public.points_ledger where user_id = $1 and reference = $2",
      [USER_STORE, `purchase:${zeroOrder.order_id}`],
    )) === 0,
  JSON.stringify(zeroOrder),
);
await expectError(
  "pedido recusa PP negativo",
  "select public.create_product_order($1, $2, $3)",
  [MEDAL, -5, USER_STORE],
  "não pode ser negativo",
);
await expectError(
  "pedido recusa produto inativo",
  "select public.create_product_order($1, $2, $3)",
  [PRODUCT_INACTIVE, 0, USER_STORE],
  "indisponível",
);
await expectError(
  "pedido recusa produto inexistente",
  "select public.create_product_order($1, $2, $3)",
  [PRODUCT_MISSING, 0, USER_STORE],
  "não encontrado",
);

check(
  "total gasto na loja = resgates + pedidos (65 PP)",
  (await ledgerSum(USER_STORE, "kind in ('redemption', 'purchase')")) === -65,
  `gasto=${await ledgerSum(USER_STORE, "kind in ('redemption', 'purchase')")}`,
);
const storeRecalc = await recalc(USER_STORE);
check(
  "recálculo de progresso preserva resgates e pedidos no saldo",
  Number(storeRecalc.lifetime_pp) === 65 && Number(storeRecalc.balance_pp) === 0,
  `lifetime=${storeRecalc.lifetime_pp} saldo=${storeRecalc.balance_pp}`,
);
check(
  "view de saldo reflete o consumo da loja",
  Number(await scalar("select balance_pp from public.user_points_summary where user_id = $1", [USER_A])) === 5 &&
    Number(await scalar("select lifetime_pp from public.user_points_summary where user_id = $1", [USER_A])) === 45,
);

// --- RPC pelo corredor autenticado ---------------------------------
await db.exec(`set role authenticated; set request.jwt.claim.sub = '${USER_A}';`);
check(
  "corredor lê o próprio resgate pela RLS",
  (await scalar("select count(*)::int from public.redemptions")) === 1,
);
check(
  "corredor não lê pedidos de outra pessoa",
  (await scalar("select count(*)::int from public.product_orders where user_id = $1", [USER_STORE])) === 0,
);
const selfOrder = await callRpc("public.create_product_order($1, $2)", [MEDAL, 5]);
check(
  "corredor autenticado cria o próprio pedido e debita o saldo",
  Number(selfOrder.pp_used) === 5 &&
    Number(selfOrder.paid_brl) === 49.4 &&
    Number(selfOrder.balance_pp) === 0,
  JSON.stringify(selfOrder),
);
await expectError(
  "pedido recusa usuário diferente do autenticado",
  "select public.create_product_order($1, $2, $3)",
  [MEDAL, 0, USER_B],
  "própria conta",
);
await expectError(
  "resgate recusa usuário diferente do autenticado",
  "select public.redeem_reward($1, $2)",
  [REWARD_CHEAP, USER_B],
  "própria conta",
);
await expectError(
  "corredor não insere resgate direto na tabela",
  `insert into public.redemptions (user_id, reward_name, cost_pp) values ('${USER_A}', 'Hack', 1)`,
  [],
  "permission denied",
);
check(
  "saldo de quem sofreu a tentativa de resgate não muda",
  Number(await scalar("select count(*)::int from public.points_ledger where user_id = $1 and kind = 'redemption'", [USER_B])) === 0,
);

await db.exec("set role anon;");
await expectError(
  "anon não executa o resgate",
  "select public.redeem_reward($1)",
  [REWARD_CHEAP],
  "permission denied",
);
await expectError(
  "anon não executa o pedido de produto",
  "select public.create_product_order($1, $2, $3)",
  [MEDAL, 0, USER_A],
  "permission denied",
);
await db.exec("reset role");

// ------------------------------------------------------------------ --
// Treinos prescritos (004): plano do treinador, sessões e RLS por atleta
// ------------------------------------------------------------------ --
const USER_COACH = "66666666-6666-6666-6666-666666666666";
const USER_ATHLETE = "77777777-7777-7777-7777-777777777777";
const USER_ADMIN = "88888888-8888-8888-8888-888888888888";
const PLAN_MAIN = "a1000000-0000-0000-0000-000000000001";
const PLAN_TEMP = "a1000000-0000-0000-0000-000000000002";
const SESSION_LEVE = "a2000000-0000-0000-0000-000000000001";
const SESSION_INTERVAL = "a2000000-0000-0000-0000-000000000002";
const SESSION_TEMP = "a2000000-0000-0000-0000-000000000003";
const WEEK = "date_trunc('week', now())::date";

const loginAs = (userId) =>
  db.exec(`select set_config('request.jwt.claim.sub', '${userId}', false); set role authenticated;`);
const logout = () => db.exec("select set_config('request.jwt.claim.sub', '', false); reset role;");
const expectOk = async (name, sql) => {
  try {
    await db.exec(sql);
    check(name, true);
  } catch (error) {
    check(name, false, firstLine(error));
  }
};
const changedRows = async (sql) => (await db.query(sql)).rows.length;

// O bloco anterior deixa o claim de USER_A na sessão; limpe antes do setup.
await logout();
await db.exec(`
  insert into auth.users (id, raw_user_meta_data) values
    ('${USER_COACH}', '{"display_name":"Treinador"}'::jsonb),
    ('${USER_ATHLETE}', '{"display_name":"Atleta"}'::jsonb),
    ('${USER_ADMIN}', '{"display_name":"Admin"}'::jsonb);

  update public.profiles set role = 'admin' where id = '${USER_ADMIN}';
  insert into public.coach_athletes (coach_id, athlete_id)
  values ('${USER_COACH}', '${USER_ATHLETE}');
`);
check(
  "setup promove o admin e cria o vínculo treinador→atleta",
  (await scalar("select role::text from public.profiles where id = $1", [USER_ADMIN])) === "admin" &&
    (await scalar("select count(*)::int from public.coach_athletes")) === 1,
);

// --- treinador vinculado escreve o plano e as sessões ---------------
await loginAs(USER_COACH);
await expectOk(
  "treinador vinculado cria o plano do atleta",
  `insert into public.training_plans
     (id, athlete_id, coach_id, title, goal, level, base_pace_s, weekly_km, days_per_week, starts_on)
   values ('${PLAN_MAIN}', '${USER_ATHLETE}', '${USER_COACH}', 'Bloco de 21k', '21k', 'intermediario', 330, 24, 4, ${WEEK})`,
);
check(
  "plano gravado com atleta, treinador e meta corretos",
  (await scalar(
    "select count(*)::int from public.training_plans where id = $1 and athlete_id = $2 and coach_id = $3 and goal = '21k' and is_active",
    [PLAN_MAIN, USER_ATHLETE, USER_COACH],
  )) === 1,
);
await expectOk(
  "treinador prescreve a rodagem leve da semana",
  `insert into public.training_sessions
     (id, plan_id, athlete_id, coach_id, scheduled_date, type_id, distance_km, target_pace_s, note)
   values ('${SESSION_LEVE}', '${PLAN_MAIN}', '${USER_ATHLETE}', '${USER_COACH}', ${WEEK} + 1, 'leve', 6.2, 356, 'Rodagem leve em ritmo de conversa.')`,
);
await expectOk(
  "treinador prescreve o intervalado da semana",
  `insert into public.training_sessions
     (id, plan_id, athlete_id, coach_id, scheduled_date, type_id, distance_km, target_pace_s, note)
   values ('${SESSION_INTERVAL}', '${PLAN_MAIN}', '${USER_ATHLETE}', '${USER_COACH}', ${WEEK} + 3, 'intervalado', 4.7, 297, 'Tiros de 800 m com trote entre eles.')`,
);
check(
  "semana do atleta começa com duas sessões prescritas",
  (await scalar(
    "select count(*)::int from public.training_sessions where athlete_id = $1 and scheduled_date >= date_trunc('week', now())::date",
    [USER_ATHLETE],
  )) === 2,
);

// --- atleta lê, mas não escreve ------------------------------------
await loginAs(USER_ATHLETE);
check(
  "atleta lê o próprio plano",
  (await scalar("select count(*)::int from public.training_plans")) === 1,
);
check(
  "atleta lê as próprias sessões prescritas",
  (await scalar("select count(*)::int from public.training_sessions")) === 2,
);
check(
  "atleta vê apenas o próprio vínculo com o treinador",
  (await scalar("select count(*)::int from public.coach_athletes")) === 1,
);
await expectError(
  "RLS: atleta não cria plano",
  `insert into public.training_plans (athlete_id, coach_id, goal, level, base_pace_s)
   values ('${USER_ATHLETE}', '${USER_COACH}', '10k', 'iniciante', 360)`,
  [],
  "row-level security",
);
await expectError(
  "RLS: atleta não prescreve sessão",
  `insert into public.training_sessions
     (athlete_id, coach_id, scheduled_date, type_id, distance_km, target_pace_s)
   values ('${USER_ATHLETE}', '${USER_COACH}', ${WEEK} + 5, 'longao', 12, 330)`,
  [],
  "row-level security",
);
check(
  "RLS: atleta não altera a própria sessão",
  (await changedRows(`update public.training_sessions set distance_km = 30 where id = '${SESSION_LEVE}' returning id`)) === 0,
);
check(
  "RLS: atleta não marca treino como concluído pela tabela",
  (await changedRows(`update public.training_sessions set done = true where id = '${SESSION_LEVE}' returning id`)) === 0,
);
check(
  "RLS: atleta não apaga a própria sessão",
  (await changedRows(`delete from public.training_sessions where id = '${SESSION_LEVE}' returning id`)) === 0,
);

// --- outro corredor e treinador sem vínculo ------------------------
await loginAs(USER_B);
check(
  "RLS: outro corredor não vê o plano alheio",
  (await scalar("select count(*)::int from public.training_plans")) === 0,
);
check(
  "RLS: outro corredor não vê as sessões alheias",
  (await scalar("select count(*)::int from public.training_sessions")) === 0,
);
await expectError(
  "corredor sem vínculo não prescreve para outro atleta",
  `insert into public.training_plans (athlete_id, coach_id, goal, level, base_pace_s)
   values ('${USER_ATHLETE}', '${USER_B}', '5k', 'iniciante', 380)`,
  [],
  "sem vínculo",
);

// --- admin escreve para qualquer atleta ----------------------------
await loginAs(USER_ADMIN);
await expectOk(
  "admin cria plano para atleta sem vínculo de treinador",
  `insert into public.training_plans (athlete_id, coach_id, goal, level, base_pace_s, title)
   values ('${USER_B}', '${USER_ADMIN}', '5k', 'iniciante', 380, 'Plano do admin')`,
);
check(
  "admin enxerga os planos de todos os atletas",
  (await scalar("select count(*)::int from public.training_plans")) === 2,
);
await loginAs(USER_B);
check(
  "atleta lê o plano criado pelo admin",
  (await scalar("select count(*)::int from public.training_plans")) === 1,
);

// --- invariantes de autoria (independem da RLS) --------------------
await logout();
await expectError(
  "trigger: sessão precisa pertencer ao atleta do plano",
  `insert into public.training_sessions
     (plan_id, athlete_id, coach_id, scheduled_date, type_id, distance_km, target_pace_s)
   values ('${PLAN_MAIN}', '${USER_B}', '${USER_ADMIN}', ${WEEK} + 2, 'tempo', 8, 310)`,
  [],
  "atleta do plano",
);
await expectError(
  "trigger: só o treinador do plano prescreve a sessão",
  `insert into public.training_sessions
     (plan_id, athlete_id, coach_id, scheduled_date, type_id, distance_km, target_pace_s)
   values ('${PLAN_MAIN}', '${USER_ATHLETE}', '${USER_ADMIN}', ${WEEK} + 2, 'tempo', 8, 310)`,
  [],
  "treinador do plano",
);
await expectError(
  "trigger: ninguém prescreve treino para si mesmo",
  `insert into public.training_plans (athlete_id, coach_id, goal, level, base_pace_s)
   values ('${USER_COACH}', '${USER_COACH}', '10k', 'iniciante', 330)`,
  [],
  "si mesmo",
);
await expectError(
  "trigger: treinador sem vínculo não prescreve sessão avulsa",
  `insert into public.training_sessions
     (athlete_id, coach_id, scheduled_date, type_id, distance_km, target_pace_s)
   values ('${USER_B}', '${USER_COACH}', ${WEEK} + 4, 'leve', 5, 350)`,
  [],
  "sem vínculo",
);
await expectError(
  "sessão recusa pace fora da faixa plausível",
  `insert into public.training_sessions
     (plan_id, athlete_id, coach_id, scheduled_date, type_id, distance_km, target_pace_s)
   values ('${PLAN_MAIN}', '${USER_ATHLETE}', '${USER_COACH}', ${WEEK} + 4, 'tempo', 8, 120)`,
  [],
  "check constraint",
);
await expectError(
  "sessão recusa distância zerada",
  `insert into public.training_sessions
     (plan_id, athlete_id, coach_id, scheduled_date, type_id, distance_km, target_pace_s)
   values ('${PLAN_MAIN}', '${USER_ATHLETE}', '${USER_COACH}', ${WEEK} + 4, 'tempo', 0, 320)`,
  [],
  "check constraint",
);
await expectError(
  "plano recusa meta fora do catálogo",
  `insert into public.training_plans (athlete_id, coach_id, goal, level, base_pace_s)
   values ('${USER_C}', '${USER_ADMIN}', '100k', 'iniciante', 330)`,
  [],
  "check constraint",
);
await expectError(
  "sessão duplicada no mesmo dia e tipo é bloqueada",
  `insert into public.training_sessions
     (plan_id, athlete_id, coach_id, scheduled_date, type_id, distance_km, target_pace_s)
   values ('${PLAN_MAIN}', '${USER_ATHLETE}', '${USER_COACH}', ${WEEK} + 1, 'leve', 5, 356)`,
  [],
  "duplicate key",
);
await expectError(
  "cada atleta tem um único plano ativo",
  `insert into public.training_plans (athlete_id, coach_id, goal, level, base_pace_s)
   values ('${USER_ATHLETE}', '${USER_COACH}', '10k', 'intermediario', 330)`,
  [],
  "duplicate key",
);
await expectOk(
  "plano inativo convive com o plano ativo do atleta",
  `insert into public.training_plans (athlete_id, coach_id, goal, level, base_pace_s, is_active)
   values ('${USER_ATHLETE}', '${USER_COACH}', '10k', 'intermediario', 330, false)`,
);
check(
  "atleta acumula histórico: um plano ativo e um inativo",
  (await scalar("select count(*)::int from public.training_plans where athlete_id = $1", [USER_ATHLETE])) === 2,
);

// --- exclusão em cascata -------------------------------------------
await db.exec(`
  insert into public.training_plans
    (id, athlete_id, coach_id, goal, level, base_pace_s, is_active)
  values ('${PLAN_TEMP}', '${USER_B}', '${USER_ADMIN}', '5k', 'iniciante', 360, false);

  insert into public.training_sessions
    (id, plan_id, athlete_id, coach_id, scheduled_date, type_id, distance_km, target_pace_s)
  values ('${SESSION_TEMP}', '${PLAN_TEMP}', '${USER_B}', '${USER_ADMIN}', ${WEEK} + 6, 'leve', 5, 380);
`);
check(
  "sessão avulsa fica ligada ao plano informado",
  (await scalar("select count(*)::int from public.training_sessions where plan_id = $1", [PLAN_TEMP])) === 1,
);
await db.exec(`delete from public.training_plans where id = '${PLAN_TEMP}'`);
check(
  "excluir o plano remove as sessões prescritas",
  (await scalar("select count(*)::int from public.training_sessions where plan_id = $1", [PLAN_TEMP])) === 0,
);

// --- anon não alcança os treinos -----------------------------------
await db.exec("set role anon;");
await expectError(
  "anon não lê planos de treino",
  "select count(*) from public.training_plans",
  [],
  "permission denied",
);
await expectError(
  "anon não lê sessões prescritas",
  "select count(*) from public.training_sessions",
  [],
  "permission denied",
);
await db.exec("reset role");

// ------------------------------------------------------------------ --
// Configuração versionada
// ------------------------------------------------------------------ --
check("app_settings tem as 8 regras", (await scalar("select count(*)::int from public.app_settings")) === 8);
check(
  "configuração de PP por km = 1",
  Number(await scalar("select value from public.app_settings where key = 'pp_per_km'")) === 1,
);

// ------------------------------------------------------------------ --
// Atleta marca a própria sessão como concluída (005)
// ------------------------------------------------------------------ --
await logout();

check(
  "005 aplica sem erro: função mark_training_session_done existe",
  (await scalar("select exists(select 1 from pg_proc where proname = 'mark_training_session_done')")) === true,
);

const callDoneRpc = async (sessionId) => (await query("select * from public.mark_training_session_done($1)", [sessionId]))[0] ?? null;

const weekMonday = new Date();
weekMonday.setHours(0, 0, 0, 0);
weekMonday.setDate(weekMonday.getDate() - ((weekMonday.getDay() + 6) % 7));
const expectedSessionDate = new Date(weekMonday.getTime() + 5 * 86400000);

// Re-clim como treinador para criar uma sessão adicional que a seção anterior
// não tocou (a sessão SESSION_LEVE já existe e já foi lida pelo atleta).
const SESSION_EXTRA = "a2000000-0000-0000-0000-000000000004";
await loginAs(USER_COACH);
await expectOk(
  "treinador publica uma terceira sessão para o atleta",
  `insert into public.training_sessions
     (id, plan_id, athlete_id, coach_id, scheduled_date, type_id, distance_km, target_pace_s)
   values ('${SESSION_EXTRA}', '${PLAN_MAIN}', '${USER_ATHLETE}', '${USER_COACH}', ${WEEK} + 5, 'tempo', 7.0, 320)`,
);

// --- caminho feliz -------------------------------------------------
await loginAs(USER_ATHLETE);
const done = await callDoneRpc(SESSION_EXTRA);
check(
  "RPC marca a própria sessão como concluída",
  done != null &&
    done.session_id === SESSION_EXTRA &&
    done.actual_pace_s === 320 &&
    (() => {
      const d = new Date(done.scheduled_date);
      return d.getFullYear() === expectedSessionDate.getFullYear() &&
        d.getMonth() === expectedSessionDate.getMonth() &&
        d.getDate() === expectedSessionDate.getDate();
    })(),
  JSON.stringify(done),
);

// O retorno é o registro da sessão após o UPDATE, com o pace alvo para o app
check(
  "sessão consta como concluída no banco após o RPC",
  (await scalar("select done from public.training_sessions where id = $1", [SESSION_EXTRA])) === true,
);
check(
  "done_at foi preenchido",
  (await scalar("select done_at is not null from public.training_sessions where id = $1", [SESSION_EXTRA])) === true,
);

// --- já concluído -------------------------------------------------
await expectError(
  "RPC recusa sessão já concluída",
  "select * from public.mark_training_session_done($1)",
  [SESSION_EXTRA],
  "já foi concluída",
);

// --- sessão de outro atleta ----------------------------------------
await loginAs(USER_B);
await expectError(
  "RPC recusa sessão de outro atleta",
  "select * from public.mark_training_session_done($1)",
  [SESSION_LEVE],
  "Só o atleta",
);

// --- sessão inexistente -------------------------------------------
await expectError(
  "RPC recusa sessão inexistente",
  "select * from public.mark_training_session_done($1)",
  ["00000000-0000-0000-0000-000000000000"],
  "não encontrada",
);

// --- inválido -----------------------------------------------------
await expectError(
  "RPC recusa session_id nulo",
  "select * from public.mark_training_session_done($1)",
  [null],
  "ID da sessão é obrigatório",
);

// --- quem não é o atleta não executa ------------------------------
await loginAs(USER_B);
await expectError(
  "corredor sem vínculo não marca treino alheio",
  "select * from public.mark_training_session_done($1)",
  [SESSION_EXTRA],
  "Só o atleta",
);

await loginAs(USER_COACH);
await expectError(
  "treinador não marca treino do atleta",
  "select * from public.mark_training_session_done($1)",
  [SESSION_LEVE],
  "Só o atleta",
);

// --- anon não executa ---------------------------------------------
await db.exec("set role anon;");
await expectError(
  "anon não executa o RPC",
  "select * from public.mark_training_session_done($1)",
  [SESSION_EXTRA],
  "permission denied",
);
await db.exec("reset role");

const failures = results.filter((result) => !result.ok);
console.log(`\n${results.length - failures.length}/${results.length} verificações passaram.`);
if (failures.length > 0) {
  console.log(`Falhas: ${failures.map((failure) => failure.name).join(" | ")}`);
  process.exit(1);
}
