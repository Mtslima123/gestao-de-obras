-- ============================================================================
-- Migration: notificações para "tudo que acontece" (obras, orçamentos, fotos)
-- Data: 2026-07-13
--
-- Estende o sistema de notificações (20260713000003) para gerar notificação em
-- eventos de obras, orçamentos e fotos, além das tarefas (comentário/anexo, que
-- já são cobertas por fn_notify_task_activity).
--
-- Regra de visibilidade (mesma de sempre): fan-out por destinatário — cada membro
-- da obra (user_obras) e cada admin recebe uma notificação; o autor da ação é
-- excluído (por auth.email()).
--
-- Anti-spam (deliberado):
--   * NÃO dispara em `orcamento_itens` (salvar um orçamento faz UPDATE em N itens;
--     seria uma enxurrada). O evento no cabeçalho `orcamentos` já cobre "mudou".
--   * NÃO dispara em `cronogramas` (autosave a cada 800ms).
--
-- À prova de erro: exception when others => null (nunca quebra a operação real).
-- Idempotente. Rollback no final.
-- ============================================================================

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
      and coalesce(p.email, '') <> coalesce(auth.email(), '')   -- exclui o autor
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

drop trigger if exists trg_notify on public.obras;
create trigger trg_notify after insert or update or delete on public.obras
  for each row execute function public.fn_notify_activity();

drop trigger if exists trg_notify on public.orcamentos;
create trigger trg_notify after insert or update or delete on public.orcamentos
  for each row execute function public.fn_notify_activity();

drop trigger if exists trg_notify on public.fotos_obra;
create trigger trg_notify after insert or update or delete on public.fotos_obra
  for each row execute function public.fn_notify_activity();

-- ============================================================================
-- Rollback:
--   drop trigger if exists trg_notify on public.obras;
--   drop trigger if exists trg_notify on public.orcamentos;
--   drop trigger if exists trg_notify on public.fotos_obra;
--   drop function if exists public.fn_notify_activity();
-- ============================================================================
