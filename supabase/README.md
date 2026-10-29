# Backend Supabase — Riva Run

O backend do MVP usa somente o Strava como integração externa de atividades.

## Arquivos
- `migrations/001_initial_schema.sql`: tabelas, limite de cinco tênis, perfil inicial e políticas RLS.
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
   - `APP_REDIRECT_URI` (deep link ou URL de retorno do app, opcional)
   - `APP_ORIGIN` (origem permitida para CORS; configure explicitamente em produção)
3. Registre o callback OAuth e solicite somente os escopos necessários no portal de API do Strava. Para importar corridas, a autorização normalmente precisa incluir `activity:read`; confirme as permissões disponíveis para sua aplicação.
4. Publique as funções e configure a assinatura de webhook no Strava.
5. Acione a função `strava-sync` por um agendador/worker seguro, enviando o header `x-riva-sync-secret`. Não chame essa função diretamente do app.
6. Nunca exponha `SUPABASE_SERVICE_ROLE_KEY`, `STRAVA_CLIENT_SECRET` ou tokens do atleta no aplicativo nem no Git.

## Importante: estado da implementação
Este é um esqueleto de backend, ainda não pronto para produção. O webhook registra eventos, mas ainda falta um worker que consuma a fila, atualize tokens expirados, busque os detalhes das atividades e faça sincronização/exclusão no banco. Também faltam testes de integração, política de rate limit, revisão de RLS, tela de conexão/desconexão, exclusão de dados e configuração de URL/deep link de retorno. Valide as permissões, o fluxo OAuth e as exigências de revisão no painel oficial do Strava antes de publicar.
