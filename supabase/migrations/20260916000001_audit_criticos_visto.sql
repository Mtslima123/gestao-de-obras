-- Rastreia quando cada usuário marcou os eventos críticos de auditoria como vistos.
-- Sem isso, o badge da aba "Eventos Críticos" era apenas a contagem total de
-- eventos com criticidade='critica' (Auditoria.jsx) — nunca zerava ao clicar na aba.
-- Agora o front-end grava aqui a última visita e o badge passa a contar só os
-- eventos críticos criados depois disso (persiste entre sessões/dispositivos).
CREATE TABLE IF NOT EXISTS audit_criticos_visto (
  user_id  UUID        PRIMARY KEY REFERENCES user_profiles(id) ON DELETE CASCADE,
  visto_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE audit_criticos_visto ENABLE ROW LEVEL SECURITY;

-- Cada usuário só lê/grava a própria marca de "visto"
CREATE POLICY "audit_criticos_visto_own" ON audit_criticos_visto
  FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK(auth.uid() = user_id);
