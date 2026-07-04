-- ============================================================
-- CORREÇÃO: audit_logs não tinha política de INSERT para usuários
-- autenticados. Toda gravação de auditoria (criar/editar/excluir obra,
-- orçamento, cronograma etc.) falhava com 403 "new row violates
-- row-level security policy for table audit_logs" (confirmado nos
-- logs do Postgres). A trilha de auditoria estava silenciosamente
-- vazia desde a migração 20260606000010 (que só deixou SELECT p/ admin).
-- ============================================================

CREATE POLICY "audit_logs_insert_own" ON audit_logs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
