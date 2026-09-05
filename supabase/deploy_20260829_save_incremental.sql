-- ============================================================================
-- DEPLOY 2026-08-29 — Save incremental do Cronograma (gestao-de-obras)
--
-- Cria duas funções que cortam o tráfego dos saves do cronograma. Hoje qualquer
-- save sobe a coluna cronogramas.etapas inteira: 497 kB nas 1139 etapas da obra
-- OB-0442. Com o RTT de ~217 ms até o sa-east-1, o usuário espera de 5 a 10
-- segundos para gravar uma alteração de poucos bytes.
--
--   1. atualizar_pesos_cronograma — modal "Distribuir pesos" (Orçamento × Cronograma)
--   2. aplicar_patch_etapas       — save da Lista/Gantt
--
-- Ambas são SECURITY INVOKER: o SELECT ... FOR UPDATE e o UPDATE continuam
-- passando pelas policies do chamador (cronogramas_write_access / cron_ro_upd).
-- Nenhuma amplia permissão, nenhuma toca em schema, nenhuma altera dado existente
-- no momento do deploy — só passam a existir para o app chamar.
--
-- Como rodar: SQL Editor do Supabase, projeto gestao-de-obras
-- (eejbtdtzbdivmfdcidoa), com o script inteiro de uma vez. Idempotente
-- (CREATE OR REPLACE): pode ser reexecutado sem efeito colateral.
--
-- Antes do deploy o app funciona normalmente pelo caminho antigo (o cliente trata
-- PGRST202 como "função ainda não existe" e cai no save completo). Depois do
-- deploy o caminho rápido passa a ser usado sozinho, sem release do front.
--
-- Rollback no rodapé.
-- ============================================================================

-- ############################################################################
-- ARQUIVO: 20260829000001_atualizar_pesos_cronograma.sql
-- ############################################################################

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


-- ############################################################################
-- ARQUIVO: 20260829000002_aplicar_patch_etapas.sql
-- ############################################################################

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


-- ============================================================================
-- VERIFICAÇÃO PÓS-DEPLOY (somente leitura — não altera nada)
-- As duas linhas devem aparecer com seguranca = 'INVOKER' e o GRANT para
-- authenticated. Se vier vazio, o CREATE não passou.
-- ============================================================================

SELECT p.proname AS funcao,
       CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS seguranca,
       pg_get_function_identity_arguments(p.oid) AS assinatura,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_pode_executar,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_pode_executar
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('atualizar_pesos_cronograma', 'aplicar_patch_etapas')
ORDER BY p.proname;

-- ============================================================================
-- ROLLBACK (se precisar voltar atrás)
-- O cliente detecta a ausência das funções (PGRST202) e volta sozinho ao save
-- completo — lento, mas funcionando. Não precisa de release do front.
-- ============================================================================
--
-- DROP FUNCTION IF EXISTS public.atualizar_pesos_cronograma(text, jsonb, jsonb, text, text, timestamptz);
-- DROP FUNCTION IF EXISTS public.aplicar_patch_etapas(text, jsonb, jsonb, timestamptz);
