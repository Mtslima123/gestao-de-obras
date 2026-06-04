-- Tabela de perfis de usuários
CREATE TABLE IF NOT EXISTS user_profiles (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome         TEXT        NOT NULL,
  email        TEXT        NOT NULL UNIQUE,
  telefone     TEXT,
  perfil       TEXT        NOT NULL DEFAULT 'usuario' CHECK (perfil IN ('admin', 'usuario')),
  status       TEXT        NOT NULL DEFAULT 'ativo'   CHECK (status IN ('ativo', 'inativo')),
  ultimo_acesso TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- Relacionamento usuário ↔ obras (N:N)
CREATE TABLE IF NOT EXISTS user_obras (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  obra_id    TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, obra_id)
);

-- Log de auditoria
CREATE TABLE IF NOT EXISTS audit_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  executado_por   UUID        REFERENCES user_profiles(id),
  acao            TEXT        NOT NULL,
  tabela          TEXT,
  registro_id     TEXT,
  detalhes        JSONB,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_user_obras_user_id ON user_obras(user_id);
CREATE INDEX IF NOT EXISTS idx_user_obras_obra_id ON user_obras(obra_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_executado_por ON audit_logs(executado_por);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_obras     ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs     ENABLE ROW LEVEL SECURITY;

-- Políticas permissivas para o admin (refinamento futuro por role)
CREATE POLICY "acesso_total_profiles"  ON user_profiles USING (true) WITH CHECK (true);
CREATE POLICY "acesso_total_user_obras" ON user_obras    USING (true) WITH CHECK (true);
CREATE POLICY "acesso_total_audit"     ON audit_logs    USING (true) WITH CHECK (true);
