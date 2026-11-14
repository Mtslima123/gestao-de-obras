-- ============================================================================
-- Migration: ordem manual dos pavimentos da Medição (`pavimentos_obra.ordem`)
-- Data: 2026-11-03
--
-- Contexto: a lista do filtro Pavimento da Medição Mensal segue a ordem de cadastro
-- (id) da tabela `pavimentos_obra`, sem como reposicionar. A Medição ganhou o botão
-- "Ordem dos pavimentos" (subir/descer). A ordem passa a ser guardada numa coluna
-- própria, gravada de uma vez pela função abaixo (nada fica pela metade se a conexão
-- cair no meio).
--
-- - Coluna `ordem` (inteiro): preenchida aqui com a ordem atual (por id, dentro de cada
--   obra). Linhas sem ordem (cadastradas depois, ou por uma versão antiga do app) vão
--   pro fim, na ordem de cadastro: o app ordena por ordem (nulos por último) e depois
--   por id.
-- - Função `reordenar_pavimentos_obra(obra, nomes[])`: grava a ordem inteira da obra
--   numa transação só. Faz UPSERT, e não só UPDATE, porque a lista da Medição também
--   traz pavimentos que existem só nas tarefas (digitados à mão) e que ainda não estão
--   no cadastro. SECURITY INVOKER: as policies da tabela continuam valendo
--   (can_access_obra e o bloqueio de módulo somente-leitura). Devolve quantas linhas
--   gravou; 0 = sem permissão (o app avisa).
--
-- Enquanto não for aplicada, o app continua funcionando: a lista segue a ordem de
-- cadastro como hoje, e só o botão Salvar da ordem avisa que depende desta atualização.
--
-- Aplicar manualmente no SQL Editor do Supabase (projeto gestao-de-obras).
-- Idempotente.
-- ============================================================================

ALTER TABLE public.pavimentos_obra ADD COLUMN IF NOT EXISTS ordem INTEGER;

UPDATE public.pavimentos_obra p
SET ordem = s.pos
FROM (
  SELECT id, row_number() OVER (PARTITION BY obra_id ORDER BY id) AS pos
  FROM public.pavimentos_obra
) s
WHERE p.id = s.id AND p.ordem IS NULL;

CREATE INDEX IF NOT EXISTS idx_pavimentos_obra_ordem
  ON public.pavimentos_obra (obra_id, ordem, id);

CREATE OR REPLACE FUNCTION public.reordenar_pavimentos_obra(p_obra_id TEXT, p_nomes TEXT[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  n INTEGER;
BEGIN
  INSERT INTO public.pavimentos_obra (obra_id, nome, ordem)
  SELECT p_obra_id, x.nome, x.pos
  FROM unnest(p_nomes) WITH ORDINALITY AS x(nome, pos)
  ON CONFLICT (obra_id, nome) DO UPDATE SET ordem = EXCLUDED.ordem;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.reordenar_pavimentos_obra(TEXT, TEXT[]) FROM PUBLIC;
-- O Supabase dá EXECUTE direto ao anon nas funções novas do schema public (o REVOKE de
-- PUBLIC acima não tira). Inofensivo pelo RLS, mas não há motivo pra liberar.
REVOKE EXECUTE ON FUNCTION public.reordenar_pavimentos_obra(TEXT, TEXT[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.reordenar_pavimentos_obra(TEXT, TEXT[]) TO authenticated;

-- ============================================================================
-- Rollback:
--   DROP FUNCTION IF EXISTS public.reordenar_pavimentos_obra(TEXT, TEXT[]);
--   DROP INDEX IF EXISTS public.idx_pavimentos_obra_ordem;
--   ALTER TABLE public.pavimentos_obra DROP COLUMN IF EXISTS ordem;
-- ============================================================================
