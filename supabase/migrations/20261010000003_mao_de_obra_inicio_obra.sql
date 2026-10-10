-- ============================================================================
-- Migration: início da obra editável em Mão de Obra > Efetivo (aba Previsto)
-- Data: 2026-10-10. Depende de 20261010000001 e 20261010000002.
--
-- O término da obra já é gravado em mo_obra_config ao salvar o previsto. O início passa a ser
-- também: nova coluna inicio_obra. A tela usa mo_obra_config.inicio_obra; se ainda não houver,
-- cai no obras.inicio do cadastro (que NÃO é alterado por aqui).
--
-- Mudanças:
--   - coluna mo_obra_config.inicio_obra;
--   - mo_previsto_salvar ganha o parâmetro p_inicio_obra (DEFAULT NULL = não muda). A versão
--     antiga (3 parâmetros) é removida para não deixar duas funções com o mesmo nome;
--   - mo_efetivo_estado devolve o início da config.
--
-- Aplicar manualmente no SQL Editor do Supabase (projeto gestao-de-obras), com aprovação do
-- TI. Selecione tudo (Ctrl+A) antes de rodar. Idempotente. Rollback no final.
-- ============================================================================

ALTER TABLE public.mo_obra_config ADD COLUMN IF NOT EXISTS inicio_obra DATE;

-- ─── mo_previsto_salvar: agora também grava o início da obra ─────────────────

DROP FUNCTION IF EXISTS public.mo_previsto_salvar(text, date, jsonb);

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
    SELECT (x->>'funcaoId')::bigint AS funcao_id, (x->>'qtdMes')::int AS qtd_mes,
           (x->>'inicio')::date AS inicio, (x->>'termino')::date AS termino
    FROM jsonb_array_elements(p_itens) x
  )
  SELECT coalesce(f.nome, 'função inexistente') INTO v_bad
  FROM itens i LEFT JOIN public.mo_funcao f ON f.id = i.funcao_id
  WHERE f.id IS NULL OR NOT f.ativo OR i.qtd_mes IS NULL OR i.qtd_mes < 0
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
  SELECT p_obra, (x->>'funcaoId')::bigint, (x->>'qtdMes')::int, (x->>'inicio')::date, (x->>'termino')::date
  FROM jsonb_array_elements(p_itens) x;

  UPDATE public.mo_obra_config
     SET termino_obra = p_termino_obra, inicio_obra = v_inicio, previsto_trancado = true,
         trancado_em = now(), trancado_por = public.mo_usuario_nome()
   WHERE obra_id = p_obra;
END;
$$;

REVOKE ALL ON FUNCTION public.mo_previsto_salvar(text, date, jsonb, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mo_previsto_salvar(text, date, jsonb, date) TO authenticated;

-- ─── mo_efetivo_estado: início da obra vem da config, senão do cadastro ─────

CREATE OR REPLACE FUNCTION public.mo_efetivo_estado(p_obra text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_codigo text; v_inicio date; v_termino date; v_trancado boolean;
BEGIN
  IF NOT public.can_access_obra(p_obra) THEN
    RAISE EXCEPTION 'Sem acesso a esta obra.' USING ERRCODE = 'PT403';
  END IF;

  SELECT coalesce(nullif(o.sigla, ''), o.id), coalesce(c.inicio_obra, o.inicio),
         coalesce(c.termino_obra, o."dataFimObra", o.previsto),
         coalesce(c.previsto_trancado, false)
    INTO v_codigo, v_inicio, v_termino, v_trancado
  FROM public.obras o
  LEFT JOIN public.mo_obra_config c ON c.obra_id = o.id
  WHERE o.id = p_obra;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Obra não encontrada.' USING ERRCODE = 'PT404';
  END IF;
  v_inicio := coalesce(v_inicio, (SELECT min(p.inicio) FROM public.mo_previsto p WHERE p.obra_id = p_obra));

  RETURN jsonb_build_object(
    'obra', jsonb_build_object(
      'id', p_obra, 'codigo', v_codigo, 'inicio', v_inicio, 'termino', v_termino, 'previstoTrancado', v_trancado),

    'funcoes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', f.id::text, 'nome', f.nome, 'grupoId', f.grupo_id,
               'classificacao', c.nome, 'ativo', f.ativo, 'ordem', f.ordem)
             ORDER BY g.ordem, f.ordem, f.id)
      FROM public.mo_funcao f
      JOIN public.mo_grupo g ON g.id = f.grupo_id
      LEFT JOIN public.mo_classificacao c ON c.id = f.classificacao_id
      WHERE f.ativo), '[]'::jsonb),

    'classificacoes', coalesce((SELECT jsonb_agg(c.nome ORDER BY c.nome) FROM public.mo_classificacao c), '[]'::jsonb),

    'previsto', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'obraId', p.obra_id, 'funcaoId', p.funcao_id::text, 'qtdMes', p.qtd_mes,
               'inicio', p.inicio, 'termino', p.termino)
             ORDER BY p.funcao_id)
      FROM public.mo_previsto p
      JOIN public.mo_funcao f ON f.id = p.funcao_id AND f.ativo
      WHERE p.obra_id = p_obra), '[]'::jsonb),

    'apropriacoes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', a.id::text, 'obraId', a.obra_id, 'ano', a.ano, 'mes', a.mes, 'quinzena', a.quinzena,
               'dataReferencia', a.data_referencia, 'status', a.status,
               'lancadaEm', a.lancada_em, 'lancadaPor', a.lancada_por,
               'itens', coalesce((
                 SELECT jsonb_agg(jsonb_build_object(
                          'apropriacaoId', a.id::text, 'funcaoId', i.funcao_id::text,
                          'totalEfetivo', i.total_efetivo, 'trabAdm', i.trab_adm, 'inssSeguro', i.inss_seguro,
                          'ferias', i.ferias, 'emprestManut', i.emprest_manut, 'destino', i.destino,
                          'recebidoOutraObra', i.recebido_outra_obra, 'origem', i.origem)
                        ORDER BY i.funcao_id)
                 FROM public.mo_apropriacao_item i
                 JOIN public.mo_funcao f ON f.id = i.funcao_id AND f.ativo
                 WHERE i.apropriacao_id = a.id), '[]'::jsonb))
             ORDER BY a.ano, a.mes, a.quinzena)
      FROM public.mo_apropriacao a
      WHERE a.obra_id = p_obra), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mo_efetivo_estado(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mo_efetivo_estado(text) TO authenticated;

-- ============================================================================
-- Rollback (volta ao comportamento da migration 20261010000002; refaça aquela função):
--   DROP FUNCTION IF EXISTS public.mo_previsto_salvar(text, date, jsonb, date);
--   -- reaplicar mo_previsto_salvar(text, date, jsonb) e mo_efetivo_estado de 20261010000002
--   ALTER TABLE public.mo_obra_config DROP COLUMN IF EXISTS inicio_obra;
-- ============================================================================
