-- ============================================================================
-- Migration: Anexos e Histórico de tarefas do Gantt (Cronograma)
-- Data: 2026-07-12
-- Objetivo: sair do armazenamento local (localStorage/IndexedDB) e passar a
--           persistir anexos, histórico e comentários no Supabase, compartilhado
--           entre usuários.
--
-- COMO RODAR: cole no SQL Editor do Supabase (projeto do sistema) e execute.
--             É idempotente (pode rodar mais de uma vez).
--
-- PREMISSAS — CONFIRA ANTES DE RODAR (ajuste se o seu schema diferir):
--   1) `public.user_profiles(id uuid, perfil text)` — perfil = 'admin' para administradores.
--   2) `public.user_obras(user_id uuid, obra_id text)` — vínculo usuário↔obra.
--   3) `obra_id` é TEXT (ex.: 'OB-3868'); `task_id` é TEXT (id da etapa, ex.: 'TSK-002').
--   Se `user_obras.user_id` referenciar outra coluna, ou `obra_id` for uuid,
--   ajuste os tipos/joins abaixo.
--
--   O autor (`author_id`) é TEXT de propósito: guarda o uuid do usuário como texto
--   ou o literal 'sistema' para eventos automáticos.
-- ============================================================================

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ─── Tabelas ────────────────────────────────────────────────────────────────
create table if not exists public.task_attachments (
  id            uuid primary key default gen_random_uuid(),
  obra_id       text        not null,
  task_id       text        not null,
  name          text        not null,
  mime          text,
  size          bigint,
  storage_path  text        not null,
  uploaded_at   timestamptz not null default now(),
  author_id     text,
  author_name   text,
  author_email  text
);

create table if not exists public.task_history (
  id            uuid primary key default gen_random_uuid(),
  obra_id       text        not null,
  task_id       text        not null,
  type          text        not null,   -- created|status|progress|schedule|dependency|attachment_add|attachment_remove|resource|comment
  field         text,
  from_val      text,
  to_val        text,
  body          text,                   -- texto do comentário / rótulo do anexo
  author_id     text,
  author_name   text,
  author_email  text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_task_attachments_obra_task on public.task_attachments (obra_id, task_id);
create index if not exists idx_task_attachments_uploaded  on public.task_attachments (uploaded_at desc);
create index if not exists idx_task_history_obra_task     on public.task_history (obra_id, task_id);
create index if not exists idx_task_history_created       on public.task_history (created_at desc);

-- ─── Função de acesso por obra (admin vê tudo) ───────────────────────────────
create or replace function public.can_access_obra(p_obra text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (select 1 from public.user_profiles p
            where p.id = auth.uid() and p.perfil = 'admin')
    or
    exists (select 1 from public.user_obras uo
            where uo.user_id = auth.uid() and uo.obra_id = p_obra);
$$;

grant execute on function public.can_access_obra(text) to authenticated;

-- ─── RLS: task_attachments ───────────────────────────────────────────────────
alter table public.task_attachments enable row level security;

drop policy if exists task_attachments_select on public.task_attachments;
create policy task_attachments_select on public.task_attachments
  for select to authenticated
  using (public.can_access_obra(obra_id));

drop policy if exists task_attachments_insert on public.task_attachments;
create policy task_attachments_insert on public.task_attachments
  for insert to authenticated
  with check (public.can_access_obra(obra_id));

drop policy if exists task_attachments_update on public.task_attachments;
create policy task_attachments_update on public.task_attachments
  for update to authenticated
  using (public.can_access_obra(obra_id))
  with check (public.can_access_obra(obra_id));

drop policy if exists task_attachments_delete on public.task_attachments;
create policy task_attachments_delete on public.task_attachments
  for delete to authenticated
  using (public.can_access_obra(obra_id));

-- ─── RLS: task_history ───────────────────────────────────────────────────────
alter table public.task_history enable row level security;

drop policy if exists task_history_select on public.task_history;
create policy task_history_select on public.task_history
  for select to authenticated
  using (public.can_access_obra(obra_id));

drop policy if exists task_history_insert on public.task_history;
create policy task_history_insert on public.task_history
  for insert to authenticated
  with check (public.can_access_obra(obra_id));

-- Exclusão só de comentário e só pelo autor OU admin (eventos automáticos: só admin).
drop policy if exists task_history_delete on public.task_history;
create policy task_history_delete on public.task_history
  for delete to authenticated
  using (
    public.can_access_obra(obra_id)
    and (
      author_id = auth.uid()::text
      or exists (select 1 from public.user_profiles p
                 where p.id = auth.uid() and p.perfil = 'admin')
    )
  );

-- ─── Storage: bucket privado + policies ──────────────────────────────────────
-- Convenção de path do arquivo: "<obra_id>/<task_id>/<attachment_id>"
-- Assim (storage.foldername(name))[1] = obra_id.
insert into storage.buckets (id, name, public)
values ('task-attachments', 'task-attachments', false)
on conflict (id) do nothing;

drop policy if exists task_attach_obj_select on storage.objects;
create policy task_attach_obj_select on storage.objects
  for select to authenticated
  using (bucket_id = 'task-attachments'
         and public.can_access_obra((storage.foldername(name))[1]));

drop policy if exists task_attach_obj_insert on storage.objects;
create policy task_attach_obj_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'task-attachments'
              and public.can_access_obra((storage.foldername(name))[1]));

drop policy if exists task_attach_obj_update on storage.objects;
create policy task_attach_obj_update on storage.objects
  for update to authenticated
  using (bucket_id = 'task-attachments'
         and public.can_access_obra((storage.foldername(name))[1]));

drop policy if exists task_attach_obj_delete on storage.objects;
create policy task_attach_obj_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'task-attachments'
         and public.can_access_obra((storage.foldername(name))[1]));

-- ============================================================================
-- Rollback (se precisar desfazer):
--   drop policy if exists task_attach_obj_select on storage.objects;
--   drop policy if exists task_attach_obj_insert on storage.objects;
--   drop policy if exists task_attach_obj_update on storage.objects;
--   drop policy if exists task_attach_obj_delete on storage.objects;
--   delete from storage.buckets where id = 'task-attachments';
--   drop table if exists public.task_history;
--   drop table if exists public.task_attachments;
--   drop function if exists public.can_access_obra(text);
-- ============================================================================
