-- ============================================================================
-- Migration: snapshot de fechamento em `medicoes_mensais` — congela os valores
-- medidos no momento do fechamento, para o histórico de medições fechadas não
-- mudar retroativamente quando o cronograma mudar depois (custo, datas, vínculo
-- de orçamento). Antes disso só `percMedido` era gravado e todo o resto era
-- recalculado na releitura.
-- Data: 2026-08-20
--
-- Depende de: 20260819000001_medicoes_mensais.sql (aplicar as duas na ordem).
-- Aplicar manualmente no SQL Editor do Supabase (projeto gestao-de-obras).
-- Idempotente.
-- ============================================================================

ALTER TABLE public.medicoes_mensais
  ADD COLUMN IF NOT EXISTS valor_total_medido NUMERIC,
  ADD COLUMN IF NOT EXISTS perc_medido        NUMERIC,
  ADD COLUMN IF NOT EXISTS perc_previsto      NUMERIC;

COMMENT ON COLUMN public.medicoes_mensais.valor_total_medido IS
  'Total em R$ medido no fechamento (congelado). NULL enquanto rascunho.';
COMMENT ON COLUMN public.medicoes_mensais.perc_medido IS
  '% medido do mês no fechamento (escala 0-100, congelado). NULL enquanto rascunho.';
COMMENT ON COLUMN public.medicoes_mensais.perc_previsto IS
  '% previsto do mês no fechamento (escala 0-100). Serve de referência do que era a meta.';

-- O JSONB `itens` passa a guardar o snapshot por item no fechamento
-- ({ id, wbs, descricao, pavimento, valor, foraDoMes, percExecutado, percMedido })
-- em vez de apenas { id, percMedido }. Rascunho continua gravando o formato enxuto;
-- mergePercMedido lê `percMedido` por `id` nos dois casos, então não há migração de
-- dados a fazer — registros antigos seguem funcionando.

-- RLS: nada a fazer. Colunas novas herdam as policies da tabela, incluindo a
-- restritiva `medicoes_mensais_no_edit_fechada`, que impede alterar linha fechada.

-- ============================================================================
-- Rollback:
--   ALTER TABLE public.medicoes_mensais
--     DROP COLUMN IF EXISTS valor_total_medido,
--     DROP COLUMN IF EXISTS perc_medido,
--     DROP COLUMN IF EXISTS perc_previsto;
-- ============================================================================
