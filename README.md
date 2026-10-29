# Riva Run

Aplicativo de corrida com desafios, pontuação, ranking e controle de quilometragem dos tênis.

## MVP
- Aplicativo Android e iOS com Expo, React Native e TypeScript.
- Cadastro de até cinco pares de tênis por participante.
- Desafios semanais e mensais, tarefas e pontos.
- Ranking: 1º–3º dourado, 4º–10º azul, 11º–20º verde, 21º+ cinza.
- Pódio com os três primeiros e o tênis mais usado por distância no desafio.
- **Única integração de atividades prevista: Strava**, via OAuth e sincronização no servidor.

## Estado
Protótipo de interface e primeiro esqueleto de backend versionados. O backend ainda precisa ser configurado e implantado no Supabase; OAuth, importação real, painel administrativo e cálculo final de pontos ainda não estão ativos em produção.

## Rodar localmente
Requer Node.js LTS.

```bash
npm install
npx expo start
```

## Backend
- Esquema inicial e políticas RLS: supabase/migrations/001_initial_schema.sql.
- OAuth Strava: supabase/functions/strava-auth.
- Recepção de webhooks Strava: supabase/functions/strava-webhook.
- Instruções de configuração: supabase/README.md.

## Regras essenciais
- Nunca guardar chaves privadas ou tokens OAuth no app cliente ou no Git.
- Impedir importação duplicada por ID externo da atividade.
- Associar manualmente um tênis após a importação, caso o Strava não forneça essa informação.
- Validar tipo de atividade, data, distância e regras do desafio no servidor antes de pontuar.
- Nenhuma integração direta com Garmin, Amazfit ou outros serviços está no escopo.
