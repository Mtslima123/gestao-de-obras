-- ============================================================================
-- Migration: admin também precisa poder ENXERGAR (SELECT) qualquer orçamento,
--            não só editar/excluir
-- Data: 2026-08-24
--
-- BUG reportado: tela "Orçamento × Cronograma" mostra "Nenhum item de orçamento
--   encontrado para esta obra. Crie um orçamento primeiro." mesmo quando a obra
--   já tem um orçamento com itens cadastrados (confirmado via consulta somente
--   leitura: obra OB-2039 "Clarice" tem o orçamento OR-8114 com 6 itens).
--
-- CAUSA RAIZ: vinculoService.itensPorObra (src/modules/financeiro/vinculoService.js)
--   primeiro busca `select id from orcamentos where obra_id = ...` e só then
--   busca os itens desses orçamentos. A migration anterior
--   (20260823000002_orcamentos_admin_delete_update.sql) deu ao admin policies de
--   UPDATE/DELETE em `orcamentos` e ALL (inclui select) em `orcamento_itens`,
--   mas NÃO deu ao admin uma policy de SELECT em `orcamentos` — só existe
--   `orcamentos_assigned_select` (USING user_has_obra(obra_id)) e
--   `orcamentos_own` (USING auth.uid() = user_id). Um admin que não está
--   atribuído à obra via `user_obras` (tabela separada de "quem trabalha em
--   qual obra") e não é quem criou o orçamento cai fora das DUAS policies — o
--   Postgres filtra a linha em silêncio (RLS, sem erro), a primeira consulta
--   de `itensPorObra` volta vazia, e o código nem chega a consultar
--   `orcamento_itens` (iría funcionar, pela ALL-admin já existente, mas nunca
--   chega lá). Mesma classe de "filtro silencioso do RLS" já corrigida antes
--   nesta sessão (Reabrir medição, exclusão de orçamento).
--
-- FIX: policy PERMISSIVE de SELECT em `orcamentos` para admin, completando a
--   promessa da migration anterior ("admin pode editar/excluir orçamento que
--   não é dele" — não faz sentido sem também poder VER esse orçamento primeiro).
--   Mesma função is_current_user_admin() já usada nas outras policies de admin
--   deste projeto — não abre um caminho de autorização paralelo.
--
-- Aplicar manualmente no SQL Editor do Supabase (projeto gestao-de-obras).
-- Idempotente (DROP POLICY IF EXISTS antes do CREATE).
-- ============================================================================

drop policy if exists orcamentos_admin_select on public.orcamentos;
create policy orcamentos_admin_select on public.orcamentos
  as permissive for select to authenticated
  using (public.is_current_user_admin());

-- ============================================================================
-- Rollback:
--   drop policy if exists orcamentos_admin_select on public.orcamentos;
-- ============================================================================
