# PaceHub

Plataforma de corrida, desafios, ranking, gestão de tênis e vitrine comercial de produtos esportivos.

## Escopo do produto
- Aplicativo Android e iOS com Expo, React Native e TypeScript.
- Integração de atividades exclusivamente com Strava (OAuth e sincronização no servidor).
- Cadastro de até cinco pares de tênis por participante e controle de quilometragem.
- Desafios semanais e mensais, tarefas, pontos e ranking.
- Faixas do ranking: 1º–3º dourado, 4º–10º azul, 11º–20º verde, 21º+ cinza.
- Pódio com os três primeiros e tênis mais utilizado por distância no desafio.
- PaceHub Store: catálogo de meias de marca própria e de marcas revendidas.
- Pedidos e atendimento comercial concluídos pelo WhatsApp; sem checkout no aplicativo nesta primeira versão.

## Estado atual
Protótipo visual. A aba Store contém produtos demonstrativos, sem preço, estoque ou imagens comerciais definitivas. O número de WhatsApp deve ser configurado por variável de ambiente `EXPO_PUBLIC_STORE_WHATSAPP`, em formato internacional somente com dígitos (DDI + DDD + número). O backend, OAuth Strava, sincronização real, painel administrativo e catálogo gerenciável ainda precisam ser implementados e testados.

## Rodar localmente
Requer Node.js LTS.

```bash
npm install
npx expo start
```

## Variáveis de ambiente
Copie `.env.example` para `.env.local` e configure as variáveis necessárias. Nunca coloque service role, segredos ou tokens OAuth no app cliente ou no Git.

## Backend
- Esquema inicial e políticas RLS: `supabase/migrations/001_initial_schema.sql`.
- OAuth Strava: `supabase/functions/strava-auth`.
- Webhooks Strava: `supabase/functions/strava-webhook`.
- Worker de sincronização: `supabase/functions/strava-sync`.
- Instruções: `supabase/README.md`.

## Regras essenciais
- Nunca guardar chaves privadas ou tokens OAuth no app cliente ou no Git.
- Impedir importação duplicada por ID externo da atividade.
- Associar manualmente um tênis após a importação quando necessário.
- Validar tipo, data, distância e regras do desafio no servidor antes de pontuar.
- Não implementar integração direta com Garmin, Amazfit ou outros serviços.
- Produtos, preços, tamanhos, cores, disponibilidade e dados comerciais devem ser gerenciáveis pelo painel administrativo antes do lançamento.
