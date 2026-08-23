-- ============================================================================
-- Função: reabrir_medicao_mensal — permite a transição fechada -> rascunho
-- da tela de Medição Mensal (botão "Reabrir medição"), sem afrouxar a
-- proteção geral contra edição de medições fechadas.
-- Data: 2026-08-23
--
-- Causa do bug corrigido: a policy RESTRICTIVE "medicoes_mensais_no_edit_fechada"
-- (20260819000001_medicoes_mensais.sql, ajustada em
-- 20260821000001_fix_medicoes_mensais_fechamento_rls.sql) só permite UPDATE
-- comum quando a linha, ANTES do update, já tem status='rascunho'. Isso é
-- proposital — é a defesa que impede editar uma medição já fechada — mas
-- também bloqueia silenciosamente (0 linhas afetadas, sem erro) a transição
-- inversa fechada -> rascunho que o "Reabrir medição" precisa fazer.
--
-- Por que não alargar a policy em vez disso: status só tem 2 valores
-- possíveis ('rascunho'/'fechada'), então trocar o USING para aceitar os
-- dois tornaria a policy um no-op — qualquer UPDATE direto (não só o botão
-- Reabrir) poderia então reescrever uma medição fechada, destruindo a
-- garantia de snapshot congelado que a tabela foi desenhada para ter. Uma
-- função SECURITY DEFINER estreita, que só sabe fazer essa transição
-- específica (WHERE status = 'fechada' explícito), mantém a policy intacta
-- para qualquer outro caminho de escrita.
--
-- Reaproveita can_access_obra()/is_module_readonly() — as mesmas funções que
-- as policies da tabela já usam — para não abrir uma porta de autorização
-- diferente do resto do app.
--
-- Aplicar manualmente no SQL Editor do Supabase (projeto gestao-de-obras).
-- Idempotente (CREATE OR REPLACE).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reabrir_medicao_mensal(p_obra_id text, p_mes_referencia text)
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
    SET status = 'rascunho', updated_at = now()
    WHERE obra_id = p_obra_id
      AND mes_referencia = p_mes_referencia
      AND status = 'fechada'
    RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.reabrir_medicao_mensal(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reabrir_medicao_mensal(text, text) TO authenticated;

-- ============================================================================
-- Rollback:
--   DROP FUNCTION IF EXISTS public.reabrir_medicao_mensal(text, text);
-- ============================================================================
