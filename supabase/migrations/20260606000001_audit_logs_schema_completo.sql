-- Expande audit_logs com todas as colunas esperadas pelo auditoria.service.js
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS user_id        UUID,
  ADD COLUMN IF NOT EXISTS user_nome      TEXT,
  ADD COLUMN IF NOT EXISTS user_perfil    TEXT,
  ADD COLUMN IF NOT EXISTS obra_id        TEXT,
  ADD COLUMN IF NOT EXISTS obra_nome      TEXT,
  ADD COLUMN IF NOT EXISTS modulo         TEXT,
  ADD COLUMN IF NOT EXISTS entidade_tipo  TEXT,
  ADD COLUMN IF NOT EXISTS entidade_id    TEXT,
  ADD COLUMN IF NOT EXISTS descricao      TEXT,
  ADD COLUMN IF NOT EXISTS valor_anterior JSONB,
  ADD COLUMN IF NOT EXISTS valor_novo     JSONB,
  ADD COLUMN IF NOT EXISTS criticidade    TEXT DEFAULT 'media',
  ADD COLUMN IF NOT EXISTS origem         TEXT DEFAULT 'Web',
  ADD COLUMN IF NOT EXISTS ip             TEXT,
  ADD COLUMN IF NOT EXISTS navegador      TEXT,
  ADD COLUMN IF NOT EXISTS sistema        TEXT,
  ADD COLUMN IF NOT EXISTS sessao_id      TEXT,
  ADD COLUMN IF NOT EXISTS duracao_ms     INTEGER;

-- Garante que valores de criticidade sejam válidos (aplicado a linhas futuras)
ALTER TABLE audit_logs
  ADD CONSTRAINT chk_criticidade
  CHECK (criticidade IN ('critica', 'alta', 'media', 'baixa'));

-- Índices para os filtros usados em auditoria.service.js
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id     ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_obra_id     ON audit_logs(obra_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_modulo      ON audit_logs(modulo);
CREATE INDEX IF NOT EXISTS idx_audit_logs_criticidade ON audit_logs(criticidade);
