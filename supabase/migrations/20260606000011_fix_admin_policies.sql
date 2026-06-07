-- ============================================================
-- CORREÇÃO: policies de admin usavam auth.uid() = id, mas
-- user_profiles.id é gen_random_uuid() — não o auth.uid().
-- Substitui por auth.email() = email, que funciona corretamente.
-- ============================================================

-- user_profiles
DROP POLICY IF EXISTS "profiles_self_read"   ON user_profiles;
DROP POLICY IF EXISTS "profiles_admin_write" ON user_profiles;

-- Usuário lê o próprio perfil (por email); admin lê todos
CREATE POLICY "profiles_self_read" ON user_profiles
  FOR SELECT USING (
    auth.email() = email
    OR EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.email = auth.email() AND up.perfil = 'admin'
    )
  );

-- Somente admin pode criar/alterar/excluir perfis
CREATE POLICY "profiles_admin_write" ON user_profiles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.email = auth.email() AND up.perfil = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.email = auth.email() AND up.perfil = 'admin'
    )
  );

-- user_obras (user_id referencia user_profiles.id, não auth.uid())
DROP POLICY IF EXISTS "user_obras_self_read"   ON user_obras;
DROP POLICY IF EXISTS "user_obras_admin_write" ON user_obras;

-- Usuário vê as próprias associações (via email → user_profiles.id)
CREATE POLICY "user_obras_self_read" ON user_obras
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = user_obras.user_id AND up.email = auth.email()
    )
    OR EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.email = auth.email() AND up.perfil = 'admin'
    )
  );

-- Somente admin gerencia vínculos
CREATE POLICY "user_obras_admin_write" ON user_obras
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.email = auth.email() AND up.perfil = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.email = auth.email() AND up.perfil = 'admin'
    )
  );

-- audit_logs
DROP POLICY IF EXISTS "audit_logs_admin_read" ON audit_logs;

CREATE POLICY "audit_logs_admin_read" ON audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.email = auth.email() AND up.perfil = 'admin'
    )
  );
