-- ============================================================================
-- Migration: libera ESCRITA de `fotos_obra` para admin e usuários atribuídos
-- Data: 2026-07-19
--
-- GAP (funcional — upload de foto falha): a escrita de fotos_obra só era coberta
--   pela policy `fotos_obra_own` (obras.user_id = auth.uid()). Pelo descasamento
--   conhecido entre user_id e auth.uid() (mesmo problema corrigido em
--   can_access_obra — 20260713000001, e no cronograma — 20260715000002), esse
--   predicado quase nunca bate, então INSERT/UPDATE/DELETE de fotos afetava 0 linhas
--   para usuários atribuídos e até para admin não-dono. Resultado: upload de foto
--   silenciosamente sem gravar a linha em fotos_obra.
--
-- FIX: policy PERMISSIVA aditiva por public.can_access_obra(obra_id) (admin OU
--   atribuído por e-mail/status ativo). Combina por OR com fotos_obra_own; as
--   policies RESTRICTIVE de somente-leitura (fotos_ro_ins/upd/del) continuam
--   valendo por AND — usuário read-only segue sem gravar.
--
-- Aplicada manualmente no SQL Editor do Supabase. Idempotente.
-- ============================================================================

drop policy if exists fotos_obra_write_access on public.fotos_obra;

create policy fotos_obra_write_access on public.fotos_obra
  as permissive for all to authenticated
  using (public.can_access_obra(obra_id))
  with check (public.can_access_obra(obra_id));

-- ============================================================================
-- Rollback:
--   drop policy if exists fotos_obra_write_access on public.fotos_obra;
-- ============================================================================
