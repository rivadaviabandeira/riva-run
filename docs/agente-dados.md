# Agente de dados do PaceHub

O agente de dados é o guardião da base: nenhuma corrida entra no ranking sem
passar pelas regras dele. Ele existe em duas camadas.

## 1. Camada de servidor (autoritativa)

`supabase/functions/data-steward/index.ts`, executada por agendamento.

O que faz em cada varredura:

1. Lê as atividades em páginas de 200 registros.
2. Descarta o que não é corrida (`Run`, `TrailRun`, `VirtualRun`).
3. Rejeita distância fora de 1–100 km e pace fora de 2:30–12:00/km, registrando a
   pendência em `data_quality_issues` com severidade `alta` ou `media`.
4. Detecta duplicidades por mesmo dono + horário + distância (visão
   `duplicate_activity_candidates`) e nunca deixa a mesma corrida pontuar duas vezes.
5. Sinaliza corridas validadas sem tênis associado (severidade `baixa`).
6. Sinaliza tênis acima de 800 km validados.
7. Resolve automaticamente pendências que deixaram de existir.
8. Chama `recalculate_user_progress(p_user)` para cada corredor afetado: PP por km,
   bônus de semana (3 treinos) e de desafio (15 PP), além das medalhas.
9. Remove estados OAuth expirados.
10. Grava o resultado em `steward_runs` (auditoria de cada execução).

### Regras invioláveis

- Nunca concede pontos com base em valores enviados pelo app.
- Nunca apaga atividade do Strava que o corredor apagou na origem — o worker
  `strava-sync` já faz isso; o agente apenas reclassifica o que restou.
- Nunca devolve tokens, segredos ou dados de terceiros na resposta.
- Escritas no livro-razão são idempotentes: a chave `(user_id, kind, reference)`
  impede pontuação duplicada, inclusive em execuções repetidas.
- A função exige o header `x-steward-secret`; sem ele responde 401.

### Configuração

1. Aplique `supabase/migrations/002_gamification.sql`.
2. Configure os secrets da função:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (somente no servidor)
   - `STEWARD_SECRET` (string aleatória longa)
3. Publique: `supabase functions deploy data-steward --no-verify-jwt`.
4. Agende (a cada 30 minutos, por exemplo) com `pg_cron` + `pg_net`:

```sql
select cron.schedule(
  'pacehub-data-steward',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://SEU-PROJETO.supabase.co/functions/v1/data-steward',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-steward-secret', 'VALOR_DE_STEWARD_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Prefira guardar o segredo em uma tabela de configuração privada ou em Vault, em
vez de deixar o valor literal no agendamento.

### Monitoramento

- `steward_runs`: última execução, duração, volume verificado e pendências abertas.
- `data_quality_issues`: fila de trabalho do time de operação.
- Saúde esperada: `status = succeeded`, `issues_open` estável e nenhuma atividade
  `pending` com mais de 24 h.

## 2. Camada do app (transparência)

`lib/steward.ts` roda as mesmas verificações no conjunto local e é exibida em
**Perfil → Agente de dados**. Serve para o corredor entender o que está pendente
(sem tênis, importação aguardando validação, tênis desgastado) e agir: validar,
rejeitar ou associar o par correto.

O app nunca define pontos: ele apenas lê o estado derivado das regras de
`lib/domain.ts`, que espelham `app_settings` e `recalculate_user_progress`.
