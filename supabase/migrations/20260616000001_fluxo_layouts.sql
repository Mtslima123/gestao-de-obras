-- ────────────────────────────────────────────────────────────
-- TABELA: fluxo_layouts
-- Guarda o layout do Fluxo Executivo (posições dos cards e ajustes
-- visuais das conexões) por obra e por usuário. Substitui a
-- persistência que ficava só no localStorage do navegador.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fluxo_layouts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id      TEXT        NOT NULL,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cards        JSONB       NOT NULL DEFAULT '[]'::jsonb,
  link_offsets JSONB       NOT NULL DEFAULT '{}'::jsonb,
  link_ports   JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (obra_id, user_id)
);

ALTER TABLE fluxo_layouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fluxo_layouts_select_own" ON fluxo_layouts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "fluxo_layouts_insert_own" ON fluxo_layouts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "fluxo_layouts_update_own" ON fluxo_layouts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "fluxo_layouts_delete_own" ON fluxo_layouts
  FOR DELETE USING (auth.uid() = user_id);
