-- ============================================================================
-- Migration: atualizar_snapshot_medicao_mensal — permite recongelar os valores
-- de uma medição fechada/aprovada quando o cronograma mudou depois do
-- fechamento (botão "Atualizar valores" na Medição Mensal, ao lado do aviso
-- de defasagem).
-- Data: 2026-09-22
--
-- Diferença pro reabrir_medicao_mensal (20260823000001): não muda o status
-- (continua 'fechada' ou 'aprovada', o que já era) — só substitui os campos
-- que vêm do cronograma (itens/valores/previstos), sem destravar edição de
-- % medido nem passar pela tela de rascunho. Mesmo motivo de precisar de
-- RPC (SECURITY DEFINER) em vez de UPDATE comum: a policy RESTRICTIVE
-- "medicoes_mensais_no_edit_fechada" (20260819000001) só libera UPDATE
-- partindo de status='rascunho' — uma linha 'fechada'/'aprovada' seria
-- filtrada silenciosamente (0 linhas, sem erro) por um update direto.
--
-- Aplicar manualmente no SQL Editor do Supabase (projeto gestao-de-obras).
-- Idempotente (CREATE OR REPLACE).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.atualizar_snapshot_medicao_mensal(
  p_obra_id text,
  p_mes_referencia text,
  p_itens jsonb,
  p_valor_total_medido numeric,
  p_perc_medido numeric,
  p_perc_previsto numeric,
  p_perc_previsto_acumulado numeric
)
RETURNS SETOF public.medicoes_mensais
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT can_access_obra(p_obra_id) THEN
    RAISE EXCEPTION 'sem acesso a esta obra';
  END IF;
  IF is_module_readonly('cronograma') THEN
    RAISE EXCEPTION 'modulo cronograma em modo somente leitura';
  END IF;

  RETURN QUERY
    UPDATE public.medicoes_mensais
    SET itens = p_itens,
        valor_total_medido = p_valor_total_medido,
        perc_medido = p_perc_medido,
        perc_previsto = p_perc_previsto,
        perc_previsto_acumulado = p_perc_previsto_acumulado,
        updated_at = now()
    WHERE obra_id = p_obra_id
      AND mes_referencia = p_mes_referencia
      AND status IN ('fechada', 'aprovada')
    RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.atualizar_snapshot_medicao_mensal(text, text, jsonb, numeric, numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_snapshot_medicao_mensal(text, text, jsonb, numeric, numeric, numeric, numeric) TO authenticated;

-- ============================================================================
-- Rollback:
--   DROP FUNCTION IF EXISTS public.atualizar_snapshot_medicao_mensal(text, text, jsonb, numeric, numeric, numeric, numeric);
-- ============================================================================
