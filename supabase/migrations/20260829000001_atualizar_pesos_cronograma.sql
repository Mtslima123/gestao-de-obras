-- ============================================================================
-- Função: atualizar_pesos_cronograma — aplica a distribuição de pesos do modal
-- "Distribuir pesos" (Orçamento × Cronograma) sem trafegar o cronograma inteiro.
-- Data: 2026-08-29
--
-- Problema que resolve: cronogramas.etapas é um JSONB único com a árvore toda.
-- Salvar a distribuição de pesos mudava três campos escalares (fator_peso,
-- peso_travado e peso_unidade) mas subia o array inteiro de volta — 497 kB na
-- obra OB-0442 (1139 etapas), medido em produção. Com o RTT de ~217 ms até o
-- sa-east-1 mais o upload, o botão ficava em "Salvando…" por 5 a 10 segundos.
-- Nenhum trigger nem policy pesada envolvida (verificado: cronogramas não tem
-- trigger, e as policies são chamadas de função sobre uma tabela de 7 linhas);
-- o custo era puramente o payload de subida.
--
-- Com esta função o cliente manda só os ids que mudaram — poucas centenas de
-- bytes — e o array é reescrito dentro do banco.
--
-- SECURITY INVOKER de propósito: o SELECT ... FOR UPDATE e o UPDATE continuam
-- passando pelas policies do chamador (cronogramas_write_access / cron_ro_upd),
-- então a função não amplia permissão nenhuma. É só um atalho de tráfego.
--
-- Lock otimista: recebe o updated_at que o cliente leu. Se não bater, devolve
-- NULL sem escrever — mesma semântica do .eq('updated_at', expected) que o
-- cliente usava, e o cliente mostra o toast de "alterado em outra tela".
--
-- Aplicar manualmente no SQL Editor do Supabase (projeto gestao-de-obras).
-- Idempotente (CREATE OR REPLACE).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.atualizar_pesos_cronograma(
  p_obra_id             text,
  p_pesos               jsonb        DEFAULT '{}'::jsonb,  -- { "<etapa_id>": <numero> }
  p_travas              jsonb        DEFAULT '{}'::jsonb,  -- { "<etapa_id>": true|false }
  p_grupo_id            text         DEFAULT NULL,         -- etapa que recebe peso_unidade
  p_unidade             text         DEFAULT NULL,
  p_expected_updated_at timestamptz  DEFAULT NULL          -- NULL = sem checagem
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_now    timestamptz := now();
  v_etapas jsonb;
  v_atual  timestamptz;
BEGIN
  SELECT etapas, updated_at INTO v_etapas, v_atual
  FROM cronogramas
  WHERE obra_id = p_obra_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cronograma não encontrado para a obra %', p_obra_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Outra tela salvou entre a leitura e o save: não sobrescreve.
  IF p_expected_updated_at IS NOT NULL AND v_atual IS DISTINCT FROM p_expected_updated_at THEN
    RETURN NULL;
  END IF;

  WITH itens AS (
    SELECT ord, el
    FROM jsonb_array_elements(COALESCE(v_etapas, '[]'::jsonb)) WITH ORDINALITY AS t(el, ord)
  ),
  com_peso AS (
    SELECT ord,
           CASE
             -- Folha 100% concluída tem peso travado; grupo fica de fora dessa regra
             -- porque o avanco dele é derivado da média dos filhos (recomputeHierarchy).
             WHEN p_pesos ? (el->>'id')
                  AND NOT (COALESCE((el->>'isGroup')::boolean, false) = false
                           AND COALESCE((el->>'avanco')::numeric, 0) >= 100)
               THEN jsonb_set(el, '{fator_peso}',
                      to_jsonb(GREATEST(COALESCE((p_pesos->>(el->>'id'))::numeric, 0), 0)))
             ELSE el
           END AS el
    FROM itens
  ),
  com_trava AS (
    SELECT ord,
           CASE
             WHEN NOT (p_travas ? (el->>'id'))            THEN el
             WHEN COALESCE((p_travas->>(el->>'id'))::boolean, false)
               THEN jsonb_set(el, '{peso_travado}', 'true'::jsonb)
             -- Destravar remove a chave em vez de gravar false, igual ao cliente.
             ELSE el - 'peso_travado'
           END AS el
    FROM com_peso
  ),
  com_unidade AS (
    SELECT ord,
           CASE
             WHEN p_grupo_id IS NOT NULL AND el->>'id' = p_grupo_id
               THEN jsonb_set(el, '{peso_unidade}',
                      CASE WHEN COALESCE(p_unidade, '') = ''
                           THEN 'null'::jsonb
                           ELSE to_jsonb(p_unidade) END)
             ELSE el
           END AS el
    FROM com_trava
  )
  SELECT COALESCE(jsonb_agg(el ORDER BY ord), '[]'::jsonb) INTO v_etapas FROM com_unidade;

  UPDATE cronogramas
  SET etapas = v_etapas, updated_at = v_now
  WHERE obra_id = p_obra_id;

  RETURN v_now;
END;
$$;

REVOKE ALL ON FUNCTION public.atualizar_pesos_cronograma(text, jsonb, jsonb, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_pesos_cronograma(text, jsonb, jsonb, text, text, timestamptz) TO authenticated;

-- ============================================================================
-- Rollback:
--   DROP FUNCTION IF EXISTS public.atualizar_pesos_cronograma(text, jsonb, jsonb, text, text, timestamptz);
-- O cliente tem fallback para o UPDATE do array inteiro quando a função não
-- existe (PGRST202), então derrubar a função volta ao comportamento anterior
-- sem quebrar o save.
-- ============================================================================
