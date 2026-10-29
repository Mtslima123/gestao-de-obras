-- ============================================================================
-- Migration: renomear função em Mão de Obra > Efetivo
-- Data: 2026-10-29. Depende de 20261010000001 e 20261010000002.
--
-- O modal "Grupos e classificações" passa a ter o botão de editar a função (nome). O cadastro
-- (mo_funcao) é global, então o novo nome vale em todas as obras; o previsto e as apropriações
-- apontam para a função pelo id e não perdem o vínculo.
--
-- Função nova, em vez de estender mo_funcao_alterar: a antiga ignoraria a chave "nome" em
-- silêncio se o app subisse antes do banco. Sem esta função, o app recebe "função não
-- encontrada" e avisa o erro de verdade.
--
-- Só admin (mo_exigir_admin), como o resto do cadastro. A auditoria sai sozinha: o trigger
-- trg_audit_mo em mo_funcao grava o UPDATE com o nome antigo e o novo.
--
-- Aplicar manualmente no SQL Editor do Supabase (projeto gestao-de-obras), com aprovação do
-- TI. Selecione tudo (Ctrl+A) antes de rodar. Idempotente. Rollback no final.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mo_funcao_renomear(p_id bigint, p_nome text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nome text := btrim(coalesce(p_nome, ''));
BEGIN
  PERFORM public.mo_exigir_admin();
  IF v_nome = '' THEN
    RAISE EXCEPTION 'Informe o nome da função.' USING ERRCODE = 'PT400';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mo_funcao WHERE id = p_id AND ativo) THEN
    RAISE EXCEPTION 'Função não encontrada.' USING ERRCODE = 'PT404';
  END IF;
  -- PT400 (e não PT409, como em mo_funcao_criar): a tela recarrega em PT409, e nome repetido
  -- não é tela desatualizada. A própria função fica de fora, para trocar só a caixa das letras.
  IF EXISTS (SELECT 1 FROM public.mo_funcao WHERE ativo AND id <> p_id AND lower(nome) = lower(v_nome)) THEN
    RAISE EXCEPTION 'Já existe uma função com esse nome.' USING ERRCODE = 'PT400';
  END IF;
  UPDATE public.mo_funcao SET nome = v_nome WHERE id = p_id;
  RETURN jsonb_build_object('id', p_id::text, 'nome', v_nome);
END;
$$;

REVOKE ALL ON FUNCTION public.mo_funcao_renomear(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mo_funcao_renomear(bigint, text) TO authenticated;

-- ============================================================================
-- Rollback:
--   DROP FUNCTION IF EXISTS public.mo_funcao_renomear(bigint, text);
-- ============================================================================
