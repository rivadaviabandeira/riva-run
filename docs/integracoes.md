# Integração de corrida — Strava

O Riva Run terá **somente integração com o Strava** para importar atividades no MVP. Não serão implementadas integrações diretas com Garmin, Amazfit/Zepp ou outros provedores.

## Fluxo previsto
1. Participante autenticado inicia a autorização OAuth do Strava.
2. O backend gera um estado aleatório, de uso único e com validade curta.
3. O atleta autoriza os escopos necessários no Strava.
4. O callback valida o estado, troca o código por tokens e armazena credenciais exclusivamente no servidor.
5. Webhooks sinalizam criação, atualização e exclusão de atividades.
6. Um worker busca os detalhes da atividade e faz upsert/delete por ID externo, impedindo duplicidades.
7. A atividade validada entra nos cálculos de desafios e pontos; o participante pode associar um tênis cadastrado.

## Segurança e consistência
- Nunca solicitar ou armazenar a senha do Strava.
- Nunca expor STRAVA_CLIENT_SECRET, SUPABASE_SERVICE_ROLE_KEY ou tokens no app ou no Git.
- Pedir somente os escopos necessários e explicar a finalidade ao participante.
- Tratar criação, atualização, exclusão, revogação e repetição de webhook.
- Renovar tokens expirados no backend e lidar com limites de API.
- Validar tipo, horário, distância, proprietário e regras do desafio antes de pontuar.
- Não considerar uma atividade mais de uma vez; a chave única é provedor + ID externo.
- O tênis usado pode não ser informado pelo Strava; permitir associação manual.

## Situação atual
O repositório contém a migration inicial, a função OAuth e a função de recepção de webhook. Ainda falta o worker que consome eventos e sincroniza atividades reais, além da implantação, testes, configuração de OAuth e revisão de segurança. Portanto, a integração ainda não está ativa.

## Pontuação
A pontuação e o ranking devem ser calculados no backend a partir de atividades validadas e regras publicadas do desafio. O cliente não pode atribuir pontos diretamente.
