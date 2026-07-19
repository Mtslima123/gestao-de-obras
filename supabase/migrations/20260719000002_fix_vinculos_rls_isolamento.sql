-- ============================================================================
-- Migration: corrige o RLS de `orcamento_cronograma_vinculos` (isolamento por obra)
-- Data: 2026-07-19
--
-- GAP (cross-tenant / IDOR): a policy original `authenticated_full_access_vinculos`
--   (criada junto da tabela em 20260601000001) era FOR ALL com o predicado
--   `auth.uid() IS NOT NULL` — ou seja, QUALQUER usuário autenticado lia, inseria,
--   editava e apagava os vínculos de TODAS as obras. As migrations de endurecimento
--   (20260606000010, 20260708000002, 20260712_rls_readonly_enforcement) esqueceram
--   esta tabela.
--
-- FIX: troca por acesso-por-obra usando public.can_access_obra(obra_id) — o mesmo
--   modelo já aplicado ao cronograma (20260715000002): libera admin OU usuário
--   atribuído à obra (casando por e-mail, status = 'ativo').
--
-- Aplicada manualmente no SQL Editor do Supabase. Idempotente.
-- ============================================================================

drop policy if exists authenticated_full_access_vinculos on public.orcamento_cronograma_vinculos;

create policy vinculos_access on public.orcamento_cronograma_vinculos
  as permissive for all to authenticated
  using (public.can_access_obra(obra_id))
  with check (public.can_access_obra(obra_id));

-- ============================================================================
-- Rollback (NÃO recomendado — reabre o vazamento):
--   drop policy if exists vinculos_access on public.orcamento_cronograma_vinculos;
--   create policy authenticated_full_access_vinculos on public.orcamento_cronograma_vinculos
--     for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
-- ============================================================================
