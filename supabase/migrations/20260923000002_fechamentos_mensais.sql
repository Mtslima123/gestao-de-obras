-- ============================================================================
-- Migration: tabela `fechamentos_mensais` — módulo Físico Financeiro.
-- Guarda o fechamento físico-financeiro (planilha .xls importada) por obra +
-- mês de referência. Sem lifecycle de status (diferente de medicoes_mensais):
-- reimportar o mesmo mês simplesmente sobrescreve via upsert. Sem RPC nem
-- policy restritiva por status — não há status aqui.
-- Data: 2026-09-23
--
-- Aplicar manualmente no SQL Editor do Supabase (projeto gestao-de-obras).
-- Idempotente: CREATE POLICY não aceita IF NOT EXISTS, então cada policy é
-- derrubada antes de ser recriada (mesma transação — não há janela sem RLS).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fechamentos_mensais (
  id             BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  obra_id        TEXT        NOT NULL,
  mes_referencia TEXT        NOT NULL, -- 'YYYY-MM'
  itens          JSONB       NOT NULL DEFAULT '[]'::jsonb, -- [{ codigo, nome, ...17 campos numéricos }]
  nome_arquivo   TEXT,                  -- nome original do .xls importado (rastreabilidade)
  imported_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  imported_by    TEXT,                  -- e-mail de quem importou
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (obra_id, mes_referencia)
);

CREATE INDEX IF NOT EXISTS idx_fechamentos_mensais_obra ON public.fechamentos_mensais(obra_id);

ALTER TABLE public.fechamentos_mensais ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão de acesso de medicoes_mensais/pavimentos_obra/fotos_obra: dono
-- da obra, usuário com acesso liberado (can_access_obra), leitura para quem
-- foi atribuído à obra (user_has_obra), e bloqueio de escrita se o módulo
-- "fisico-financeiro" estiver em modo somente-leitura para o usuário.

DROP POLICY IF EXISTS "fechamentos_mensais_own"             ON public.fechamentos_mensais;
DROP POLICY IF EXISTS "fechamentos_mensais_write_access"    ON public.fechamentos_mensais;
DROP POLICY IF EXISTS "fechamentos_mensais_assigned_select" ON public.fechamentos_mensais;
DROP POLICY IF EXISTS "fechamentos_mensais_ro_ins"          ON public.fechamentos_mensais;
DROP POLICY IF EXISTS "fechamentos_mensais_ro_upd"          ON public.fechamentos_mensais;
DROP POLICY IF EXISTS "fechamentos_mensais_ro_del"          ON public.fechamentos_mensais;

CREATE POLICY "fechamentos_mensais_own" ON public.fechamentos_mensais
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.obras
    WHERE obras.id = fechamentos_mensais.obra_id AND obras.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.obras
    WHERE obras.id = fechamentos_mensais.obra_id AND obras.user_id = auth.uid()
  ));

CREATE POLICY "fechamentos_mensais_write_access" ON public.fechamentos_mensais
  FOR ALL
  TO authenticated
  USING (can_access_obra(obra_id))
  WITH CHECK (can_access_obra(obra_id));

CREATE POLICY "fechamentos_mensais_assigned_select" ON public.fechamentos_mensais
  FOR SELECT
  USING (user_has_obra(obra_id));

CREATE POLICY "fechamentos_mensais_ro_ins" ON public.fechamentos_mensais AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (NOT is_module_readonly('fisico-financeiro'));

CREATE POLICY "fechamentos_mensais_ro_upd" ON public.fechamentos_mensais AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (NOT is_module_readonly('fisico-financeiro'))
  WITH CHECK (NOT is_module_readonly('fisico-financeiro'));

CREATE POLICY "fechamentos_mensais_ro_del" ON public.fechamentos_mensais AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (NOT is_module_readonly('fisico-financeiro'));

-- ============================================================================
-- Rollback:
--   DROP TABLE IF EXISTS public.fechamentos_mensais;
-- ============================================================================
