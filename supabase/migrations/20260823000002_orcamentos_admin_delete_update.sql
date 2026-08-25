-- ============================================================================
-- Migration: admin pode excluir/editar qualquer orçamento (e seus itens),
--            não só o que ele mesmo criou
-- Data: 2026-08-23
--
-- BUG reportado: a tela de Orçamentos mostra o botão de excluir para qualquer
--   usuário do módulo (não só o admin, não só o criador — ver Orcamentos.jsx,
--   `!readOnly`), mas a única policy PERMISSIVE de escrita em `orcamentos`
--   (orcamentos_own, FOR ALL) só libera quando `auth.uid() = user_id`. Quando
--   um usuário tentava excluir um orçamento que não foi ele quem criou, o
--   Postgres filtrava a linha em silêncio (0 linhas afetadas, sem erro) — e o
--   app (antes da correção em orcamentos.service.js/Orcamentos.jsx) mostrava
--   "Orçamento excluído" mesmo sem ter excluído nada. Mesma classe de bug já
--   corrigida em "Reabrir medição" (20260823000001_reabrir_medicao_mensal.sql).
--
-- DECISÃO (confirmada com o usuário): qualquer usuário com perfil = 'admin'
--   pode excluir/editar QUALQUER orçamento, não só o próprio. Usuários comuns
--   continuam restritos ao que criaram (orcamentos_own, inalterada).
--
-- FIX: novas policies PERMISSIVE de UPDATE/DELETE em `orcamentos`, e uma de
--   ALL em `orcamento_itens` (sem ela, o header libera mas os itens do
--   orçamento continuam presos ao dono, pela orcamento_itens_own existente).
--   Usa public.is_current_user_admin() — a mesma função já usada em outras
--   policies do projeto — então não abre um caminho de autorização paralelo.
--
-- As policies RESTRICTIVE existentes (orc_ro_upd/orc_ro_del/orci_ro_*, que
--   bloqueiam escrita com o módulo em modo somente leitura) continuam valendo
--   e não precisam mudar: is_current_user_admin() já é o próprio motivo pelo
--   qual is_module_readonly() retorna falso para admin (ver definição dessa
--   função: `up.perfil <> 'admin'`).
--
-- Aplicar manualmente no SQL Editor do Supabase (projeto gestao-de-obras).
-- Idempotente (DROP POLICY IF EXISTS antes de cada CREATE).
-- ============================================================================

drop policy if exists orcamentos_admin_update on public.orcamentos;
create policy orcamentos_admin_update on public.orcamentos
  as permissive for update to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

drop policy if exists orcamentos_admin_delete on public.orcamentos;
create policy orcamentos_admin_delete on public.orcamentos
  as permissive for delete to authenticated
  using (public.is_current_user_admin());

drop policy if exists orcamento_itens_admin_write on public.orcamento_itens;
create policy orcamento_itens_admin_write on public.orcamento_itens
  as permissive for all to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

-- ============================================================================
-- Rollback:
--   drop policy if exists orcamentos_admin_update on public.orcamentos;
--   drop policy if exists orcamentos_admin_delete on public.orcamentos;
--   drop policy if exists orcamento_itens_admin_write on public.orcamento_itens;
-- ============================================================================
