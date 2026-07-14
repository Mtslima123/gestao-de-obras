-- ============================================================================
-- Migration: sistema de notificações real
-- Data: 2026-07-13
--
-- Substitui o mock estático (AppData.notificacoes) por notificações de verdade,
-- geradas a partir de eventos reais e persistidas por usuário.
--
-- Modelo: uma linha por destinatário (user_profiles.id). Identidade resolvida
-- por e-mail (mesma abordagem de can_access_obra), porque user_profiles.id NÃO é
-- o auth.uid() (usuário é cadastrado por e-mail antes do 1º login SSO).
--
-- Evento inicial: novo comentário ou novo anexo em uma tarefa (task_history).
-- Um gatilho fan-out cria uma notificação para cada usuário com acesso à obra
-- (admins + vinculados em user_obras), exceto o autor. Outros eventos podem ser
-- adicionados depois no mesmo padrão.
--
-- Idempotente. Rollback no final.
-- ============================================================================

-- Perfil (user_profiles.id) do usuário da sessão, resolvido por e-mail.
create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.user_profiles p
  where p.status = 'ativo'
    and p.email = (select email from auth.users where id = auth.uid())
  limit 1;
$$;
grant execute on function public.current_profile_id() to authenticated;

-- Tabela
create table if not exists public.notificacoes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null,             -- destinatário = user_profiles.id
  obra_id    text,
  tipo       text        not null default 'info',   -- danger | warning | info
  titulo     text        not null,
  subtitulo  text,
  link       text,                              -- opcional, ex.: 'cronograma:<obra>:<task>'
  lido       boolean     not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notif_user on public.notificacoes (user_id, lido, created_at desc);

-- RLS: cada um só enxerga/atualiza as próprias. Inserção só via gatilho (definer).
alter table public.notificacoes enable row level security;

drop policy if exists notif_select on public.notificacoes;
create policy notif_select on public.notificacoes
  for select to authenticated
  using (user_id = public.current_profile_id());

drop policy if exists notif_update on public.notificacoes;
create policy notif_update on public.notificacoes
  for update to authenticated
  using (user_id = public.current_profile_id())
  with check (user_id = public.current_profile_id());

drop policy if exists notif_delete on public.notificacoes;
create policy notif_delete on public.notificacoes
  for delete to authenticated
  using (user_id = public.current_profile_id());

-- Gatilho: gera notificações de comentário/anexo em tarefa (fan-out por obra).
create or replace function public.fn_notify_task_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_titulo text;
  v_sub    text;
begin
  begin
    if NEW.type not in ('comment', 'attachment_add') then
      return NEW;
    end if;

    if NEW.type = 'comment' then
      v_titulo := 'Novo comentário' || coalesce(' · ' || NEW.obra_id, '');
      v_sub    := coalesce(NEW.author_name, 'Alguém') || ' comentou na tarefa ' || coalesce(NEW.task_id, '');
    else
      v_titulo := 'Novo anexo' || coalesce(' · ' || NEW.obra_id, '');
      v_sub    := coalesce(NEW.author_name, 'Alguém') || ' anexou ' || coalesce(NEW.body, 'um arquivo');
    end if;

    insert into public.notificacoes (user_id, obra_id, tipo, titulo, subtitulo, link)
    select p.id, NEW.obra_id, 'info', v_titulo, v_sub,
           'cronograma:' || coalesce(NEW.obra_id, '') || ':' || coalesce(NEW.task_id, '')
    from public.user_profiles p
    where p.status = 'ativo'
      and coalesce(p.email, '') <> coalesce(NEW.author_email, '')   -- não notifica o autor
      and (
        p.perfil = 'admin'
        or exists (select 1 from public.user_obras uo
                   where uo.user_id = p.id and uo.obra_id = NEW.obra_id)
      );
  exception when others then
    null;  -- notificação nunca pode quebrar a gravação do histórico
  end;
  return NEW;
end;
$$;

drop trigger if exists trg_notify_task on public.task_history;
create trigger trg_notify_task after insert on public.task_history
  for each row execute function public.fn_notify_task_activity();

-- ============================================================================
-- Rollback:
--   drop trigger if exists trg_notify_task on public.task_history;
--   drop function if exists public.fn_notify_task_activity();
--   drop table if exists public.notificacoes;
--   drop function if exists public.current_profile_id();
-- ============================================================================
