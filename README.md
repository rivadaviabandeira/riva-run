# Riva Run

Aplicativo de corrida com desafios, pontuação, ranking e controle de quilometragem dos tênis.

## MVP
- Aplicativo Android e iOS com Expo, React Native e TypeScript.
- Cadastro de até cinco pares de tênis por participante.
- Desafios semanais e mensais, tarefas e pontos.
- Ranking: 1º–3º dourado, 4º–10º azul, 11º–20º verde, 21º+ cinza.
- Pódio com os três primeiros e o tênis mais usado por distância no desafio.
- Strava como primeira integração planejada; Garmin e Amazfit/Zepp serão avaliados com suas APIs oficiais.

## Estado
Protótipo inicial em construção. Nenhuma conexão de relógio, autenticação ou dado real está ativo ainda.

## Rodar localmente
Requer Node.js LTS.

```bash
npm install
npx expo start
```

## Integrações
- Strava via OAuth e sincronização no servidor.
- Garmin Health depende de elegibilidade e aprovação.
- Zepp/Amazfit depende da disponibilidade e permissões oficiais.
- Nunca guardar tokens privados no app cliente ou no Git.
- Atividades precisam de identificador único para impedir pontos e quilômetros duplicados.

## Próximas etapas
1. Criar a interface do app.
2. Configurar autenticação e banco de dados.
3. Implementar Strava OAuth e importação idempotente.
4. Criar painel administrativo web.
5. Validar Garmin e Amazfit/Zepp.
