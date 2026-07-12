-- ============================================================================
-- Migration: auditoria à prova de forja (triggers no banco)
-- Data: 2026-07-12
--
-- Problema: hoje o log (audit_logs) é gravado pelo cliente (navegador), que
-- controla todos os campos e pode mentir ou simplesmente não registrar.
--
-- Solução: gerar o log automaticamente por trigger no servidor, com o usuário
-- verdadeiro (auth.uid()), hora e operação reais. Os registros de trigger têm
-- origem = 'DB-trigger' (os do cliente continuam com origem = 'Web').
--
-- Escopo: tabelas de escrita discreta e/ou sensíveis:
--   user_profiles (mudança de perfil/permissão = mais crítico), obras,
--   orcamentos, orcamento_itens, fotos_obra.
-- NÃO cobre `cronogramas` de propósito: ela é salva por autosave (debounce
-- 800ms) e geraria muito ruído + cópia do JSON inteiro a cada digitação.
--
-- A função é à prova de erro (EXCEPTION WHEN OTHERS): uma falha ao auditar
-- NUNCA quebra a operação real (INSERT/UPDATE/DELETE segue normal).
--
-- Idempotente. Rollback no final.
-- ============================================================================

create or replace function public.fn_audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_modulo text;
  v_acao   text;
  v_nome   text;
  v_perfil text;
  v_new    jsonb;
  v_old    jsonb;
begin
  begin
    v_new := case when TG_OP <> 'DELETE' then to_jsonb(NEW) else null end;
    v_old := case when TG_OP <> 'INSERT' then to_jsonb(OLD) else null end;

    v_modulo := case TG_TABLE_NAME
      when 'obras'           then 'obras'
      when 'fotos_obra'      then 'obras'
      when 'orcamentos'      then 'orcamentos'
      when 'orcamento_itens' then 'orcamentos'
      when 'user_profiles'   then 'usuarios'
      else TG_TABLE_NAME
    end;

    v_acao := case TG_OP
      when 'INSERT' then 'criou'
      when 'UPDATE' then 'editou'
      when 'DELETE' then 'excluiu'
    end;

    select nome, perfil into v_nome, v_perfil
    from public.user_profiles where email = auth.email() limit 1;

    insert into public.audit_logs
      (user_id, user_nome, user_perfil, obra_id, modulo, acao,
       entidade_tipo, entidade_id, valor_anterior, valor_novo, criticidade, origem)
    values (
      auth.uid(), v_nome, v_perfil,
      coalesce(v_new->>'obra_id', v_old->>'obra_id'),
      v_modulo, v_acao,
      TG_TABLE_NAME,
      coalesce(v_new->>'id', v_old->>'id', v_new->>'obra_id', v_old->>'obra_id'),
      v_old, v_new,
      case when TG_TABLE_NAME = 'user_profiles' then 'alta' else 'media' end,
      'DB-trigger'
    );
  exception when others then
    -- Auditoria nunca pode derrubar a operação real.
    null;
  end;
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trg_audit on public.user_profiles;
create trigger trg_audit after insert or update or delete on public.user_profiles
  for each row execute function public.fn_audit_row();

drop trigger if exists trg_audit on public.obras;
create trigger trg_audit after insert or update or delete on public.obras
  for each row execute function public.fn_audit_row();

drop trigger if exists trg_audit on public.orcamentos;
create trigger trg_audit after insert or update or delete on public.orcamentos
  for each row execute function public.fn_audit_row();

drop trigger if exists trg_audit on public.orcamento_itens;
create trigger trg_audit after insert or update or delete on public.orcamento_itens
  for each row execute function public.fn_audit_row();

drop trigger if exists trg_audit on public.fotos_obra;
create trigger trg_audit after insert or update or delete on public.fotos_obra
  for each row execute function public.fn_audit_row();

-- ============================================================================
-- Rollback:
--   drop trigger if exists trg_audit on public.user_profiles;
--   drop trigger if exists trg_audit on public.obras;
--   drop trigger if exists trg_audit on public.orcamentos;
--   drop trigger if exists trg_audit on public.orcamento_itens;
--   drop trigger if exists trg_audit on public.fotos_obra;
--   drop function if exists public.fn_audit_row();
-- ============================================================================
