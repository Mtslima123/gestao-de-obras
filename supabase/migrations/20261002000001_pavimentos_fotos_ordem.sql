-- ============================================================================
-- Migration: ordem manual dos pavimentos das Fotos (`pavimentos_fotos_obra.ordem`)
-- Data: 2026-10-02
--
-- Contexto: a lista de pavimentos das Fotos saía na ordem de cadastro (id), sem como
-- reposicionar. O modal "Pavimentos das fotos" ganhou botões de subir/descer e de
-- duplicar (a cópia entra logo abaixo do original). A ordem passa a ser guardada numa
-- coluna própria, gravada de uma vez pela função abaixo (nada fica pela metade se a
-- conexão cair no meio).
--
-- - Coluna `ordem` (inteiro): preenchida aqui com a ordem atual (por id, dentro de cada
--   obra). Linhas sem ordem (cadastradas por uma versão antiga do app) vão pro fim, na
--   ordem de cadastro: o app ordena por ordem (nulos por último) e depois por id.
-- - Função `reordenar_pavimentos_fotos(obra, nomes[])`: grava a ordem inteira da obra
--   numa transação só. SECURITY INVOKER: as policies de UPDATE da tabela continuam
--   valendo (can_access_obra e o bloqueio de aba somente-leitura). Devolve quantas linhas
--   atualizou; 0 = sem permissão (o app avisa).
--
-- Enquanto não for aplicada, o app continua funcionando: só subir/descer avisa que
-- depende desta atualização, e a cópia duplicada entra no fim da lista.
--
-- Aplicar manualmente no SQL Editor do Supabase (projeto gestao-de-obras), pelo TI.
-- Idempotente.
-- ============================================================================

ALTER TABLE public.pavimentos_fotos_obra ADD COLUMN IF NOT EXISTS ordem INTEGER;

UPDATE public.pavimentos_fotos_obra p
SET ordem = s.pos
FROM (
  SELECT id, row_number() OVER (PARTITION BY obra_id ORDER BY id) AS pos
  FROM public.pavimentos_fotos_obra
) s
WHERE p.id = s.id AND p.ordem IS NULL;

CREATE INDEX IF NOT EXISTS idx_pavimentos_fotos_obra_ordem
  ON public.pavimentos_fotos_obra (obra_id, ordem, id);

CREATE OR REPLACE FUNCTION public.reordenar_pavimentos_fotos(p_obra_id TEXT, p_nomes TEXT[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  n INTEGER;
BEGIN
  UPDATE public.pavimentos_fotos_obra p
  SET ordem = x.pos
  FROM unnest(p_nomes) WITH ORDINALITY AS x(nome, pos)
  WHERE p.obra_id = p_obra_id AND p.nome = x.nome;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.reordenar_pavimentos_fotos(TEXT, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reordenar_pavimentos_fotos(TEXT, TEXT[]) TO authenticated;
