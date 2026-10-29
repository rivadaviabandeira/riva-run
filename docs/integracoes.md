# Integrações de corrida

## Ordem
1. Strava API: primeira integração a implementar.
2. Garmin Health: depende de elegibilidade, aprovação e termos da plataforma.
3. Zepp/Amazfit: confirmar disponibilidade e permissões da API oficial.

## Regras
- O atleta autoriza o acesso via OAuth quando disponível.
- Tokens ficam somente no servidor, nunca no app nem no Git.
- Atividades usam ID externo único por provedor para impedir quilometragem e pontos duplicados.
- Reenvios e atualizações devem ser idempotentes.
- Respeitar revogação, exclusão, privacidade e escopos autorizados.
- O tênis pode não vir nos dados externos: permitir associação manual pós-importação ou tênis padrão configurável.
- Não pedir senhas Garmin/Zepp nem usar scraping.

## Garmin e Amazfit
Relógios podem sincronizar para o Strava se o próprio atleta configurar essa ligação nos serviços suportados. Isso não equivale a integração direta oficial com cada fabricante. A integração direta será considerada apenas após confirmar acesso autorizado às APIs e condições de uso.

## Pontuação
Calcular pontos e fechamento de desafios no backend. Validar tipo de atividade, data, distância, duplicidade e regras do desafio antes de creditar pontos.
