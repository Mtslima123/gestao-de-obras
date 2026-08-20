-- ============================================================================
-- Migration: tabela `medicoes_mensais` — boletins de medição mensal do
-- Cronograma (aba "Medição Mensal"): % medido por tarefa e status de
-- fechamento (rascunho/fechada), por obra + mês de referência.
-- Data: 2026-08-19
--
-- Aplicar manualmente no SQL Editor do Supabase (projeto gestao-de-obras).
-- Idempotente: CREATE POLICY não aceita IF NOT EXISTS, então cada policy é
-- derrubada antes de ser recriada (mesma transação — não há janela sem RLS).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.medicoes_mensais (
  id             BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  obra_id        TEXT        NOT NULL,
  mes_referencia TEXT        NOT NULL, -- 'YYYY-MM', mesma convenção de months[].key do cronograma
  status         TEXT        NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'fechada')),
  itens          JSONB       NOT NULL DEFAULT '[]'::jsonb, -- [{ id, percMedido }]
  fechada_em     TIMESTAMPTZ,
  fechada_por    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (obra_id, mes_referencia)
);

CREATE INDEX IF NOT EXISTS idx_medicoes_mensais_obra ON public.medicoes_mensais(obra_id);

ALTER TABLE public.medicoes_mensais ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão de acesso de pavimentos_obra/cronogramas: dono da obra,
-- usuário com acesso liberado (can_access_obra), leitura para quem foi
-- atribuído à obra (user_has_obra), e bloqueio de escrita se o módulo
-- "cronograma" estiver em modo somente-leitura para o usuário.

DROP POLICY IF EXISTS "medicoes_mensais_own"             ON public.medicoes_mensais;
DROP POLICY IF EXISTS "medicoes_mensais_write_access"    ON public.medicoes_mensais;
DROP POLICY IF EXISTS "medicoes_mensais_assigned_select" ON public.medicoes_mensais;
DROP POLICY IF EXISTS "medicoes_mensais_ro_ins"          ON public.medicoes_mensais;
DROP POLICY IF EXISTS "medicoes_mensais_ro_upd"          ON public.medicoes_mensais;
DROP POLICY IF EXISTS "medicoes_mensais_ro_del"          ON public.medicoes_mensais;
DROP POLICY IF EXISTS "medicoes_mensais_no_edit_fechada" ON public.medicoes_mensais;

CREATE POLICY "medicoes_mensais_own" ON public.medicoes_mensais
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.obras
    WHERE obras.id = medicoes_mensais.obra_id AND obras.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.obras
    WHERE obras.id = medicoes_mensais.obra_id AND obras.user_id = auth.uid()
  ));

CREATE POLICY "medicoes_mensais_write_access" ON public.medicoes_mensais
  FOR ALL
  TO authenticated
  USING (can_access_obra(obra_id))
  WITH CHECK (can_access_obra(obra_id));

CREATE POLICY "medicoes_mensais_assigned_select" ON public.medicoes_mensais
  FOR SELECT
  USING (user_has_obra(obra_id));

CREATE POLICY "medicoes_mensais_ro_ins" ON public.medicoes_mensais AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (NOT is_module_readonly('cronograma'));

CREATE POLICY "medicoes_mensais_ro_upd" ON public.medicoes_mensais AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (NOT is_module_readonly('cronograma'))
  WITH CHECK (NOT is_module_readonly('cronograma'));

CREATE POLICY "medicoes_mensais_ro_del" ON public.medicoes_mensais AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (NOT is_module_readonly('cronograma'));

-- Defesa em profundidade (além da checagem na UI): uma medição já fechada não
-- pode ser alterada por um UPDATE comum — só rascunho -> fechada é permitido
-- pelo caminho normal da tela.
CREATE POLICY "medicoes_mensais_no_edit_fechada" ON public.medicoes_mensais AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (status = 'rascunho');

-- ============================================================================
-- Rollback:
--   DROP TABLE IF EXISTS public.medicoes_mensais;
-- ============================================================================
