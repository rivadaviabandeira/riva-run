# Roadmap Riva Run

## Concluído no repositório
- [x] Telas de demonstração: início, desafios, tênis e ranking.
- [x] Faixas: 1º–3º dourado, 4º–10º azul, 11º–20º verde, 21º+ cinza.
- [x] Esquema inicial Supabase para perfis, tênis, desafios, inscrições, atividades e pontuação.
- [x] Estrutura inicial de OAuth Strava e recepção idempotente de webhooks.
- [x] Escopo de integração limitado ao Strava.

## Próximas fases
1. Configurar projeto Supabase, aplicar migration e revisar RLS/permissões.
2. Implantar Edge Functions e configurar secrets/URLs OAuth no portal de API do Strava.
3. Completar o worker de sincronização: renovar tokens, importar/atualizar/excluir atividades e tratar eventos repetidos.
4. Implementar tela de conexão/desconexão do Strava e associação de atividades aos tênis.
5. Implementar regras de desafio e cálculo de pontos/ranking no servidor.
6. Criar painel administrativo web para desafios, tarefas e participantes.
7. Testes de segurança e integração, política de privacidade, exclusão de dados e publicação.

## Critérios de aceite
- Cada atividade conta no máximo uma vez, inclusive após webhooks repetidos.
- Limite de cinco tênis ativos imposto pelo banco.
- Quilometragem do tênis soma somente atividades válidas associadas.
- Ranking e pontos calculados no servidor, nunca confiando em valores enviados pelo app.
- Pódio final mostra os três primeiros e o tênis com maior distância no desafio.
- Tokens e segredos nunca ficam no cliente nem versionados no Git.
- Usuário consegue revogar a conexão e solicitar exclusão dos dados sincronizados.
