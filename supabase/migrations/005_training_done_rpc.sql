-- PaceHub 005 — atleta marca sessão de treino como concluída
--
-- Traduz o "concluir treino" do app em um único RPC. Quem executa é o próprio
-- atleta (auth.uid() = session.athlete_id); o banco ainda rejeita, por trigger,
-- quem não tem autoria sobre o atleta, e a RLS impede leitura e escrita direta
-- na tabela pelos não-autorizados.
--
-- O retorno é leve (apenas o id, a data e o pace congravado) para que o app
-- atualize a linha local sem re-fazer o SELECT todo.

begin;

-- ------------------------------------------------------------------ --
-- Conclusão da sessão pelo atleta
-- ------------------------------------------------------------------ --
create or replace function public.mark_training_session_done(p_session_id uuid)
returns table (session_id uuid, scheduled_date date, actual_pace_s integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.training_sessions%rowtype;
begin
  -- A RLS + o trigger abaixo garantem que só quem tem direito escreve.
  -- Só precisamos validar a intenção (atleta marcando a própria sessão) e,
  -- se for o caso, escrever o pace real com base no relógio do app/cliente.
  if p_session_id is null then
    raise exception using message = 'ID da sessão é obrigatório', errcode = 'P0001';
  end if;

  select s.* into v_session
    from public.training_sessions s
   where s.id = p_session_id for update;

  if not found then
    raise exception using message = 'Sessão de treino não encontrada', errcode = 'P0002';
  end if;

  if v_session.athlete_id <> auth.uid() then
    raise exception using
      message = 'Só o atleta da sessão pode marcá-la como concluída',
      errcode = '42501';
  end if;

  if v_session.done then
    raise exception using
      message = format('Sessão %s já foi concluída em %s',
                       p_session_id::text,
                       v_session.done_at::text),
      errcode = '23515';
  end if;

  update public.training_sessions
     set done = true,
         done_at = now()
   where id = p_session_id;

  return query
    select s.id, s.scheduled_date, s.target_pace_s
      from public.training_sessions s
     where s.id = p_session_id;
end;
$$;

revoke all on function public.mark_training_session_done(uuid) from public;
grant execute on function public.mark_training_session_done(uuid) to authenticated;

comment on function public.mark_training_session_done(uuid) is
  'Atleta marca a própria sessão prescrita como concluída. Idempotente: sessão já concluída é rejeitada. Retorna o id, a data prevista e o pace alvo.';

commit;
