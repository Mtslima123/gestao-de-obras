-- ============================================================================
-- Migration: mês inicial da Medição Mensal por obra ("Medição começa em").
-- Tela: Cronograma → Medição Mensal, seletor "Medição começa em".
-- Data: 2026-09-28
--
-- Por quê: os meses da medição vão do início da tarefa mais antiga do
-- cronograma, e cada mês só abre com o anterior aprovado. Em obra com
-- lançamento retroativo (ex.: ÍON, medição a partir de setembro) isso obrigava
-- a abrir/fechar/aprovar meses vazios só pra chegar no primeiro mês real.
-- Com medicao_mes_inicial preenchido, a tela ignora os meses anteriores na
-- cadeia de aprovação. NULL = comportamento antigo (todos os meses contam).
--
-- Gravação via RPC SECURITY DEFINER (não .update() direto em obras): quem mede
-- não precisa ter permissão de editar a obra inteira — mesma checagem de
-- acesso/somente-leitura das RPCs de medição (20260922000001).
--
-- Aplicar manualmente no SQL Editor do Supabase (projeto gestao-de-obras).
-- Idempotente (ADD COLUMN IF NOT EXISTS, DROP CONSTRAINT IF EXISTS, CREATE OR
-- REPLACE).
-- ============================================================================

ALTER TABLE public.obras
  ADD COLUMN IF NOT EXISTS medicao_mes_inicial TEXT;

ALTER TABLE public.obras
  DROP CONSTRAINT IF EXISTS obras_medicao_mes_inicial_check,
  ADD CONSTRAINT obras_medicao_mes_inicial_check
    CHECK (medicao_mes_inicial IS NULL OR medicao_mes_inicial ~ '^\d{4}-(0[1-9]|1[0-2])$');

COMMENT ON COLUMN public.obras.medicao_mes_inicial IS
  'Primeiro mês (YYYY-MM) da Medição Mensal. Meses anteriores ficam fora da
  cadeia de aprovação. NULL = medição começa no primeiro mês do cronograma.';

CREATE OR REPLACE FUNCTION public.definir_medicao_mes_inicial(p_obra_id text, p_mes text)
RETURNS text
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

  -- Não deixa esconder medição já criada: com mês inicial definido, nenhuma
  -- medição pode existir antes dele; limpar (NULL) só sem medição nenhuma,
  -- senão a cadeia antiga voltaria a exigir aprovação de meses nunca abertos.
  IF p_mes IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.medicoes_mensais WHERE obra_id = p_obra_id) THEN
      RAISE EXCEPTION 'obra ja tem medicao criada; nao da pra remover o mes inicial';
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM public.medicoes_mensais
    WHERE obra_id = p_obra_id AND mes_referencia < p_mes
  ) THEN
    RAISE EXCEPTION 'existe medicao criada antes de %', p_mes;
  END IF;

  UPDATE public.obras SET medicao_mes_inicial = p_mes WHERE id = p_obra_id;
  RETURN p_mes;
END;
$$;

REVOKE ALL ON FUNCTION public.definir_medicao_mes_inicial(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.definir_medicao_mes_inicial(text, text) TO authenticated;

-- ============================================================================
-- Rollback:
--   DROP FUNCTION IF EXISTS public.definir_medicao_mes_inicial(text, text);
--   ALTER TABLE public.obras DROP CONSTRAINT IF EXISTS obras_medicao_mes_inicial_check;
--   ALTER TABLE public.obras DROP COLUMN IF EXISTS medicao_mes_inicial;
-- ============================================================================
