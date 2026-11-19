-- Status público da conexão Strava.
--
-- O app precisa saber se a conta já tem o Strava vinculado para mostrar o estado
-- certo no Perfil, mas a tabela `strava_connections` guarda access_token e
-- refresh_token e por isso continua sem policy de leitura no cliente.
--
-- A view roda como dona (security definer implícito), filtra por auth.uid() e
-- expõe somente os campos que não são segredo. Assim o app descobre "conectado,
-- atleta X, atualizado em Y" sem nunca receber token.
create or replace view public.strava_connection_status as
select
  athlete_id,
  scopes,
  connected_at,
  updated_at
from public.strava_connections
where user_id = auth.uid();

comment on view public.strava_connection_status is
  'Status da conexão Strava do usuário autenticado. Não expõe access_token nem refresh_token.';

revoke all on public.strava_connection_status from anon;
grant select on public.strava_connection_status to authenticated;
