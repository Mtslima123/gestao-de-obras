-- ============================================================================
-- Migration: excluir mês da lista de apropriação em Mão de Obra > Efetivo
-- Data: 2026-10-12. Depende de 20261010000004 e 20261012000001.
--
-- Mês que só tem apropriação vazia (rascunho sem nenhuma linha preenchida) ficava na lista de
-- períodos para sempre. O administrador passa a poder excluí-lo: mo_mes_excluir apaga as
-- apropriações vazias do mês e a habilitação dele, e o mês sai da lista (o mês atual aparece
-- sempre, então "excluir" nele só limpa os cabeçalhos).
--
-- Recusa (PT409) se o mês estiver fechado ou se qualquer quinzena tiver dado preenchido:
-- apropriação lançada ou com qualquer linha (inclusive só destino/origem).
--
-- Aplicar manualmente no SQL Editor do Supabase (projeto gestao-de-obras), com aprovação do
-- TI. Selecione tudo (Ctrl+A) antes de rodar. Idempotente. Rollback no final.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mo_mes_excluir(p_obra text, p_ano int, p_mes int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_apropriacoes int; v_habilitacoes int;
BEGIN
  PERFORM public.mo_exigir_admin();
  PERFORM public.mo_validar_periodo(p_ano, p_mes, 1);
  IF NOT public.can_access_obra(p_obra) THEN
    RAISE EXCEPTION 'Sem acesso a esta obra.' USING ERRCODE = 'PT403';
  END IF;

  -- Trava as quinzenas do mês (como mo_apropriacao_salvar) antes de conferir, para ninguém
  -- gravar um dado entre a conferência e a exclusão.
  PERFORM 1 FROM public.mo_apropriacao a
   WHERE a.obra_id = p_obra AND a.ano = p_ano AND a.mes = p_mes FOR UPDATE;

  IF EXISTS (SELECT 1 FROM public.mo_mes_fechado f WHERE f.obra_id = p_obra AND f.ano = p_ano AND f.mes = p_mes) THEN
    RAISE EXCEPTION 'Mês fechado. Reabra o mês antes de excluir.' USING ERRCODE = 'PT409';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.mo_apropriacao a
    WHERE a.obra_id = p_obra AND a.ano = p_ano AND a.mes = p_mes
      AND (a.status = 'LANCADA'
           OR EXISTS (SELECT 1 FROM public.mo_apropriacao_item i WHERE i.apropriacao_id = a.id))
  ) THEN
    RAISE EXCEPTION 'Esse mês tem dados preenchidos e não pode ser excluído.' USING ERRCODE = 'PT409';
  END IF;

  DELETE FROM public.mo_apropriacao WHERE obra_id = p_obra AND ano = p_ano AND mes = p_mes;
  GET DIAGNOSTICS v_apropriacoes = ROW_COUNT;
  DELETE FROM public.mo_mes_habilitado WHERE obra_id = p_obra AND ano = p_ano AND mes = p_mes;
  GET DIAGNOSTICS v_habilitacoes = ROW_COUNT;

  IF v_apropriacoes + v_habilitacoes = 0 THEN
    RAISE EXCEPTION 'Mês não encontrado.' USING ERRCODE = 'PT404';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.mo_mes_excluir(text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mo_mes_excluir(text, int, int) TO authenticated;

-- ============================================================================
-- Rollback:
--   DROP FUNCTION IF EXISTS public.mo_mes_excluir(text, int, int);
-- ============================================================================
