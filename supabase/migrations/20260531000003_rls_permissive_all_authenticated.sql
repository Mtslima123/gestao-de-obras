-- ============================================================
-- RLS permissivo: qualquer usuário autenticado acessa tudo
-- As restrições por user_id serão reimplementadas no final do projeto
-- ============================================================

-- Remove políticas restritivas _own
DROP POLICY IF EXISTS "obras_select_own"             ON obras;
DROP POLICY IF EXISTS "obras_insert_own"             ON obras;
DROP POLICY IF EXISTS "obras_update_own"             ON obras;
DROP POLICY IF EXISTS "obras_delete_own"             ON obras;

DROP POLICY IF EXISTS "cronogramas_select_own"       ON cronogramas;
DROP POLICY IF EXISTS "cronogramas_insert_own"       ON cronogramas;
DROP POLICY IF EXISTS "cronogramas_update_own"       ON cronogramas;
DROP POLICY IF EXISTS "cronogramas_delete_own"       ON cronogramas;

DROP POLICY IF EXISTS "fotos_obra_select_own"        ON fotos_obra;
DROP POLICY IF EXISTS "fotos_obra_insert_own"        ON fotos_obra;
DROP POLICY IF EXISTS "fotos_obra_update_own"        ON fotos_obra;
DROP POLICY IF EXISTS "fotos_obra_delete_own"        ON fotos_obra;

DROP POLICY IF EXISTS "orcamentos_select_own"        ON orcamentos;
DROP POLICY IF EXISTS "orcamentos_insert_own"        ON orcamentos;
DROP POLICY IF EXISTS "orcamentos_update_own"        ON orcamentos;
DROP POLICY IF EXISTS "orcamentos_delete_own"        ON orcamentos;

DROP POLICY IF EXISTS "orcamento_itens_select_own"   ON orcamento_itens;
DROP POLICY IF EXISTS "orcamento_itens_insert_own"   ON orcamento_itens;
DROP POLICY IF EXISTS "orcamento_itens_update_own"   ON orcamento_itens;
DROP POLICY IF EXISTS "orcamento_itens_delete_own"   ON orcamento_itens;

DROP POLICY IF EXISTS "ia_interacoes_select_own"     ON ia_interacoes;
DROP POLICY IF EXISTS "users see own"                ON ia_interacoes;
DROP POLICY IF EXISTS "users insert own"             ON ia_interacoes;

-- Políticas permissivas: qualquer autenticado acessa tudo
CREATE POLICY "authed_all" ON obras
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authed_all" ON cronogramas
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authed_all" ON fotos_obra
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authed_all" ON orcamentos
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authed_all" ON orcamento_itens
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authed_all" ON ia_interacoes
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
