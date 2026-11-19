# Backend Supabase — Riva Run

O backend do MVP usa somente o Strava como integração externa de atividades.

## Arquivos
- `migrations/001_initial_schema.sql`: tabelas, limite de cinco tênis, perfil inicial e políticas RLS.
- `migrations/002_gamification.sql`: livro-razão de PP, conquistas, PaceStore, pendências de dados e o recálculo idempotente de progresso.
- `migrations/003_pacestore_rpcs.sql`: `redeem_reward` e `create_product_order` (SECURITY DEFINER), que debitam PP de forma atômica, recusam saldo insuficiente e respeitam o teto de 20% de desconto.
- `migrations/006_strava_status.sql`: view `strava_connection_status`, que informa ao app se a conta tem Strava conectado (atleta, escopos e data) sem expor `access_token` nem `refresh_token`.
- `migrations/004_training_plans.sql`: `coach_athletes`, `training_plans` e `training_sessions`, com o atleta lendo o próprio plano e a escrita restrita ao treinador vinculado (ou admin), além dos triggers que garantem a autoria das sessões.
- `functions/data-steward/index.ts`: agente de dados agendado (validação, duplicidades, pendências e recálculo).
- `functions/strava-auth/index.ts`: inicia OAuth e salva tokens no servidor.
- `functions/strava-webhook/index.ts`: valida o handshake e recebe eventos de forma idempotente.
- `functions/strava-sync/index.ts`: worker protegido para processar eventos, renovar tokens e importar/atualizar/excluir atividades.

## Configuração necessária
1. Crie um projeto Supabase e aplique a migration usando Supabase CLI ou SQL Editor.
2. Configure os secrets das Edge Functions:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY` (usado para validar a sessão no início do OAuth)
   - `SUPABASE_SERVICE_ROLE_KEY` (somente secrets da Edge Function)
   - `STRAVA_CLIENT_ID`
   - `STRAVA_CLIENT_SECRET`
   - `STRAVA_REDIRECT_URI` (URL pública de callback da função `strava-auth`)
   - `STRAVA_VERIFY_TOKEN` (segredo aleatório para o handshake do webhook)
   - `STRAVA_SYNC_SECRET` (segredo aleatório enviado no header `x-riva-sync-secret` ao chamar o worker)
   - `STEWARD_SECRET` (segredo aleatório do agente de dados, header `x-steward-secret`)
   - `APP_REDIRECT_URI` (deep link ou URL de retorno do app, opcional)
   - `APP_ORIGIN` (origem permitida para CORS; configure explicitamente em produção)

   `APP_REDIRECT_URI` é para onde o callback do Strava devolve o usuário depois de gravar a conexão:
   - app web: a URL do app (ex.: `https://app.pacehub.com.br/`) — o app volta com `?strava=connected`;
   - app nativo: o deep link da build (`pacehub://strava`, ou `exp://…/--/strava` no Expo Go).

   Sem esse secret o callback responde JSON e o app não recebe o resultado.
3. Registre o callback OAuth e solicite somente os escopos necessários no portal de API do Strava. Para importar corridas, a autorização normalmente precisa incluir `activity:read`; confirme as permissões disponíveis para sua aplicação.
4. Publique as funções e configure a assinatura de webhook no Strava.
5. Acione a função `strava-sync` por um agendador/worker seguro, enviando o header `x-riva-sync-secret`. Não chame essa função diretamente do app.
6. Publique `data-steward` e agende a execução conforme `docs/agente-dados.md`. Ela valida atividades, resolve pendências e recalcula PP e medalhas.
6. Nunca exponha `SUPABASE_SERVICE_ROLE_KEY`, `STRAVA_CLIENT_SECRET` ou tokens do atleta no aplicativo nem no Git.

## Validação local das migrations

`npm run db:test` aplica as migrations (`001` a `004`) num Postgres 17 real
(PGlite/WASM, sem Docker nem root) e verifica pontuação por km, bônus semanais e
de desafio, idempotência do livro-razão, medalhas, recusa de dados inválidos,
limite de tênis, views do agente, resgate e pedido na PaceStore (débito atômico
de PP, saldo insuficiente e teto de 20%), políticas de RLS e os treinos
prescritos (plano único ativo, autoria das sessões, escrita do treinador e
leitura somente pelo atleta). O harness
fica em `supabase/tests/validate-migrations.mjs`; ele recria apenas o mínimo do
ambiente Supabase (schema `auth`, papéis e grants padrão) e remove a linha
`create extension pgcrypto`, já que `gen_random_uuid()` é nativo no Postgres 13+.

Se houver um Docker acessível, o equivalente com servidor completo é:

```bash
docker run --rm -d --name pacehub-pg -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:17
sleep 5
docker exec -i pacehub-pg psql -U postgres -c "create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb default '{}'::jsonb);"
docker exec -i pacehub-pg psql -U postgres -v ON_ERROR_STOP=1 < supabase/migrations/001_initial_schema.sql
docker exec -i pacehub-pg psql -U postgres -v ON_ERROR_STOP=1 < supabase/migrations/002_gamification.sql
docker exec -i pacehub-pg psql -U postgres -v ON_ERROR_STOP=1 < supabase/migrations/003_pacestore_rpcs.sql
```

## Importante: estado da implementação
Este é um esqueleto de backend, ainda não pronto para produção. O webhook registra eventos, mas ainda falta um worker que consuma a fila, atualize tokens expirados, busque os detalhes das atividades e faça sincronização/exclusão no banco. Também faltam testes de integração, política de rate limit, revisão de RLS, tela de conexão/desconexão, exclusão de dados e configuração de URL/deep link de retorno. Valide as permissões, o fluxo OAuth e as exigências de revisão no painel oficial do Strava antes de publicar.
