-- ============================================================================
-- Migration: lista de funções por obra em Mão de Obra > Efetivo
-- Data: 2026-10-13. Depende de 20261010000001 a 20261012000003.
--
-- O cadastro de funções (mo_funcao) é global, e toda função ativa aparecia no Previsto, na
-- Apropriação e na Análise de todas as obras. Agora cada obra pode tirar da sua lista as
-- funções que não usa, sem mexer no cadastro nem nas outras obras:
--   - tabela mo_obra_funcao_removida (RLS só leitura; escrita só pelas funções abaixo);
--   - mo_obra_funcao_remover: tira a função da lista da obra e apaga a linha dela no previsto
--     da obra. Recusa (PT409) se o previsto da obra estiver trancado ou se a obra já tem
--     apropriação da função (rascunho ou lançada, qualquer quinzena): valor diferente de zero
--     em qualquer campo numérico, ou destino/origem preenchido. Linha zerada não conta: o
--     "Lançar" grava uma linha zerada para toda função ativa;
--   - mo_obra_funcao_restaurar: devolve a função à lista da obra (previsto destrancado);
--   - mo_efetivo_estado devolve só as funções da obra, mais "funcoesRemovidas" (para o botão
--     Restaurar). Previsto, Apropriação e Análise leem desse retorno e se ajustam sozinhas.
--
-- Quem remove ou restaura é quem pode editar o Previsto da obra (mo_exigir_escrita), como no
-- "Salvar previsto". A tabela guarda quem removeu e quando. As linhas zeradas que o "Lançar"
-- gravou para a função continuam no banco, só não aparecem mais.
--
-- Aplicar manualmente no SQL Editor do Supabase (projeto gestao-de-obras), com aprovação do
-- TI. Selecione tudo (Ctrl+A) antes de rodar. Idempotente. Rollback no final.
-- ============================================================================

-- ─── 1. Tabela ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.mo_obra_funcao_removida (
  obra_id       TEXT        NOT NULL REFERENCES public.obras(id),
  funcao_id     BIGINT      NOT NULL REFERENCES public.mo_funcao(id),
  removida_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  removida_por  TEXT,
  PRIMARY KEY (obra_id, funcao_id)
);
CREATE INDEX IF NOT EXISTS idx_mo_obra_funcao_removida_funcao ON public.mo_obra_funcao_removida (funcao_id);

ALTER TABLE public.mo_obra_funcao_removida ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mo_obra_funcao_removida_select ON public.mo_obra_funcao_removida;
CREATE POLICY mo_obra_funcao_removida_select ON public.mo_obra_funcao_removida FOR SELECT TO authenticated
  USING (public.can_access_obra(obra_id));

REVOKE ALL ON public.mo_obra_funcao_removida FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.mo_obra_funcao_removida FROM authenticated;

-- ─── 2. Remover / restaurar a função na lista da obra ───────────────────────

