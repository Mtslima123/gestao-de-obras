-- ============================================================================
-- Migration: quantidade por mês do previsto aceita número quebrado (ex.: 2,5 pessoas)
-- Data: 2026-10-12. Depende de 20261010000001 e 20261010000003.
--
-- mo_previsto.qtd_mes passa de INT para NUMERIC(8,2). Os valores atuais (inteiros) ficam
-- iguais; o CHECK (qtd_mes >= 0) continua valendo.
--
-- Mudanças:
--   - coluna mo_previsto.qtd_mes: INT -> NUMERIC(8,2);
--   - mo_previsto_salvar: lê a quantidade como número com até 2 casas (antes ::int). Mesma
--     assinatura da migration 20261010000003, então CREATE OR REPLACE basta.
-- mo_efetivo_estado não muda: devolve qtd_mes como número (20.00 chega ao navegador como 20).
--
-- Aplicar manualmente no SQL Editor do Supabase (projeto gestao-de-obras), com aprovação do
-- TI. Selecione tudo (Ctrl+A) antes de rodar. Idempotente. Rollback no final.
-- ============================================================================

ALTER TABLE public.mo_previsto ALTER COLUMN qtd_mes TYPE NUMERIC(8,2) USING qtd_mes::numeric(8,2);

CREATE OR REPLACE FUNCTION public.mo_previsto_salvar(p_obra text, p_termino_obra date, p_itens jsonb, p_inicio_obra date DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trancado boolean; v_bad text; v_inicio date;
BEGIN
  PERFORM public.mo_exigir_escrita(p_obra, 'previsto');
  IF p_termino_obra IS NULL THEN
    RAISE EXCEPTION 'Informe o término da obra.' USING ERRCODE = 'PT400';
  END IF;
  IF jsonb_typeof(coalesce(p_itens, 'null'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Lista de funções inválida.' USING ERRCODE = 'PT400';
  END IF;

  INSERT INTO public.mo_obra_config (obra_id) VALUES (p_obra) ON CONFLICT (obra_id) DO NOTHING;
  SELECT previsto_trancado INTO v_trancado FROM public.mo_obra_config WHERE obra_id = p_obra FOR UPDATE;
  IF v_trancado THEN
    RAISE EXCEPTION 'Previsto trancado. Use "Editar previsto" para alterar.' USING ERRCODE = 'PT409';
  END IF;

  -- Início efetivo da obra: o informado, senão o já gravado, senão o do cadastro da obra.
  SELECT coalesce(p_inicio_obra, c.inicio_obra, o.inicio) INTO v_inicio
  FROM public.obras o JOIN public.mo_obra_config c ON c.obra_id = o.id WHERE o.id = p_obra;
  IF v_inicio IS NULL THEN
    RAISE EXCEPTION 'Informe o início da obra.' USING ERRCODE = 'PT400';
  END IF;
  IF p_termino_obra < v_inicio THEN
    RAISE EXCEPTION 'O término da obra não pode ser antes do início.' USING ERRCODE = 'PT400';
  END IF;

  WITH itens AS (
    SELECT (x->>'funcaoId')::bigint AS funcao_id, round((x->>'qtdMes')::numeric, 2) AS qtd_mes,
           (x->>'inicio')::date AS inicio, (x->>'termino')::date AS termino
    FROM jsonb_array_elements(p_itens) x
  )
  SELECT coalesce(f.nome, 'função inexistente') INTO v_bad
  FROM itens i LEFT JOIN public.mo_funcao f ON f.id = i.funcao_id
  WHERE f.id IS NULL OR NOT f.ativo OR i.qtd_mes IS NULL OR i.qtd_mes < 0 OR i.qtd_mes > 9999
     OR i.inicio IS NULL OR i.termino IS NULL OR i.termino < i.inicio
  LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Linha inválida em "%": confira a quantidade e as datas (o término não pode ser antes do início).', v_bad
      USING ERRCODE = 'PT400';
  END IF;

  WITH itens AS (SELECT (x->>'funcaoId')::bigint AS funcao_id FROM jsonb_array_elements(p_itens) x)
  SELECT f.nome INTO v_bad
  FROM itens i JOIN public.mo_funcao f ON f.id = i.funcao_id
  GROUP BY f.nome HAVING count(*) > 1 LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'A função "%" aparece mais de uma vez.', v_bad USING ERRCODE = 'PT400';
  END IF;

  DELETE FROM public.mo_previsto WHERE obra_id = p_obra;
  INSERT INTO public.mo_previsto (obra_id, funcao_id, qtd_mes, inicio, termino)
  SELECT p_obra, (x->>'funcaoId')::bigint, round((x->>'qtdMes')::numeric, 2), (x->>'inicio')::date, (x->>'termino')::date
  FROM jsonb_array_elements(p_itens) x;

  UPDATE public.mo_obra_config
     SET termino_obra = p_termino_obra, inicio_obra = v_inicio, previsto_trancado = true,
         trancado_em = now(), trancado_por = public.mo_usuario_nome()
   WHERE obra_id = p_obra;
END;
$$;

REVOKE ALL ON FUNCTION public.mo_previsto_salvar(text, date, jsonb, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mo_previsto_salvar(text, date, jsonb, date) TO authenticated;

-- ============================================================================
-- Rollback (só se nenhum previsto tiver quantidade quebrada; round() descarta as casas):
--   ALTER TABLE public.mo_previsto ALTER COLUMN qtd_mes TYPE INT USING round(qtd_mes)::int;
--   -- reaplicar mo_previsto_salvar de 20261010000003 (com ::int)
-- ============================================================================
