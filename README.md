# PaceHub

Plataforma de corrida de rua com desafios, ranking, controle de tênis, conquistas e loja de recompensas.

## Escopo do produto
- Aplicativo Android e iOS com Expo, React Native e TypeScript.
- Integração de atividades exclusivamente com Strava (OAuth e sincronização no servidor).
- Cadastro de até cinco pares de tênis por participante e controle de quilometragem.
- Desafios semanais e mensais, tarefas, pontos (PP), conquistas e ranking.
- Faixas do ranking: 1º–3º dourado, 4º–10º azul, 11º–20º verde, 21º+ cinza.
- Pódio com os três primeiros e tênis mais utilizado por distância no desafio.
- PaceStore com resgates em PP e desconto progressivo em produtos.
- Agente de dados que valida importações, impede duplicidades e audita a base.

## Regras de pontuação
Definidas em um único módulo, `lib/domain.ts`, espelhado no banco (`app_settings`)
e no recálculo do servidor (`recalculate_user_progress`).

| Regra | Valor |
| --- | --- |
| 1 km validado | 1 PP |
| Meta semanal (3 treinos) | +5 PP |
| Desafio concluído | +15 PP |
| Valor de 1 PP na loja | R$ 0,10 |
| Desconto máximo em produto | 20% do preço |
| Limite de tênis ativos | 5 pares |

O saldo é a soma do livro-razão: PP ganhos menos PP gastos em resgates e compras.
O nível de carreira usa o PP acumulado (XP) e nunca diminui.

## Telas
- **Início**: nível, saldo PP, meta da semana, desafio em destaque, sincronização e últimas corridas.
- **Desafios**: progresso calculado a partir das atividades validadas, inscrição e bônus.
- **Tênis**: quilometragem por par, associação de corridas e cadastro com limite de cinco.
- **Ranking**: pódio, faixas de classificação e tênis mais usado.
- **PaceStore**: saldo, resgates em PP, descontos progressivos e histórico.
- **Perfil** (rota `/perfil`): estatísticas, conexão Strava, conquistas e painel do agente de dados.
- **Conquistas** (rota `/conquistas`): nove medalhas em três categorias.

## Estado atual
Protótipo funcional com dados locais. As regras de negócio, as telas e o agente
de dados já rodam de ponta a ponta em `lib/`; a persistência real depende de um
projeto Supabase com as migrations aplicadas e as Edge Functions publicadas.
O Strava ainda não está conectado: a sincronização no app importa atividades
demonstrativas com IDs fixos para exercitar a deduplicação.

## Rodar localmente
Requer Node.js LTS.

```bash
npm install
npx expo start
```

Verificação de tipos:

```bash
npm run typecheck
```

## Estrutura
```
app/(tabs)/        inicio, desafios, treinos, ranking e loja
app/tenis.tsx      cadastro e quilometragem dos tênis
app/perfil.tsx     perfil, conexão Strava e painel do agente de dados
app/conquistas.tsx coleção de medalhas
components/ui.tsx  componentes visuais compartilhados
lib/domain.ts      regras de negócio puras (pontuação, nível, medalhas, desconto)
lib/steward.ts     auditoria de integridade executada no app
lib/data/          tipos, dataset demonstrativo e provider de estado
supabase/          migrations e Edge Functions (Strava e agente de dados)
docs/              integrações, roadmap e agente de dados
```

## Variáveis de ambiente
Copie `.env.example` para `.env.local`. Nunca coloque service role, segredos ou
tokens OAuth no app cliente ou no Git.

## Backend
- Esquema inicial e políticas RLS: `supabase/migrations/001_initial_schema.sql`.
- Gamificação, loja e governança: `supabase/migrations/002_gamification.sql`.
- OAuth Strava: `supabase/functions/strava-auth`.
- Webhooks Strava: `supabase/functions/strava-webhook`.
- Worker de sincronização: `supabase/functions/strava-sync`.
- Agente de dados: `supabase/functions/data-steward`.
- Instruções: `supabase/README.md` e `docs/agente-dados.md`.

## Regras essenciais
- Nunca guardar chaves privadas ou tokens OAuth no app cliente ou no Git.
- Impedir importação duplicada por ID externo da atividade.
- Associar manualmente um tênis após a importação quando necessário.
- Validar tipo, data, distância e regras do desafio no servidor antes de pontuar.
- Não implementar integração direta com Garmin, Amazfit ou outros serviços.
- Produtos, preços, tamanhos, cores, disponibilidade e dados comerciais devem ser gerenciáveis pelo painel administrativo antes do lançamento.