CREATE OR REPLACE FUNCTION public.mo_obra_funcao_remover(p_obra text, p_funcao bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trancado boolean; v_nome text;
BEGIN
  PERFORM public.mo_exigir_escrita(p_obra, 'previsto');

  -- Mesma trava do mo_previsto_salvar: serializa com o salvamento do previsto da obra.
  INSERT INTO public.mo_obra_config (obra_id) VALUES (p_obra) ON CONFLICT (obra_id) DO NOTHING;
  SELECT previsto_trancado INTO v_trancado FROM public.mo_obra_config WHERE obra_id = p_obra FOR UPDATE;
  IF v_trancado THEN
    RAISE EXCEPTION 'Previsto trancado. Use "Editar previsto" para alterar.' USING ERRCODE = 'PT409';
  END IF;

  SELECT f.nome INTO v_nome FROM public.mo_funcao f WHERE f.id = p_funcao AND f.ativo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Função não encontrada.' USING ERRCODE = 'PT404';
  END IF;
  IF EXISTS (SELECT 1 FROM public.mo_obra_funcao_removida r WHERE r.obra_id = p_obra AND r.funcao_id = p_funcao) THEN
    RAISE EXCEPTION 'A função "%" já foi removida desta obra.', v_nome USING ERRCODE = 'PT409';
  END IF;

  -- Trava as quinzenas da obra (como mo_mes_excluir) antes de conferir, para ninguém gravar um
  -- valor entre a conferência e a remoção.
  PERFORM 1 FROM public.mo_apropriacao a WHERE a.obra_id = p_obra FOR UPDATE;
  IF EXISTS (
    SELECT 1
    FROM public.mo_apropriacao_item i
    JOIN public.mo_apropriacao a ON a.id = i.apropriacao_id
    WHERE a.obra_id = p_obra AND i.funcao_id = p_funcao
      AND (coalesce(i.total_efetivo, 0) <> 0 OR coalesce(i.trab_adm, 0) <> 0
           OR coalesce(i.inss_seguro, 0) <> 0 OR coalesce(i.ferias, 0) <> 0
           OR coalesce(i.emprest_manut, 0) <> 0 OR coalesce(i.recebido_outra_obra, 0) <> 0
           OR nullif(btrim(i.destino), '') IS NOT NULL OR nullif(btrim(i.origem), '') IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'A função "%" tem apropriação nesta obra e não pode ser removida.', v_nome USING ERRCODE = 'PT409';
  END IF;

  DELETE FROM public.mo_previsto WHERE obra_id = p_obra AND funcao_id = p_funcao;
  INSERT INTO public.mo_obra_funcao_removida (obra_id, funcao_id, removida_por)
  VALUES (p_obra, p_funcao, public.mo_usuario_nome());
END;
$$;

CREATE OR REPLACE FUNCTION public.mo_obra_funcao_restaurar(p_obra text, p_funcao bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trancado boolean;
BEGIN
  PERFORM public.mo_exigir_escrita(p_obra, 'previsto');

  INSERT INTO public.mo_obra_config (obra_id) VALUES (p_obra) ON CONFLICT (obra_id) DO NOTHING;
  SELECT previsto_trancado INTO v_trancado FROM public.mo_obra_config WHERE obra_id = p_obra FOR UPDATE;
  IF v_trancado THEN
    RAISE EXCEPTION 'Previsto trancado. Use "Editar previsto" para alterar.' USING ERRCODE = 'PT409';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.mo_funcao f WHERE f.id = p_funcao AND f.ativo) THEN
    RAISE EXCEPTION 'Função não encontrada.' USING ERRCODE = 'PT404';
  END IF;

  DELETE FROM public.mo_obra_funcao_removida WHERE obra_id = p_obra AND funcao_id = p_funcao;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Essa função não está removida desta obra.' USING ERRCODE = 'PT409';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.mo_obra_funcao_remover(text, bigint)   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mo_obra_funcao_restaurar(text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mo_obra_funcao_remover(text, bigint)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.mo_obra_funcao_restaurar(text, bigint) TO authenticated;

-- ─── 3. mo_efetivo_estado: só as funções da obra ────────────────────────────
-- Mesma função da migration 20261012000001; muda o seguinte:
--   - "funcoes", "previsto" e os "itens" das apropriações deixam de trazer as funções
--     removidas da obra;
--   - nova chave "funcoesRemovidas", no mesmo formato de "funcoes" (a tela só move o objeto
--     de uma lista para a outra ao remover/restaurar, sem recarregar e perder o que está
--     digitado no previsto).

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
      WHERE f.ativo
        AND NOT EXISTS (SELECT 1 FROM public.mo_obra_funcao_removida r WHERE r.obra_id = p_obra AND r.funcao_id = f.id)), '[]'::jsonb),

    'funcoesRemovidas', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', f.id::text, 'nome', f.nome, 'grupoId', f.grupo_id,
               'classificacao', c.nome, 'ativo', f.ativo, 'ordem', f.ordem)
             ORDER BY g.ordem, f.ordem, f.id)
      FROM public.mo_obra_funcao_removida r
      JOIN public.mo_funcao f ON f.id = r.funcao_id AND f.ativo
      JOIN public.mo_grupo g ON g.id = f.grupo_id
      LEFT JOIN public.mo_classificacao c ON c.id = f.classificacao_id
      WHERE r.obra_id = p_obra), '[]'::jsonb),

    'classificacoes', coalesce((SELECT jsonb_agg(c.nome ORDER BY c.nome) FROM public.mo_classificacao c), '[]'::jsonb),

    'previsto', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'obraId', p.obra_id, 'funcaoId', p.funcao_id::text, 'qtdMes', p.qtd_mes,
               'inicio', p.inicio, 'termino', p.termino)
             ORDER BY p.funcao_id)
      FROM public.mo_previsto p
      JOIN public.mo_funcao f ON f.id = p.funcao_id AND f.ativo
      WHERE p.obra_id = p_obra
        AND NOT EXISTS (SELECT 1 FROM public.mo_obra_funcao_removida r WHERE r.obra_id = p_obra AND r.funcao_id = p.funcao_id)), '[]'::jsonb),

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
                 WHERE i.apropriacao_id = a.id
                   AND NOT EXISTS (SELECT 1 FROM public.mo_obra_funcao_removida r WHERE r.obra_id = p_obra AND r.funcao_id = i.funcao_id)), '[]'::jsonb))
             ORDER BY a.ano, a.mes, a.quinzena)
      FROM public.mo_apropriacao a
      WHERE a.obra_id = p_obra), '[]'::jsonb),

    'mesesHabilitados', coalesce((
      SELECT jsonb_agg(jsonb_build_object('ano', h.ano, 'mes', h.mes) ORDER BY h.ano, h.mes)
      FROM public.mo_mes_habilitado h
      WHERE h.obra_id = p_obra), '[]'::jsonb),

    'mesesFechados', coalesce((
      SELECT jsonb_agg(jsonb_build_object('ano', x.ano, 'mes', x.mes) ORDER BY x.ano, x.mes)
      FROM public.mo_mes_fechado x
      WHERE x.obra_id = p_obra), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mo_efetivo_estado(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mo_efetivo_estado(text) TO authenticated;

-- ============================================================================
-- Rollback (volta a toda função ativa aparecer em todas as obras):
--   -- 1. reaplicar mo_efetivo_estado de 20261012000001 (sem "funcoesRemovidas" e sem o filtro)
--   -- 2. depois:
--   DROP FUNCTION IF EXISTS public.mo_obra_funcao_restaurar(text, bigint);
--   DROP FUNCTION IF EXISTS public.mo_obra_funcao_remover(text, bigint);
--   DROP TABLE    IF EXISTS public.mo_obra_funcao_removida;
-- ============================================================================
