-- ============================================================================
-- Migration: notificar o AUTOR da própria ação
-- Data: 2026-07-15
--
-- Até aqui os gatilhos de notificação excluíam o autor da ação (você não era
-- notificado do que você mesmo fazia). A partir daqui o autor TAMBÉM recebe
-- notificação das próprias ações.
--
-- Só redefine as duas funções de notificação (create or replace), removendo a
-- linha que excluía o autor. Os gatilhos (create trigger) e todo o resto
-- permanecem iguais — não precisam ser recriados.
--
-- COMO RODAR: cole no SQL Editor do Supabase (projeto do sistema) e execute.
--             É idempotente (pode rodar mais de uma vez).
--
-- Depende das migrations anteriores:
--   20260713000003_notificacoes.sql        (tabela notificacoes + fn_notify_task_activity)
--   20260713000004_notificacoes_eventos.sql (fn_notify_activity + triggers obras/orcamentos/fotos)
-- ============================================================================

-- ─── 1) Tarefa: comentário / anexo (task_history) ───────────────────────────
-- Igual a 20260713000003, SEM a linha de exclusão do autor.
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
      -- (removido: exclusão do autor — agora o autor também é notificado)
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

-- ─── 2) Obras / orçamentos / fotos (fn_notify_activity) ──────────────────────
-- Igual a 20260713000004, SEM a linha de exclusão do autor.
create or replace function public.fn_notify_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_obra   text;
  v_titulo text;
  v_sub    text;
  v_link   text;
  v_actor  text;
  v_new    jsonb;
  v_old    jsonb;
begin
  begin
    v_new := case when TG_OP <> 'DELETE' then to_jsonb(NEW) else null end;
    v_old := case when TG_OP <> 'INSERT' then to_jsonb(OLD) else null end;

    -- obra_id: em `obras` é o próprio id; nas demais é a coluna obra_id
    if TG_TABLE_NAME = 'obras' then
      v_obra := coalesce(v_new->>'id', v_old->>'id');
    else
      v_obra := coalesce(v_new->>'obra_id', v_old->>'obra_id');
    end if;
    if v_obra is null then return coalesce(NEW, OLD); end if;

    select nome into v_actor from public.user_profiles where email = auth.email() limit 1;

    if TG_TABLE_NAME = 'obras' then
      v_titulo := case TG_OP when 'INSERT' then 'Nova obra' when 'UPDATE' then 'Obra atualizada' else 'Obra removida' end;
      v_sub    := coalesce(v_new->>'nome', v_old->>'nome', v_obra);
      v_link   := 'obra:' || v_obra;
    elsif TG_TABLE_NAME = 'orcamentos' then
      v_titulo := case TG_OP when 'INSERT' then 'Novo orçamento' when 'UPDATE' then 'Orçamento atualizado' else 'Orçamento removido' end;
      v_sub    := 'Orçamento ' || coalesce(v_new->>'id', v_old->>'id', '') || coalesce(' · ' || (v_new->>'versao'), '');
      v_link   := 'orcamento:' || coalesce(v_new->>'id', v_old->>'id', '');
    elsif TG_TABLE_NAME = 'fotos_obra' then
      v_titulo := case TG_OP when 'INSERT' then 'Nova foto' when 'UPDATE' then 'Foto atualizada' else 'Foto removida' end;
      v_sub    := coalesce(v_new->>'descricao', v_old->>'descricao', v_new->>'pavimento', v_old->>'pavimento', 'Foto de obra');
      v_link   := 'obra:' || v_obra;
    else
      v_titulo := 'Atividade';
      v_sub    := TG_TABLE_NAME;
      v_link   := 'obra:' || v_obra;
    end if;

    if v_actor is not null then v_sub := v_actor || ' · ' || v_sub; end if;

    insert into public.notificacoes (user_id, obra_id, tipo, titulo, subtitulo, link)
    select p.id, v_obra, 'info', v_titulo, v_sub, v_link
    from public.user_profiles p
    where p.status = 'ativo'
      -- (removido: exclusão do autor — agora o autor também é notificado)
      and (
        p.perfil = 'admin'
        or exists (select 1 from public.user_obras uo where uo.user_id = p.id and uo.obra_id = v_obra)
      );
  exception when others then
    null;  -- notificação nunca quebra a operação real
  end;
  return coalesce(NEW, OLD);
end;
$$;

-- ============================================================================
-- Rollback (volta a NÃO notificar o autor): reaplique as definições originais
-- de 20260713000003 e 20260713000004, que contêm, respectivamente:
--   ... and coalesce(p.email, '') <> coalesce(NEW.author_email, '')   -- não notifica o autor
--   ... and coalesce(p.email, '') <> coalesce(auth.email(), '')       -- exclui o autor
-- ============================================================================
