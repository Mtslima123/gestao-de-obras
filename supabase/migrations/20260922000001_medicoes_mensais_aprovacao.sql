-- ============================================================================
-- Migration: status "aprovada" para medicoes_mensais — terceiro estado do
-- ciclo de vida do boletim mensal, entre "fechada" e a liberação do mês
-- seguinte. Tela: Cronograma → Medição Mensal, botões "Aprovar"/"Desaprovar".
-- Data: 2026-09-22
--
-- Ciclo completo: rascunho --[Fechar]--> fechada --[Aprovar]--> aprovada,
-- e ao contrário aprovada --[Desaprovar]--> fechada --[Reabrir]--> rascunho.
-- "Desaprovar" não pula direto pra rascunho: passa por "fechada" de novo,
-- pelo mesmo motivo de reabrir_medicao_mensal (20260823000001) já existir —
-- evita destravar a edição de % por baixo de um mês seguinte que já foi
-- aberto contando com essa aprovação.
--
-- Mesma razão de reabrir_medicao_mensal pra precisar de função SECURITY
-- DEFINER em vez de UPDATE comum: a policy RESTRICTIVE
-- "medicoes_mensais_no_edit_fechada" (20260819000001, USING (status =
-- 'rascunho')) só permite UPDATE quando a linha, ANTES do update, já está em
-- rascunho — então nem fechada->aprovada nem aprovada->fechada passam por um
-- .update()/.upsert() direto (seriam filtrados, 0 linhas, sem erro).
--
-- Aplicar manualmente no SQL Editor do Supabase (projeto gestao-de-obras).
-- Idempotente (CREATE OR REPLACE, ADD COLUMN IF NOT EXISTS, DROP CONSTRAINT
-- IF EXISTS antes de recriar).
-- ============================================================================

ALTER TABLE public.medicoes_mensais
  DROP CONSTRAINT IF EXISTS medicoes_mensais_status_check,
  ADD CONSTRAINT medicoes_mensais_status_check CHECK (status IN ('rascunho', 'fechada', 'aprovada'));

ALTER TABLE public.medicoes_mensais
  ADD COLUMN IF NOT EXISTS aprovada_em  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS aprovada_por TEXT;

COMMENT ON COLUMN public.medicoes_mensais.aprovada_em IS
  'Quando a medição foi aprovada pela última vez (mesmo padrão de fechada_em:
  não é limpo ao desaprovar, só sobrescrito na próxima aprovação real).';
COMMENT ON COLUMN public.medicoes_mensais.aprovada_por IS
  'Nome ou e-mail de quem aprovou (texto solto, sem FK — mesmo padrão de
  fechada_por).';

-- RLS: nada de novo nas policies existentes — colunas novas herdam, e as
-- RESTRICTIVE de INSERT/UPDATE/DELETE por modo-somente-leitura já cobrem
-- qualquer caminho de escrita desta tabela.

CREATE OR REPLACE FUNCTION public.aprovar_medicao_mensal(p_obra_id text, p_mes_referencia text, p_aprovada_por text)
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
    SET status = 'aprovada', aprovada_em = now(), aprovada_por = p_aprovada_por, updated_at = now()
    WHERE obra_id = p_obra_id
      AND mes_referencia = p_mes_referencia
      AND status = 'fechada'
    RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.aprovar_medicao_mensal(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aprovar_medicao_mensal(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.desaprovar_medicao_mensal(p_obra_id text, p_mes_referencia text)
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
    SET status = 'fechada', updated_at = now()
    WHERE obra_id = p_obra_id
      AND mes_referencia = p_mes_referencia
      AND status = 'aprovada'
    RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.desaprovar_medicao_mensal(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.desaprovar_medicao_mensal(text, text) TO authenticated;

-- ============================================================================
-- Rollback:
--   DROP FUNCTION IF EXISTS public.desaprovar_medicao_mensal(text, text);
--   DROP FUNCTION IF EXISTS public.aprovar_medicao_mensal(text, text, text);
--   ALTER TABLE public.medicoes_mensais DROP COLUMN IF EXISTS aprovada_por;
--   ALTER TABLE public.medicoes_mensais DROP COLUMN IF EXISTS aprovada_em;
--   ALTER TABLE public.medicoes_mensais
--     DROP CONSTRAINT IF EXISTS medicoes_mensais_status_check,
--     ADD CONSTRAINT medicoes_mensais_status_check CHECK (status IN ('rascunho', 'fechada'));
-- ============================================================================
