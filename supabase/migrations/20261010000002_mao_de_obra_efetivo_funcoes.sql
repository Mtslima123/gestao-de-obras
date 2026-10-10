-- ============================================================================
-- Migration: API do módulo Mão de Obra > Efetivo (funções mo_*, via supabase.rpc)
-- Data: 2026-10-10. Depende de 20261010000001_mao_de_obra_efetivo.sql.
--
-- Substitui os endpoints REST de api/contrato.md do handoff: não há backend próprio,
-- então cada endpoint vira uma função SECURITY DEFINER chamada por supabase.rpc().
-- As tabelas não têm policy de escrita (ver migration 1): só estas funções gravam.
--
-- Toda função de escrita confere, nesta ordem: acesso à obra (can_access_obra), modo
-- somente leitura da aba (is_aba_readonly('mao-de-obra', aba)) e a trava (409).
-- Códigos de erro (o PostgREST converte PTnnn no HTTP nnn; mensagens já em português):
--   PT400 dado inválido · PT403 sem permissão · PT404 não encontrado · PT409 trancado/lançado
--
-- Aplicar manualmente no SQL Editor do Supabase (projeto gestao-de-obras), com
-- aprovação do TI. Idempotente (CREATE OR REPLACE). Rollback no final.
-- ============================================================================

-- ─── Auxiliares internos (não expostos via RPC) ─────────────────────────────

CREATE OR REPLACE FUNCTION public.mo_usuario_nome()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT nome FROM public.user_profiles WHERE email = auth.email() LIMIT 1), auth.email());
$$;

CREATE OR REPLACE FUNCTION public.mo_exigir_escrita(p_obra text, p_aba text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_access_obra(p_obra) THEN
    RAISE EXCEPTION 'Sem acesso a esta obra.' USING ERRCODE = 'PT403';
  END IF;
  IF public.is_aba_readonly('mao-de-obra', p_aba) THEN
    RAISE EXCEPTION 'Sem permissão para editar: Mão de Obra está em modo somente leitura para o seu usuário.' USING ERRCODE = 'PT403';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.obras WHERE id = p_obra) THEN
    RAISE EXCEPTION 'Obra não encontrada.' USING ERRCODE = 'PT404';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.mo_exigir_admin()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Sem permissão: só administradores alteram funções, grupos e classificações.' USING ERRCODE = 'PT403';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.mo_validar_periodo(p_ano int, p_mes int, p_quinzena int)
RETURNS void LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_ano IS NULL OR p_ano NOT BETWEEN 2000 AND 2100
     OR p_mes IS NULL OR p_mes NOT BETWEEN 1 AND 12
     OR p_quinzena IS NULL OR p_quinzena NOT IN (1, 2) THEN
    RAISE EXCEPTION 'Período inválido.' USING ERRCODE = 'PT400';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.mo_usuario_nome()                        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mo_exigir_escrita(text, text)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mo_exigir_admin()                        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mo_validar_periodo(int, int, int)        FROM PUBLIC, anon, authenticated;

-- ─── Leitura: estado completo da tela (GET /obras/{id}/efetivo) ──────────────
-- Formato = EfetivoState do handoff (react/README.md). Só funções ATIVAS; término da obra
-- vem da config, senão de obras."dataFimObra", senão de obras.previsto (pode ser null:
-- a tela pede o término). Datas em ISO, ids como string.

