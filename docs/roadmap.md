# Roadmap Riva Run

## Protótipo
- [x] Telas de início, desafios, tênis e ranking.
- [x] Faixas: 1º–3º dourado, 4º–10º azul, 11º–20º verde, 21º+ cinza.
- [x] Documentação inicial de integração.
- [ ] Substituir dados fictícios por dados persistidos.

## Próximas fases
1. Configurar Supabase Auth, PostgreSQL e políticas RLS.
2. Criar perfis, papéis de administrador/participante e cadastro de até cinco tênis.
3. Implementar OAuth Strava e importação segura/idempotente.
4. Implementar atividades, desafios, inscrições e pontuação no servidor.
5. Criar painel administrativo web.
6. Avaliar e validar integrações Garmin Health e Zepp/Amazfit.
7. Testes, política de privacidade, segurança e publicação.

## Critérios de aceite
- Cada atividade conta no máximo uma vez.
- Limite de cinco tênis imposto no servidor.
- Quilometragem do tênis soma somente atividades válidas associadas.
- Ranking e pontos calculados no servidor.
- Pódio final mostra os três primeiros e o tênis com maior distância acumulada no desafio.
- Nenhum segredo ou token OAuth é versionado no Git.
