-- Tabela de vínculos muitos-para-muitos entre itens do orçamento e tarefas do cronograma.
-- Permite que um item do orçamento contribua para várias tarefas e vice-versa.
-- O etapa_id referencia o campo id das etapas armazenadas em JSON na tabela cronogramas.
CREATE TABLE IF NOT EXISTS orcamento_cronograma_vinculos (
  id                BIGSERIAL PRIMARY KEY,
  obra_id           TEXT REFERENCES obras(id) ON DELETE CASCADE NOT NULL,
  orcamento_item_id BIGINT REFERENCES orcamento_itens(id) ON DELETE CASCADE NOT NULL,
  etapa_id          TEXT NOT NULL,
  user_id           UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (obra_id, orcamento_item_id, etapa_id)
);

ALTER TABLE orcamento_cronograma_vinculos ENABLE ROW LEVEL SECURITY;

-- Usuários autenticados gerenciam seus próprios vínculos
CREATE POLICY "authenticated_full_access_vinculos"
  ON orcamento_cronograma_vinculos
  FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_vinculos_obra    ON orcamento_cronograma_vinculos (obra_id);
CREATE INDEX IF NOT EXISTS idx_vinculos_item    ON orcamento_cronograma_vinculos (orcamento_item_id);
CREATE INDEX IF NOT EXISTS idx_vinculos_etapa   ON orcamento_cronograma_vinculos (etapa_id);
