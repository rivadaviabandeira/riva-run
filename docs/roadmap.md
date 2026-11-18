# Roadmap PaceHub

## Concluído no repositório
- [x] Telas de demonstração: início, desafios, tênis e ranking.
- [x] Faixas: 1º–3º dourado, 4º–10º azul, 11º–20º verde, 21º+ cinza.
- [x] Esquema inicial Supabase para perfis, tênis, desafios, inscrições, atividades e pontuação.
- [x] Estrutura inicial de OAuth Strava, recepção idempotente de webhooks e worker de processamento.
- [x] Escopo de integração limitado ao Strava.
- [x] Perfil do corredor com nível de carreira, saldo PP, km totais, melhor pace e sequência semanal.
- [x] Conquistas em três categorias (primeiros passos, constância e performance), com progresso.
- [x] PaceStore com resgates em PP, descontos progressivos (1 PP = R$ 0,10, teto de 20%) e histórico.
- [x] Regras de pontuação centralizadas em `lib/domain.ts` (1 km = 1 PP, +5 PP por semana, +15 PP por desafio).
- [x] Livro-razão de PP idempotente, medalhas, recompensas, resgates e pedidos (migration 002).
- [x] Agente de dados: função agendada `data-steward` + painel de integridade no app.
- [x] Resgate e pedido da PaceStore via RPC `SECURITY DEFINER` (migration 003), com débito atômico de PP, recusa de saldo insuficiente e teto de 20%; a tela da loja chama a RPC quando há backend e cai no modo local sem ele.
- [x] Modo treinador: prescrição semanal por atleta (tipos de sessão, distância e pace alvo por zonas), revisão de carga (volume até +10%, limite de sessões intensas, descanso) e acompanhamento de aderência.

## Próximas fases
1. Configurar projeto Supabase, aplicar as migrations 001 e 002 e revisar RLS/permissões.
2. Implantar Edge Functions, configurar secrets e agendar o agente de dados.
3. Testar e endurecer o worker de sincronização: renovação de tokens, importação/atualização/exclusão e retentativas de eventos.
4. Trocar o dataset local por consultas reais (perfil, atividades, medalhas e loja) e adicionar autenticação no app.
5. Implementar resgate e pedido via RPC no servidor, com baixa de estoque e conciliação no WhatsApp.
6. Criar painel administrativo web para desafios, tarefas, recompensas, produtos e atendimento.
7. Testes de segurança e integração, política de privacidade, exclusão de dados e publicação.

## Critérios de aceite
- Cada atividade conta no máximo uma vez, inclusive após webhooks repetidos.
- Limite de cinco tênis ativos imposto pelo banco.
- Quilometragem do tênis soma somente atividades válidas associadas.
- Ranking e pontos calculados no servidor, nunca confiando em valores enviados pelo app.
- Pódio final mostra os três primeiros e o tênis com maior distância no desafio.
- Saldo de PP é a soma do livro-razão; resgates nunca deixam o saldo negativo.
- Desconto na loja nunca passa de 20% nem do saldo disponível.
- Tokens e segredos nunca ficam no cliente nem versionados no Git.
- Toda pendência de dados tem dono, severidade e registro de resolução.
- Usuário consegue revogar a conexão e solicitar exclusão dos dados sincronizados.
