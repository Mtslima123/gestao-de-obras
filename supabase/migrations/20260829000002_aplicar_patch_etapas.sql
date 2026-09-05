-- ============================================================================
-- Função: aplicar_patch_etapas — save incremental do Cronograma (Lista/Gantt).
-- Data: 2026-08-29
--
-- Problema que resolve: mesmo caso da 20260829000001, agora no save principal.
-- cronogramas.etapas é um JSONB único com a árvore toda (497 kB / 1139 etapas na
-- obra OB-0442, medido em produção). salvarCronograma() subia o array inteiro a
-- cada commit — editar uma célula custava o mesmo tráfego que reconstruir o
-- cronograma. Com o RTT de ~217 ms até o sa-east-1, cada save levava segundos.
--
-- O cliente passa a mandar só as etapas cujo JSON mudou. Dois modos:
--
--   p_ordem IS NULL  -> nada entrou, saiu ou mudou de lugar. Substituição in-place
--                       pelo id, ordem original preservada.
--   p_ordem NOT NULL -> o array final é exatamente essa lista de ids, montada a
--                       partir de p_upserts e do que já existe. Remoção é implícita:
--                       id fora da lista deixa de existir.
--
-- Determinismo: no segundo modo o array resultante depende só do patch, sem estado
-- oculto. Se algum id da ordem não tiver origem (nem no upsert nem no banco), a
-- função aborta em vez de gravar um cronograma com tarefa faltando — é o tipo de
-- falha que só apareceria semanas depois.
--
-- SECURITY INVOKER de propósito: SELECT ... FOR UPDATE e UPDATE continuam passando
-- pelas policies do chamador. A função não amplia permissão, só corta tráfego.
--
-- Lock otimista igual ao do cliente: recebe o updated_at lido; se não bater, devolve
-- NULL sem escrever e o cliente mostra o aviso de conflito.
--
-- Aplicar manualmente no SQL Editor do Supabase (projeto gestao-de-obras).
-- Idempotente (CREATE OR REPLACE).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.aplicar_patch_etapas(
  p_obra_id             text,
  p_upserts             jsonb        DEFAULT '[]'::jsonb,  -- etapas completas que mudaram
  p_ordem               jsonb        DEFAULT NULL,         -- array de ids, ou NULL
  p_expected_updated_at timestamptz  DEFAULT NULL          -- NULL = sem checagem
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_now      timestamptz := now();
  v_etapas   jsonb;
  v_atual    timestamptz;
  v_faltando text;
BEGIN
  SELECT etapas, updated_at INTO v_etapas, v_atual
  FROM cronogramas
  WHERE obra_id = p_obra_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cronograma não encontrado para a obra %', p_obra_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF p_expected_updated_at IS NOT NULL AND v_atual IS DISTINCT FROM p_expected_updated_at THEN
    RETURN NULL;
  END IF;

  IF p_ordem IS NULL THEN
    -- Sem mudança estrutural: troca no lugar quem veio no upsert.
    WITH atuais AS (
      SELECT ord, el->>'id' AS id, el
      FROM jsonb_array_elements(COALESCE(v_etapas, '[]'::jsonb)) WITH ORDINALITY AS t(el, ord)
    ),
    ups AS (
      SELECT el->>'id' AS id, el
      FROM jsonb_array_elements(COALESCE(p_upserts, '[]'::jsonb)) AS u(el)
    )
    SELECT COALESCE(jsonb_agg(COALESCE(u.el, a.el) ORDER BY a.ord), '[]'::jsonb)
    INTO v_etapas
    FROM atuais a LEFT JOIN ups u ON u.id = a.id;

  ELSE
    -- Ordem explícita: o array final é exatamente p_ordem.
    WITH atuais AS (
      SELECT el->>'id' AS id, el
      FROM jsonb_array_elements(COALESCE(v_etapas, '[]'::jsonb)) AS t(el)
    ),
    ups AS (
      SELECT el->>'id' AS id, el
      FROM jsonb_array_elements(COALESCE(p_upserts, '[]'::jsonb)) AS u(el)
    ),
    alvo AS (
      SELECT o.ord, o.id, COALESCE(u.el, a.el) AS el
      FROM jsonb_array_elements_text(p_ordem) WITH ORDINALITY AS o(id, ord)
      LEFT JOIN ups    u ON u.id = o.id
      LEFT JOIN atuais a ON a.id = o.id
    )
    SELECT string_agg(id, ', ' ORDER BY ord) INTO v_faltando
    FROM alvo WHERE el IS NULL;

    IF v_faltando IS NOT NULL THEN
      RAISE EXCEPTION 'patch incompleto: etapas sem origem (%). Nada foi gravado.', v_faltando
        USING ERRCODE = 'data_exception';
    END IF;

    WITH atuais AS (
      SELECT el->>'id' AS id, el
      FROM jsonb_array_elements(COALESCE(v_etapas, '[]'::jsonb)) AS t(el)
    ),
    ups AS (
      SELECT el->>'id' AS id, el
      FROM jsonb_array_elements(COALESCE(p_upserts, '[]'::jsonb)) AS u(el)
    )
    SELECT COALESCE(jsonb_agg(COALESCE(u.el, a.el) ORDER BY o.ord), '[]'::jsonb)
    INTO v_etapas
    FROM jsonb_array_elements_text(p_ordem) WITH ORDINALITY AS o(id, ord)
    LEFT JOIN ups    u ON u.id = o.id
    LEFT JOIN atuais a ON a.id = o.id;
  END IF;

  UPDATE cronogramas
  SET etapas = v_etapas, updated_at = v_now
  WHERE obra_id = p_obra_id;

  RETURN v_now;
END;
$$;

REVOKE ALL ON FUNCTION public.aplicar_patch_etapas(text, jsonb, jsonb, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aplicar_patch_etapas(text, jsonb, jsonb, timestamptz) TO authenticated;

-- ============================================================================
-- Rollback:
--   DROP FUNCTION IF EXISTS public.aplicar_patch_etapas(text, jsonb, jsonb, timestamptz);
-- O cliente tem fallback para o save do array inteiro quando a função não existe
-- (PGRST202), então derrubar a função volta ao comportamento anterior sem quebrar
-- o save.
-- ============================================================================
