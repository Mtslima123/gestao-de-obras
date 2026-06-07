-- ============================================================
-- SEGURANÇA: Reverte RLS permissivo — isola dados por usuário
-- Substitui: 20260531000003 (authed_all) e USING(true) policies
-- ============================================================

-- 🔒 SEGURANÇA [VULN-1]: Remove policies permissivas que deram acesso
--    cross-tenant. Substitui por filtro auth.uid() = user_id (previne IDOR CWE-639)
DROP POLICY IF EXISTS "authed_all" ON obras;
DROP POLICY IF EXISTS "authed_all" ON cronogramas;
DROP POLICY IF EXISTS "authed_all" ON fotos_obra;
DROP POLICY IF EXISTS "authed_all" ON orcamentos;
DROP POLICY IF EXISTS "authed_all" ON orcamento_itens;
DROP POLICY IF EXISTS "authed_all" ON ia_interacoes;

-- Remove também quaisquer policies anteriores _own que possam coexistir
DROP POLICY IF EXISTS "obras_select_own" ON obras;
DROP POLICY IF EXISTS "obras_insert_own" ON obras;
DROP POLICY IF EXISTS "obras_update_own" ON obras;
DROP POLICY IF EXISTS "obras_delete_own" ON obras;
DROP POLICY IF EXISTS "obras_own"        ON obras;

DROP POLICY IF EXISTS "orcamentos_select_own" ON orcamentos;
DROP POLICY IF EXISTS "orcamentos_insert_own" ON orcamentos;
DROP POLICY IF EXISTS "orcamentos_update_own" ON orcamentos;
DROP POLICY IF EXISTS "orcamentos_delete_own" ON orcamentos;
DROP POLICY IF EXISTS "orcamentos_own"        ON orcamentos;

DROP POLICY IF EXISTS "orcamento_itens_select_own" ON orcamento_itens;
DROP POLICY IF EXISTS "orcamento_itens_insert_own" ON orcamento_itens;
DROP POLICY IF EXISTS "orcamento_itens_update_own" ON orcamento_itens;
DROP POLICY IF EXISTS "orcamento_itens_delete_own" ON orcamento_itens;
DROP POLICY IF EXISTS "orcamento_itens_own"        ON orcamento_itens;

DROP POLICY IF EXISTS "cronogramas_select_own" ON cronogramas;
DROP POLICY IF EXISTS "cronogramas_insert_own" ON cronogramas;
DROP POLICY IF EXISTS "cronogramas_update_own" ON cronogramas;
DROP POLICY IF EXISTS "cronogramas_delete_own" ON cronogramas;
DROP POLICY IF EXISTS "cronogramas_own"        ON cronogramas;

DROP POLICY IF EXISTS "fotos_obra_select_own" ON fotos_obra;
DROP POLICY IF EXISTS "fotos_obra_insert_own" ON fotos_obra;
DROP POLICY IF EXISTS "fotos_obra_update_own" ON fotos_obra;
DROP POLICY IF EXISTS "fotos_obra_delete_own" ON fotos_obra;
DROP POLICY IF EXISTS "fotos_obra_own"        ON fotos_obra;

DROP POLICY IF EXISTS "ia_interacoes_select_own" ON ia_interacoes;
DROP POLICY IF EXISTS "users see own"            ON ia_interacoes;
DROP POLICY IF EXISTS "users insert own"         ON ia_interacoes;
DROP POLICY IF EXISTS "ia_interacoes_own"        ON ia_interacoes;

-- ────────────────────────────────────────────────────────────
-- Obras — acesso apenas ao dono
-- ────────────────────────────────────────────────────────────
CREATE POLICY "obras_own" ON obras
  FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK(auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
-- Orçamentos — acesso apenas ao dono
-- ────────────────────────────────────────────────────────────
CREATE POLICY "orcamentos_own" ON orcamentos
  FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK(auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
-- Orcamento_itens — sem user_id direto; acesso via orçamento pai
-- ────────────────────────────────────────────────────────────
CREATE POLICY "orcamento_itens_own" ON orcamento_itens
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM orcamentos
      WHERE orcamentos.id = orcamento_itens.orcamento_id
        AND orcamentos.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orcamentos
      WHERE orcamentos.id = orcamento_itens.orcamento_id
        AND orcamentos.user_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────
-- Cronogramas — acesso via obra pai
-- ────────────────────────────────────────────────────────────
CREATE POLICY "cronogramas_own" ON cronogramas
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM obras
      WHERE obras.id = cronogramas.obra_id
        AND obras.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM obras
      WHERE obras.id = cronogramas.obra_id
        AND obras.user_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────
-- Fotos — acesso via obra pai
-- ────────────────────────────────────────────────────────────
CREATE POLICY "fotos_obra_own" ON fotos_obra
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM obras
      WHERE obras.id = fotos_obra.obra_id
        AND obras.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM obras
      WHERE obras.id = fotos_obra.obra_id
        AND obras.user_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────
-- IA interações — cada usuário vê apenas as próprias
-- INSERT vem da Edge Function via service_role (bypassa RLS)
-- ────────────────────────────────────────────────────────────
CREATE POLICY "ia_interacoes_own" ON ia_interacoes
  FOR SELECT
  USING (auth.uid() = usuario_id);


-- ============================================================
-- 🔒 SEGURANÇA [VULN-2]: Remove USING(true) — substitui por policies granulares
--    Previne privilege escalation (CWE-269) e destruição de trilha de auditoria
-- ============================================================
DROP POLICY IF EXISTS "acesso_total_profiles"   ON user_profiles;
DROP POLICY IF EXISTS "acesso_total_user_obras"  ON user_obras;
DROP POLICY IF EXISTS "acesso_total_audit"       ON audit_logs;

-- user_profiles: SELECT — usuário lê apenas o próprio perfil; admin lê todos
CREATE POLICY "profiles_self_read" ON user_profiles
  FOR SELECT
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.perfil = 'admin'
    )
  );

-- user_profiles: mutações — somente admin
-- Impede que usuário comum atualize role/perfil (inclusive o próprio)
CREATE POLICY "profiles_admin_write" ON user_profiles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.perfil = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.perfil = 'admin'
    )
  );

-- user_obras: SELECT — usuário vê associações próprias; admin vê todas
CREATE POLICY "user_obras_self_read" ON user_obras
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.perfil = 'admin'
    )
  );

-- user_obras: mutações — somente admin
CREATE POLICY "user_obras_admin_write" ON user_obras
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.perfil = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.perfil = 'admin'
    )
  );

-- audit_logs: somente admin pode ler
-- Nenhum usuário pode DELETE/UPDATE — logs são imutáveis via RLS
-- INSERT vem do service_role (bypassa RLS)
CREATE POLICY "audit_logs_admin_read" ON audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.perfil = 'admin'
    )
  );


-- ============================================================
-- 🔒 SEGURANÇA [VULN-6]: estimativas_base — somente leitura para autenticados
--    Impede que usuário comum altere valores de referência paramétrica
-- ============================================================
DROP POLICY IF EXISTS "estimativas_base_insert_authed" ON estimativas_base;
DROP POLICY IF EXISTS "estimativas_base_update_authed" ON estimativas_base;
DROP POLICY IF EXISTS "estimativas_base_delete_authed" ON estimativas_base;
-- SELECT para autenticados permanece; mutações somente via service_role (admin)
