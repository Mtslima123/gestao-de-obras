-- ============================================================
-- Migration: RLS (Row Level Security) + Índices de Performance
-- Data: 2026-05-31
-- Objetivo: Isolar dados por usuário e melhorar performance de queries
--
-- INSTRUÇÕES:
--   Execute via Supabase Dashboard → SQL Editor
--   OU: supabase db push (requer Supabase CLI vinculado ao projeto)
--
-- ATENÇÃO: Habilitar RLS bloqueia TODAS as queries sem policy.
--   Verifique se todas as tabelas abaixo existem antes de executar.
--   Em caso de dúvida, execute tabela por tabela e teste após cada bloco.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- TABELA: obras
-- user_id já existe na tabela (confirmado no código)
-- ────────────────────────────────────────────────────────────
ALTER TABLE obras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "obras_select_own" ON obras
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "obras_insert_own" ON obras
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "obras_update_own" ON obras
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "obras_delete_own" ON obras
  FOR DELETE USING (auth.uid() = user_id);


-- ────────────────────────────────────────────────────────────
-- TABELA: orcamentos
-- user_id já existe na tabela (confirmado no código)
-- ────────────────────────────────────────────────────────────
ALTER TABLE orcamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orcamentos_select_own" ON orcamentos
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "orcamentos_insert_own" ON orcamentos
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "orcamentos_update_own" ON orcamentos
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "orcamentos_delete_own" ON orcamentos
  FOR DELETE USING (auth.uid() = user_id);


-- ────────────────────────────────────────────────────────────
-- TABELA: orcamento_itens
-- Sem user_id direto — acesso via orcamento_id → orcamentos.user_id
-- ────────────────────────────────────────────────────────────
ALTER TABLE orcamento_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orcamento_itens_select_own" ON orcamento_itens
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orcamentos
      WHERE orcamentos.id = orcamento_itens.orcamento_id
        AND orcamentos.user_id = auth.uid()
    )
  );

CREATE POLICY "orcamento_itens_insert_own" ON orcamento_itens
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM orcamentos
      WHERE orcamentos.id = orcamento_itens.orcamento_id
        AND orcamentos.user_id = auth.uid()
    )
  );

CREATE POLICY "orcamento_itens_update_own" ON orcamento_itens
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM orcamentos
      WHERE orcamentos.id = orcamento_itens.orcamento_id
        AND orcamentos.user_id = auth.uid()
    )
  );

CREATE POLICY "orcamento_itens_delete_own" ON orcamento_itens
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM orcamentos
      WHERE orcamentos.id = orcamento_itens.orcamento_id
        AND orcamentos.user_id = auth.uid()
    )
  );


-- ────────────────────────────────────────────────────────────
-- TABELA: cronogramas
-- Acesso via obra_id → obras.user_id
-- ────────────────────────────────────────────────────────────
ALTER TABLE cronogramas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cronogramas_select_own" ON cronogramas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM obras
      WHERE obras.id = cronogramas.obra_id
        AND obras.user_id = auth.uid()
    )
  );

CREATE POLICY "cronogramas_insert_own" ON cronogramas
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM obras
      WHERE obras.id = cronogramas.obra_id
        AND obras.user_id = auth.uid()
    )
  );

CREATE POLICY "cronogramas_update_own" ON cronogramas
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM obras
      WHERE obras.id = cronogramas.obra_id
        AND obras.user_id = auth.uid()
    )
  );

CREATE POLICY "cronogramas_delete_own" ON cronogramas
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM obras
      WHERE obras.id = cronogramas.obra_id
        AND obras.user_id = auth.uid()
    )
  );


-- ────────────────────────────────────────────────────────────
-- TABELA: fotos_obra
-- Acesso via obra_id → obras.user_id
-- ────────────────────────────────────────────────────────────
ALTER TABLE fotos_obra ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fotos_obra_select_own" ON fotos_obra
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM obras
      WHERE obras.id = fotos_obra.obra_id
        AND obras.user_id = auth.uid()
    )
  );

CREATE POLICY "fotos_obra_insert_own" ON fotos_obra
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM obras
      WHERE obras.id = fotos_obra.obra_id
        AND obras.user_id = auth.uid()
    )
  );

CREATE POLICY "fotos_obra_update_own" ON fotos_obra
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM obras
      WHERE obras.id = fotos_obra.obra_id
        AND obras.user_id = auth.uid()
    )
  );

CREATE POLICY "fotos_obra_delete_own" ON fotos_obra
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM obras
      WHERE obras.id = fotos_obra.obra_id
        AND obras.user_id = auth.uid()
    )
  );


-- ────────────────────────────────────────────────────────────
-- TABELA: estimativas_base
-- Sem user_id — dados compartilhados de referência paramétrica.
-- Leitura pública (qualquer autenticado); escrita só pelo service role.
-- Ajuste se precisar de isolamento por usuário.
-- ────────────────────────────────────────────────────────────
ALTER TABLE estimativas_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY "estimativas_base_select_authed" ON estimativas_base
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "estimativas_base_insert_authed" ON estimativas_base
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "estimativas_base_update_authed" ON estimativas_base
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "estimativas_base_delete_authed" ON estimativas_base
  FOR DELETE USING (auth.role() = 'authenticated');


-- ────────────────────────────────────────────────────────────
-- TABELA: ia_interacoes
-- usuario_id é o auth.uid() — cada user vê só os próprios logs
-- ────────────────────────────────────────────────────────────
ALTER TABLE ia_interacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ia_interacoes_select_own" ON ia_interacoes
  FOR SELECT USING (auth.uid() = usuario_id);

-- Inserção feita pela Edge Function com service_role (bypassa RLS) — não precisa de policy INSERT


-- ============================================================
-- ÍNDICES DE PERFORMANCE
-- Melhoram queries de listagem e filtragem nas telas principais
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_obras_user_created
  ON obras(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orcamentos_user_created
  ON orcamentos(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orcamento_itens_orcamento_ordem
  ON orcamento_itens(orcamento_id, ordem ASC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_fotos_obra_obra_created
  ON fotos_obra(obra_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cronogramas_obra_id
  ON cronogramas(obra_id);

CREATE INDEX IF NOT EXISTS idx_estimativas_base_tipo
  ON estimativas_base(tipo);

CREATE INDEX IF NOT EXISTS idx_ia_interacoes_usuario
  ON ia_interacoes(usuario_id, created_at DESC);
