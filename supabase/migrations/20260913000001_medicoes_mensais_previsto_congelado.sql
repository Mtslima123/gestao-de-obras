-- ============================================================================
-- Migration: congela o "previsto" (do mês e acumulado da obra) desde a
-- ABERTURA da medição mensal, não só no fechamento — sem isso, reprogramar
-- uma tarefa depois de abrir o mês recalculava o previsto ao vivo, fazendo a
-- meta "perseguir" o que foi executado em vez de continuar sendo a meta
-- original.
--
-- `perc_previsto` já existia (migration 20260820000001), mas nunca foi
-- implementado de verdade: o código sempre gravava uma constante fixa (100),
-- não o valor real do previsto do mês. Esta migration não muda a coluna em
-- si, só o comentário — o código passa a gravar o valor real, na abertura.
-- `perc_previsto_acumulado` é novo.
--
-- Depende de: 20260819000001_medicoes_mensais.sql, 20260820000001_medicoes_mensais_snapshot.sql.
-- Aplicar manualmente no SQL Editor do Supabase (projeto gestao-de-obras).
-- Idempotente.
-- Data: 2026-09-13
-- ============================================================================

ALTER TABLE public.medicoes_mensais
  ADD COLUMN IF NOT EXISTS perc_previsto_acumulado NUMERIC;

COMMENT ON COLUMN public.medicoes_mensais.perc_previsto IS
  '% previsto do mês (escala 0-100, o valor programado deste mês como fração do
  valor total da obra) — congelado na ABERTURA da medição e carregado adiante
  no fechamento sem recalcular. NULL em registros abertos antes deste campo
  existir (a tela volta a calcular ao vivo nesse caso).';
COMMENT ON COLUMN public.medicoes_mensais.perc_previsto_acumulado IS
  '% previsto acumulado da obra até este mês (escala 0-100) — congelado na
  ABERTURA da medição, mesma regra do perc_previsto. NULL em registros
  antigos.';

-- RLS: nada a fazer. Coluna nova herda as policies da tabela.

-- ============================================================================
-- Rollback:
--   ALTER TABLE public.medicoes_mensais
--     DROP COLUMN IF EXISTS perc_previsto_acumulado;
-- ============================================================================
