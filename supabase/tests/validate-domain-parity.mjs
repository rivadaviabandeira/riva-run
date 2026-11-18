#!/usr/bin/env node
/**
 * Paridade entre as regras do app (`lib/domain.ts`) e o Postgres.
 *
 * O app calcula PP, km, corridas válidas, melhor pace e sequência para mostrar
 * na hora; o banco recalcula os mesmos números em
 * `recalculate_user_progress`. Se as duas contas divergirem, o corredor vê um
 * saldo e o servidor guarda outro — o tipo de erro que corrói a confiança no
 * placar e no saldo da PaceStore.
 *
 * Este teste joga o mesmo conjunto de atividades nos dois lados e compara:
 *   1. constantes do app × `app_settings` (a configuração versionada do banco);
 *   2. PP de carreira, km, corridas que pontuam, melhor pace e sequência.
 *
 * Roda em Postgres 17 real (PGlite/WASM) e importa o módulo TypeScript
 * diretamente (type stripping do Node). Uso: `npm run db:test`.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as domain from "../../lib/domain.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const readMigration = (file) => readFileSync(resolve(root, "supabase/migrations", file), "utf8");
const firstLine = (error) => String(error?.message ?? error).split("\n")[0].slice(0, 160);

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const db = new PGlite();
const query = async (sql, params) => (await db.query(sql, params)).rows;
const scalar = async (sql, params) => {
  const rows = await query(sql, params);
  return rows[0] ? Object.values(rows[0])[0] : undefined;
};

await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to authenticated, service_role;

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
  check("migrations 001–004 aplicam para o teste de paridade", true);
} catch (error) {
  check("migrations 001–004 aplicam para o teste de paridade", false, firstLine(error));
  console.error(error);
  process.exit(1);
}

// ------------------------------------------------------------------ --
// Constantes do app × configuração versionada do banco
// ------------------------------------------------------------------ --
const SETTINGS = {
  PP_PER_KM: "pp_per_km",
  WEEKLY_GOAL_RUNS: "weekly_goal_runs",
  WEEKLY_BONUS_PP: "weekly_bonus_pp",
  CHALLENGE_BONUS_PP: "challenge_bonus_pp",
  MAX_ACTIVE_SHOES: "max_active_shoes",
  PP_VALUE_BRL: "pp_value_brl",
  MAX_DISCOUNT_RATE: "max_discount_rate",
  SHOE_REPLACE_KM: "shoe_replace_km",
};

for (const [constant, key] of Object.entries(SETTINGS)) {
  const appValue = domain[constant];
  const dbValue = Number(await scalar("select value from public.app_settings where key = $1", [key]));
  check(
    `paridade ${constant} = app_settings.${key}`,
    Number(appValue) === dbValue,
    `app=${appValue} banco=${dbValue}`,
  );
}

check(
  "paridade: faixa de distância que pontua é 1–100 km nos dois lados",
  domain.MIN_RUN_DISTANCE_KM === 1 && domain.MAX_RUN_DISTANCE_KM === 100,
  `app=${domain.MIN_RUN_DISTANCE_KM}–${domain.MAX_RUN_DISTANCE_KM} km`,
);
check(
  "paridade: pace plausível é 2:30–12:00/km nos dois lados",
  domain.MIN_REALISTIC_PACE_S === 150 && domain.MAX_REALISTIC_PACE_S === 720,
  `app=${domain.MIN_REALISTIC_PACE_S}–${domain.MAX_REALISTIC_PACE_S} s/km`,
);

// ------------------------------------------------------------------ --
// Mesmas atividades nos dois lados
// ------------------------------------------------------------------ --
/**
 * Meia-noite de segunda da semana atual (UTC) + semana/dia pedidos.
 * Usa 12h para não cruzar o limite da semana em fusos negativos.
 */
const at = (weekOffset, dayOffset = 1) => {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7) + weekOffset * 7 + dayOffset);
  return date.toISOString();
};

const run = (distanceKm, paceS, weekOffset, dayOffset, title) => ({
  title,
  distanceKm,
  movingTimeS: Math.round(distanceKm * paceS),
  startedAt: at(weekOffset, dayOffset),
  status: "validated",
});