CREATE OR REPLACE FUNCTION public.mo_efetivo_estado(p_obra text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_codigo text; v_inicio date; v_termino date; v_trancado boolean;
BEGIN
  IF NOT public.can_access_obra(p_obra) THEN
    RAISE EXCEPTION 'Sem acesso a esta obra.' USING ERRCODE = 'PT403';
  END IF;

  SELECT coalesce(nullif(o.sigla, ''), o.id), o.inicio,
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

-- ─── Cadastros globais (só admin) ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mo_classificacao_criar(p_nome text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nome text := btrim(coalesce(p_nome, ''));
BEGIN
  PERFORM public.mo_exigir_admin();
  IF v_nome = '' THEN
    RAISE EXCEPTION 'Informe o nome da classificação.' USING ERRCODE = 'PT400';
  END IF;
  IF EXISTS (SELECT 1 FROM public.mo_classificacao WHERE lower(nome) = lower(v_nome)) THEN
    RAISE EXCEPTION 'Já existe uma classificação com esse nome.' USING ERRCODE = 'PT409';
  END IF;
  INSERT INTO public.mo_classificacao (nome) VALUES (v_nome);
END;
$$;

-- Remove a classificação; as funções dela voltam a ser "própria função" (FK ON DELETE SET NULL).
CREATE OR REPLACE FUNCTION public.mo_classificacao_remover(p_nome text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.mo_exigir_admin();
  DELETE FROM public.mo_classificacao WHERE lower(nome) = lower(btrim(coalesce(p_nome, '')));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Classificação não encontrada.' USING ERRCODE = 'PT404';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.mo_funcao_criar(p_nome text, p_grupo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nome text := btrim(coalesce(p_nome, '')); v_row public.mo_funcao;
BEGIN
  PERFORM public.mo_exigir_admin();
  IF v_nome = '' THEN
    RAISE EXCEPTION 'Informe o nome da função.' USING ERRCODE = 'PT400';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mo_grupo WHERE id = p_grupo) THEN
    RAISE EXCEPTION 'Grupo inválido.' USING ERRCODE = 'PT400';
  END IF;
  IF EXISTS (SELECT 1 FROM public.mo_funcao WHERE ativo AND lower(nome) = lower(v_nome)) THEN
    RAISE EXCEPTION 'Já existe uma função com esse nome.' USING ERRCODE = 'PT409';
  END IF;
  INSERT INTO public.mo_funcao (nome, grupo_id, ordem)
  VALUES (v_nome, p_grupo, coalesce((SELECT max(ordem) FROM public.mo_funcao), 0) + 1)
  RETURNING * INTO v_row;
  RETURN jsonb_build_object('id', v_row.id::text, 'nome', v_row.nome, 'grupoId', v_row.grupo_id,
                            'classificacao', NULL, 'ativo', true, 'ordem', v_row.ordem);
END;
$$;

-- p_patch: { "grupoId": "OFICIAL" } e/ou { "classificacao": "Carpinteiro" | null }.
-- Chave ausente = não muda; "classificacao": null = volta a ser a própria classificação.
CREATE OR REPLACE FUNCTION public.mo_funcao_alterar(p_id bigint, p_patch jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_class_id bigint; v_nome text;
BEGIN
  PERFORM public.mo_exigir_admin();
  IF NOT EXISTS (SELECT 1 FROM public.mo_funcao WHERE id = p_id AND ativo) THEN
    RAISE EXCEPTION 'Função não encontrada.' USING ERRCODE = 'PT404';
  END IF;

  IF p_patch ? 'grupoId' THEN
    IF NOT EXISTS (SELECT 1 FROM public.mo_grupo WHERE id = p_patch->>'grupoId') THEN
      RAISE EXCEPTION 'Grupo inválido.' USING ERRCODE = 'PT400';
    END IF;
    UPDATE public.mo_funcao SET grupo_id = p_patch->>'grupoId' WHERE id = p_id;
  END IF;

  IF p_patch ? 'classificacao' THEN
    v_nome := nullif(btrim(coalesce(p_patch->>'classificacao', '')), '');
    IF v_nome IS NULL THEN
      v_class_id := NULL;
    ELSE
      SELECT id INTO v_class_id FROM public.mo_classificacao WHERE lower(nome) = lower(v_nome);
      IF v_class_id IS NULL THEN
        RAISE EXCEPTION 'Classificação não encontrada.' USING ERRCODE = 'PT400';
      END IF;
    END IF;
    UPDATE public.mo_funcao SET classificacao_id = v_class_id WHERE id = p_id;
  END IF;
END;
$$;

-- Soft delete: some do previsto e das telas, o histórico lançado fica preservado.
CREATE OR REPLACE FUNCTION public.mo_funcao_excluir(p_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.mo_exigir_admin();
  UPDATE public.mo_funcao SET ativo = false WHERE id = p_id AND ativo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Função não encontrada.' USING ERRCODE = 'PT404';
  END IF;
END;
$$;

-- ─── Previsto (PUT / destrancar) ────────────────────────────────────────────

-- p_itens: [{ funcaoId, qtdMes, inicio, termino }]. Substitui o previsto inteiro da obra,
-- grava o término da obra e TRANCA. 409 se já estiver trancado.
CREATE OR REPLACE FUNCTION public.mo_previsto_salvar(p_obra text, p_termino_obra date, p_itens jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trancado boolean; v_bad text;
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
     SET termino_obra = p_termino_obra, previsto_trancado = true,
         trancado_em = now(), trancado_por = public.mo_usuario_nome()
   WHERE obra_id = p_obra;
END;
$$;

CREATE OR REPLACE FUNCTION public.mo_previsto_destrancar(p_obra text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.mo_exigir_escrita(p_obra, 'previsto');
  UPDATE public.mo_obra_config
     SET previsto_trancado = false, destrancado_em = now(), destrancado_por = public.mo_usuario_nome()
   WHERE obra_id = p_obra AND previsto_trancado;
END;
$$;

-- ─── Apropriação (PUT rascunho / lançar / reabrir / copiar da 1ª) ────────────

-- p_itens: [{ funcaoId, totalEfetivo, trabAdm, inssSeguro, ferias, emprestManut, destino,
-- recebidoOutraObra, origem }]. Substitui os itens do rascunho; linhas sem nenhum valor
-- não são gravadas. 409 se a quinzena já foi lançada.
CREATE OR REPLACE FUNCTION public.mo_apropriacao_salvar(p_obra text, p_ano int, p_mes int, p_quinzena int, p_itens jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id bigint; v_status text;
BEGIN
  PERFORM public.mo_exigir_escrita(p_obra, 'apropriacao');
  PERFORM public.mo_validar_periodo(p_ano, p_mes, p_quinzena);
  IF jsonb_typeof(coalesce(p_itens, 'null'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Lista de funções inválida.' USING ERRCODE = 'PT400';
  END IF;

  INSERT INTO public.mo_apropriacao (obra_id, ano, mes, quinzena, data_referencia)
  VALUES (p_obra, p_ano, p_mes, p_quinzena, make_date(p_ano, p_mes, CASE p_quinzena WHEN 1 THEN 1 ELSE 16 END))
  ON CONFLICT (obra_id, ano, mes, quinzena) DO NOTHING;

  SELECT id, status INTO v_id, v_status FROM public.mo_apropriacao
   WHERE obra_id = p_obra AND ano = p_ano AND mes = p_mes AND quinzena = p_quinzena FOR UPDATE;
  IF v_status = 'LANCADA' THEN
    RAISE EXCEPTION 'Apropriação lançada. Reabra para alterar.' USING ERRCODE = 'PT409';
  END IF;

  DELETE FROM public.mo_apropriacao_item WHERE apropriacao_id = v_id;
  INSERT INTO public.mo_apropriacao_item
    (apropriacao_id, funcao_id, total_efetivo, trab_adm, inss_seguro, ferias, emprest_manut,
     destino, recebido_outra_obra, origem)
  SELECT v_id, f.id,
         (x->>'totalEfetivo')::int, (x->>'trabAdm')::int, (x->>'inssSeguro')::int, (x->>'ferias')::int,
         (x->>'emprestManut')::int, nullif(btrim(x->>'destino'), ''),
         (x->>'recebidoOutraObra')::int, nullif(btrim(x->>'origem'), '')
  FROM jsonb_array_elements(p_itens) x
  JOIN public.mo_funcao f ON f.id = (x->>'funcaoId')::bigint AND f.ativo
  WHERE x->>'totalEfetivo' IS NOT NULL OR x->>'trabAdm' IS NOT NULL OR x->>'inssSeguro' IS NOT NULL
     OR x->>'ferias' IS NOT NULL OR x->>'emprestManut' IS NOT NULL OR x->>'recebidoOutraObra' IS NOT NULL
     OR nullif(btrim(x->>'destino'), '') IS NOT NULL OR nullif(btrim(x->>'origem'), '') IS NOT NULL;
END;
$$;

-- Lançar: exige >= 1 linha preenchida e trab. canteiro >= 0 em todas; vazios viram 0 (todas as
-- funções ativas ficam com linha, para "última quinzena lançada" valer para a quinzena inteira)
-- e a quinzena fica trancada.
CREATE OR REPLACE FUNCTION public.mo_apropriacao_lancar(p_obra text, p_ano int, p_mes int, p_quinzena int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id bigint; v_status text; v_neg text;
BEGIN
  PERFORM public.mo_exigir_escrita(p_obra, 'apropriacao');
  PERFORM public.mo_validar_periodo(p_ano, p_mes, p_quinzena);

  SELECT id, status INTO v_id, v_status FROM public.mo_apropriacao
   WHERE obra_id = p_obra AND ano = p_ano AND mes = p_mes AND quinzena = p_quinzena FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Preencha ao menos uma função antes de lançar.' USING ERRCODE = 'PT400';
  END IF;
  IF v_status = 'LANCADA' THEN
    RAISE EXCEPTION 'Apropriação já lançada.' USING ERRCODE = 'PT409';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.mo_apropriacao_item i
    WHERE i.apropriacao_id = v_id
      AND (i.total_efetivo IS NOT NULL OR i.trab_adm IS NOT NULL OR i.inss_seguro IS NOT NULL
           OR i.ferias IS NOT NULL OR i.emprest_manut IS NOT NULL OR i.recebido_outra_obra IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Preencha ao menos uma função antes de lançar.' USING ERRCODE = 'PT400';
  END IF;

  SELECT string_agg(f.nome, ', ' ORDER BY f.ordem) INTO v_neg
  FROM public.mo_apropriacao_item i JOIN public.mo_funcao f ON f.id = i.funcao_id AND f.ativo
  WHERE i.apropriacao_id = v_id AND i.trab_canteiro < 0;
  IF v_neg IS NOT NULL THEN
    RAISE EXCEPTION 'Trab. no canteiro ficou negativo em: %. Confira total, ADM, INSS, férias e empréstimo.', v_neg
      USING ERRCODE = 'PT400';
  END IF;

  UPDATE public.mo_apropriacao_item
     SET total_efetivo = coalesce(total_efetivo, 0), trab_adm = coalesce(trab_adm, 0),
         inss_seguro = coalesce(inss_seguro, 0), ferias = coalesce(ferias, 0),
         emprest_manut = coalesce(emprest_manut, 0), recebido_outra_obra = coalesce(recebido_outra_obra, 0)
   WHERE apropriacao_id = v_id;

  INSERT INTO public.mo_apropriacao_item
    (apropriacao_id, funcao_id, total_efetivo, trab_adm, inss_seguro, ferias, emprest_manut, recebido_outra_obra)
  SELECT v_id, f.id, 0, 0, 0, 0, 0, 0
  FROM public.mo_funcao f
  WHERE f.ativo AND NOT EXISTS (
    SELECT 1 FROM public.mo_apropriacao_item i WHERE i.apropriacao_id = v_id AND i.funcao_id = f.id);

  UPDATE public.mo_apropriacao
     SET status = 'LANCADA', lancada_em = now(), lancada_por = public.mo_usuario_nome()
   WHERE id = v_id;
END;
$$;

-- Reabrir: volta a RASCUNHO (quem/quando fica em reaberta_* e na auditoria). Se já está em
-- rascunho, não faz nada.
CREATE OR REPLACE FUNCTION public.mo_apropriacao_reabrir(p_obra text, p_ano int, p_mes int, p_quinzena int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.mo_exigir_escrita(p_obra, 'apropriacao');
  PERFORM public.mo_validar_periodo(p_ano, p_mes, p_quinzena);
  UPDATE public.mo_apropriacao
     SET status = 'RASCUNHO', lancada_em = NULL, lancada_por = NULL,
         reaberta_em = now(), reaberta_por = public.mo_usuario_nome()
   WHERE obra_id = p_obra AND ano = p_ano AND mes = p_mes AND quinzena = p_quinzena AND status = 'LANCADA';
END;
$$;

-- Copia todos os campos da 1ª quinzena para a 2ª (só se a 2ª não estiver lançada).
CREATE OR REPLACE FUNCTION public.mo_apropriacao_copiar_da_1(p_obra text, p_ano int, p_mes int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_1 bigint; v_2 bigint; v_status text;
BEGIN
  PERFORM public.mo_exigir_escrita(p_obra, 'apropriacao');
  PERFORM public.mo_validar_periodo(p_ano, p_mes, 2);

  SELECT id INTO v_1 FROM public.mo_apropriacao
   WHERE obra_id = p_obra AND ano = p_ano AND mes = p_mes AND quinzena = 1;
  IF v_1 IS NULL THEN
    RAISE EXCEPTION 'A 1ª apropriação ainda não tem dados para copiar.' USING ERRCODE = 'PT400';
  END IF;

  INSERT INTO public.mo_apropriacao (obra_id, ano, mes, quinzena, data_referencia)
  VALUES (p_obra, p_ano, p_mes, 2, make_date(p_ano, p_mes, 16))
  ON CONFLICT (obra_id, ano, mes, quinzena) DO NOTHING;

  SELECT id, status INTO v_2, v_status FROM public.mo_apropriacao
   WHERE obra_id = p_obra AND ano = p_ano AND mes = p_mes AND quinzena = 2 FOR UPDATE;
  IF v_status = 'LANCADA' THEN
    RAISE EXCEPTION 'A 2ª apropriação já foi lançada. Reabra para alterar.' USING ERRCODE = 'PT409';
  END IF;

  DELETE FROM public.mo_apropriacao_item WHERE apropriacao_id = v_2;
  INSERT INTO public.mo_apropriacao_item
    (apropriacao_id, funcao_id, total_efetivo, trab_adm, inss_seguro, ferias, emprest_manut,
     destino, recebido_outra_obra, origem)
  SELECT v_2, funcao_id, total_efetivo, trab_adm, inss_seguro, ferias, emprest_manut,
         destino, recebido_outra_obra, origem
  FROM public.mo_apropriacao_item WHERE apropriacao_id = v_1;
END;
$$;

-- ─── Permissões de execução: só usuário autenticado (anon nunca) ─────────────

REVOKE ALL ON FUNCTION public.mo_efetivo_estado(text)                              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mo_classificacao_criar(text)                         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mo_classificacao_remover(text)                       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mo_funcao_criar(text, text)                          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mo_funcao_alterar(bigint, jsonb)                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mo_funcao_excluir(bigint)                            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mo_previsto_salvar(text, date, jsonb)                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mo_previsto_destrancar(text)                         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mo_apropriacao_salvar(text, int, int, int, jsonb)    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mo_apropriacao_lancar(text, int, int, int)           FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mo_apropriacao_reabrir(text, int, int, int)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mo_apropriacao_copiar_da_1(text, int, int)           FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.mo_efetivo_estado(text)                           TO authenticated;
GRANT EXECUTE ON FUNCTION public.mo_classificacao_criar(text)                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.mo_classificacao_remover(text)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.mo_funcao_criar(text, text)                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.mo_funcao_alterar(bigint, jsonb)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.mo_funcao_excluir(bigint)                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.mo_previsto_salvar(text, date, jsonb)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.mo_previsto_destrancar(text)                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.mo_apropriacao_salvar(text, int, int, int, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mo_apropriacao_lancar(text, int, int, int)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.mo_apropriacao_reabrir(text, int, int, int)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.mo_apropriacao_copiar_da_1(text, int, int)        TO authenticated;

-- ============================================================================
-- Rollback:
--   DROP FUNCTION IF EXISTS public.mo_apropriacao_copiar_da_1(text, int, int);
--   DROP FUNCTION IF EXISTS public.mo_apropriacao_reabrir(text, int, int, int);
--   DROP FUNCTION IF EXISTS public.mo_apropriacao_lancar(text, int, int, int);
--   DROP FUNCTION IF EXISTS public.mo_apropriacao_salvar(text, int, int, int, jsonb);
--   DROP FUNCTION IF EXISTS public.mo_previsto_destrancar(text);
--   DROP FUNCTION IF EXISTS public.mo_previsto_salvar(text, date, jsonb);
--   DROP FUNCTION IF EXISTS public.mo_funcao_excluir(bigint);
--   DROP FUNCTION IF EXISTS public.mo_funcao_alterar(bigint, jsonb);
--   DROP FUNCTION IF EXISTS public.mo_funcao_criar(text, text);
--   DROP FUNCTION IF EXISTS public.mo_classificacao_remover(text);
--   DROP FUNCTION IF EXISTS public.mo_classificacao_criar(text);
--   DROP FUNCTION IF EXISTS public.mo_efetivo_estado(text);
--   DROP FUNCTION IF EXISTS public.mo_validar_periodo(int, int, int);
--   DROP FUNCTION IF EXISTS public.mo_exigir_admin();
--   DROP FUNCTION IF EXISTS public.mo_exigir_escrita(text, text);
--   DROP FUNCTION IF EXISTS public.mo_usuario_nome();
-- ============================================================================