const DATASETS = {
  /** Semana completa em duas semanas seguidas: meta batida e sequência 2. */
  "duas semanas completas": [
    run(5, 360, 0, 1, "Terça"),
    run(5, 360, 0, 2, "Quarta"),
    run(5, 360, 0, 3, "Quinta"),
    run(5, 360, -1, 1, "Terça anterior"),
    run(5, 360, -1, 2, "Quarta anterior"),
    run(5, 360, -1, 3, "Quinta anterior"),
  ],
  /** Bordas da faixa aceita: 999 m e 100,1 km fora; 1 km e 100 km dentro. */
  "limites de distância e pace": [
    run(0.999, 400, -5, 1, "999 metros"),
    run(100.1, 1200, -4, 1, "100,1 km"),
    run(1, 360, -2, 1, "1 km"),
    run(100, 1200, -3, 1, "100 km"),
    run(5, 100, -2, 2, "5 km em 1:40/km"),
  ],
  /** Três trotes curtos: não somam km, não fecham meta nem rendem bônus. */
  "trotes curtos": [
    run(0.4, 375, -1, 1, "400 m"),
    run(0.8, 375, -1, 2, "800 m"),
    run(0.95, 375, -1, 3, "950 m"),
  ],
  /** Pace abaixo de 2:30/km não pode virar recorde. */
  "pace implausível": [run(5, 140, 0, 1, "5 km em 2:20/km"), run(10, 300, 0, 2, "10 km em 5:00/km")],
};

const uuid = (index) => `b1111111-1111-4111-8111-${String(index).padStart(12, "0")}`;
let externalId = 7000;

const summaryFor = async (userId, activities) => {
  await db.query("insert into auth.users (id, raw_user_meta_data) values ($1, $2)", [
    userId,
    JSON.stringify({ display_name: `Paridade ${userId.slice(-4)}` }),
  ]);
  for (const activity of activities) {
    await db.query(
      `insert into public.activities
         (user_id, source, external_activity_id, activity_type, title, distance_m, moving_time_s, started_at, status)
       values ($1, 'strava', $2, 'Run', $3, $4, $5, $6, 'validated')`,
      [
        userId,
        (externalId += 1),
        activity.title,
        Math.round(activity.distanceKm * 1000),
        activity.movingTimeS,
        activity.startedAt,
      ],
    );
  }
  const raw = await scalar("select public.recalculate_user_progress($1) as result", [userId]);
  return typeof raw === "string" ? JSON.parse(raw) : raw;
};

const close = (a, b, tolerance = 0.05) => Math.abs(Number(a) - Number(b)) <= tolerance;

let datasetIndex = 0;
for (const [label, activities] of Object.entries(DATASETS)) {
  datasetIndex += 1;
  const summary = await summaryFor(uuid(datasetIndex), activities);

  const breakdown = domain.pointsBreakdown({ activities });
  const clientKm = domain.totalValidatedKm(activities);
  const clientRuns = activities.filter(domain.countsForPoints).length;
  const clientPace = domain.bestPaceSeconds(activities);
  const clientStreak = domain.weeklyStreak(activities);

  check(
    `${label}: PP de carreira (app ${breakdown.lifetime} × banco ${summary.lifetime_pp})`,
    close(breakdown.lifetime, summary.lifetime_pp),
  );
  check(
    `${label}: km que pontuam (app ${clientKm} × banco ${summary.km})`,
    close(clientKm, summary.km),
  );
  check(
    `${label}: corridas válidas (app ${clientRuns} × banco ${summary.runs})`,
    clientRuns === Number(summary.runs),
  );
  const dbPace = summary.best_pace_s === null ? null : Number(summary.best_pace_s);
  check(
    `${label}: melhor pace (app ${clientPace ?? "—"} × banco ${dbPace ?? "—"})`,
    (clientPace === null && dbPace === null) ||
      (clientPace !== null && dbPace !== null && close(clientPace, dbPace, 1)),
  );
  check(
    `${label}: sequência de semanas (app ${clientStreak} × banco ${summary.streak_weeks})`,
    clientStreak === Number(summary.streak_weeks),
  );
}

// A divergência que existia antes: o app somava qualquer corrida validada.
const shortRuns = DATASETS["trotes curtos"];
check(
  "trotes curtos não somam km no app (regra de 1–100 km)",
  domain.totalValidatedKm(shortRuns) === 0 &&
    domain.pointsBreakdown({ activities: shortRuns }).lifetime === 0,
  `km=${domain.totalValidatedKm(shortRuns)} pp=${domain.pointsBreakdown({ activities: shortRuns }).lifetime}`,
);
const fast = DATASETS["pace implausível"];
check(
  "app ignora pace abaixo de 2:30/km no melhor pace",
  domain.bestPaceSeconds(fast) === 300,
  `pace=${domain.bestPaceSeconds(fast)}`,
);

const failures = results.filter((result) => !result.ok);
console.log(`\n${results.length - failures.length}/${results.length} verificações de paridade passaram.`);
if (failures.length > 0) {
  console.log(`Falhas: ${failures.map((failure) => failure.name).join(" | ")}`);
  process.exit(1);
}
