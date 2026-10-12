-- ============================================================================
-- Migration: fechar mês de apropriação em Mão de Obra > Efetivo
-- Data: 2026-10-12. Depende de 20261010000001 a 20261010000004.
--
-- Hoje um mês que já tem apropriação fica sempre liberado para edição, e mo_mes_desabilitar
-- recusa esses meses. Passa a existir o "mês fechado": o administrador fecha um mês que já
-- tem apropriação e ele vira só consulta (nada é criado, editado, lançado, reaberto, copiado
-- ou apagado nele) até o administrador reabrir o mês.
--
-- Mudanças:
--   - tabela mo_mes_fechado (RLS só leitura; escrita só pelas funções abaixo);
--   - mo_mes_fechar / mo_mes_reabrir (só admin); fechar exige que o mês já tenha apropriação
--     (mês vazio se resolve removendo a habilitação, com mo_mes_desabilitar);
--   - gatilho em mo_apropriacao e mo_apropriacao_item que recusa qualquer escrita em mês
--     fechado. Fica no banco, e não em cada função, para cobrir salvar, lançar, reabrir e
--     copiar da 1ª sem reescrever nenhuma delas. Sem usuário logado (SQL Editor, manutenção
--     do TI) o gatilho não bloqueia;
--   - mo_efetivo_estado devolve "mesesFechados";
--   - fn_audit_mo ganha o ramo da nova tabela (fechar/reabrir ficam na auditoria).
--
-- Aplicar manualmente no SQL Editor do Supabase (projeto gestao-de-obras), com aprovação do
-- TI. Selecione tudo (Ctrl+A) antes de rodar. Idempotente. Rollback no final.
-- ============================================================================

-- ─── 1. Tabela ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.mo_mes_fechado (
  obra_id      TEXT        NOT NULL REFERENCES public.obras(id),
  ano          SMALLINT    NOT NULL,
  mes          SMALLINT    NOT NULL CHECK (mes BETWEEN 1 AND 12),
  fechado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  fechado_por  TEXT,
  PRIMARY KEY (obra_id, ano, mes)
);

ALTER TABLE public.mo_mes_fechado ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mo_mes_fechado_select ON public.mo_mes_fechado;
CREATE POLICY mo_mes_fechado_select ON public.mo_mes_fechado FOR SELECT TO authenticated
  USING (public.can_access_obra(obra_id));

REVOKE ALL ON public.mo_mes_fechado FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.mo_mes_fechado FROM authenticated;

-- ─── 2. Auditoria: ramo da nova tabela em fn_audit_mo ───────────────────────
-- Mesma função da migration 20261010000004; só acrescenta o ELSIF de mo_mes_fechado (sem ele
-- cairia no texto de "Classificação").

CREATE OR REPLACE FUNCTION public.fn_audit_mo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_nome text; v_perfil text; v_new jsonb; v_old jsonb;
  v_acao text; v_desc text; v_crit text := 'media'; v_ent text;
BEGIN
  BEGIN
    v_new := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
    v_old := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
    v_acao := CASE TG_OP WHEN 'INSERT' THEN 'criou' WHEN 'UPDATE' THEN 'editou' ELSE 'excluiu' END;
    v_ent  := coalesce(v_new->>'id', v_old->>'id', v_new->>'obra_id', v_old->>'obra_id');

    IF TG_TABLE_NAME = 'mo_apropriacao' THEN
      v_desc := format('Apropriação %s/%s, %sª quinzena', coalesce(v_new->>'mes', v_old->>'mes'), coalesce(v_new->>'ano', v_old->>'ano'), coalesce(v_new->>'quinzena', v_old->>'quinzena'));
      IF TG_OP = 'UPDATE' AND v_old->>'status' = 'RASCUNHO' AND v_new->>'status' = 'LANCADA' THEN
        v_desc := 'Lançou a ' || v_desc; v_crit := 'alta';
      ELSIF TG_OP = 'UPDATE' AND v_old->>'status' = 'LANCADA' AND v_new->>'status' = 'RASCUNHO' THEN
        v_desc := 'Reabriu a ' || v_desc; v_crit := 'alta';
      ELSE
        v_desc := initcap(v_acao) || ' a ' || v_desc;
      END IF;
    ELSIF TG_TABLE_NAME = 'mo_obra_config' THEN
      IF TG_OP = 'UPDATE' AND (v_old->>'previsto_trancado')::boolean IS DISTINCT FROM (v_new->>'previsto_trancado')::boolean THEN
        v_desc := CASE WHEN (v_new->>'previsto_trancado')::boolean THEN 'Salvou e trancou o previsto de efetivo' ELSE 'Destrancou o previsto de efetivo' END;
        v_crit := 'alta';
      ELSE
        v_desc := 'Configuração de efetivo da obra';
      END IF;
    ELSIF TG_TABLE_NAME = 'mo_funcao' THEN
      v_desc := format('Função "%s" (cadastro de efetivo)', coalesce(v_new->>'nome', v_old->>'nome'));
      IF TG_OP = 'UPDATE' AND (v_old->>'ativo')::boolean AND NOT (v_new->>'ativo')::boolean THEN
        v_acao := 'excluiu'; v_desc := 'Excluiu a função "' || (v_new->>'nome') || '" do cadastro de efetivo'; v_crit := 'alta';
      END IF;
    ELSIF TG_TABLE_NAME = 'mo_mes_habilitado' THEN
      v_desc := format(CASE TG_OP WHEN 'DELETE' THEN 'Removeu a habilitação do mês %s/%s para apropriação de efetivo'
                                  ELSE 'Habilitou o mês %s/%s para apropriação de efetivo' END,
                       lpad(coalesce(v_new->>'mes', v_old->>'mes'), 2, '0'), coalesce(v_new->>'ano', v_old->>'ano'));
      v_crit := 'alta';
    ELSIF TG_TABLE_NAME = 'mo_mes_fechado' THEN
      v_desc := format(CASE TG_OP WHEN 'DELETE' THEN 'Reabriu o mês %s/%s para apropriação de efetivo'
                                  ELSE 'Fechou o mês %s/%s para apropriação de efetivo' END,
                       lpad(coalesce(v_new->>'mes', v_old->>'mes'), 2, '0'), coalesce(v_new->>'ano', v_old->>'ano'));
      v_crit := 'alta';
    ELSE
      v_desc := format('Classificação "%s" (cadastro de efetivo)', coalesce(v_new->>'nome', v_old->>'nome'));
    END IF;

    SELECT nome, perfil INTO v_nome, v_perfil FROM public.user_profiles WHERE email = auth.email() LIMIT 1;

    INSERT INTO public.audit_logs
      (user_id, user_nome, user_perfil, obra_id, modulo, acao, entidade_tipo, entidade_id,
       descricao, valor_anterior, valor_novo, criticidade, origem)
    VALUES (
      auth.uid(), v_nome, v_perfil,
      coalesce(v_new->>'obra_id', v_old->>'obra_id'),
      'mao-de-obra', v_acao, TG_TABLE_NAME, v_ent,
      v_desc, v_old, v_new, v_crit, 'DB-trigger'
    );
  EXCEPTION WHEN OTHERS THEN
    NULL; -- auditoria nunca derruba a operação real
  END;
  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_mo ON public.mo_mes_fechado;
CREATE TRIGGER trg_audit_mo AFTER INSERT OR UPDATE OR DELETE ON public.mo_mes_fechado
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_mo();

-- ─── 3. Fechar / reabrir o mês (só admin) ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.mo_mes_fechar(p_obra text, p_ano int, p_mes int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.mo_exigir_admin();
  PERFORM public.mo_validar_periodo(p_ano, p_mes, 1);
  IF NOT public.can_access_obra(p_obra) THEN
    RAISE EXCEPTION 'Sem acesso a esta obra.' USING ERRCODE = 'PT403';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mo_apropriacao a WHERE a.obra_id = p_obra AND a.ano = p_ano AND a.mes = p_mes) THEN
    RAISE EXCEPTION 'Esse mês ainda não tem apropriação para fechar.' USING ERRCODE = 'PT409';
  END IF;
  INSERT INTO public.mo_mes_fechado (obra_id, ano, mes, fechado_por)
  VALUES (p_obra, p_ano, p_mes, public.mo_usuario_nome())
  ON CONFLICT (obra_id, ano, mes) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.mo_mes_reabrir(p_obra text, p_ano int, p_mes int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.mo_exigir_admin();
  PERFORM public.mo_validar_periodo(p_ano, p_mes, 1);
  IF NOT public.can_access_obra(p_obra) THEN
    RAISE EXCEPTION 'Sem acesso a esta obra.' USING ERRCODE = 'PT403';
  END IF;
  DELETE FROM public.mo_mes_fechado WHERE obra_id = p_obra AND ano = p_ano AND mes = p_mes;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mês fechado não encontrado.' USING ERRCODE = 'PT404';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.mo_mes_fechar(text, int, int)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mo_mes_reabrir(text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mo_mes_fechar(text, int, int)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.mo_mes_reabrir(text, int, int) TO authenticated;

-- ─── 4. Gatilho: mês fechado não aceita escrita ─────────────────────────────
-- Cobre mo_apropriacao (cabeçalho: criar, lançar, reabrir, apagar) e mo_apropriacao_item
-- (linhas: salvar, copiar da 1ª, lançar). PT409 faz a tela recarregar o estado.

CREATE OR REPLACE FUNCTION public.fn_mo_bloquear_mes_fechado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb; v_obra text; v_ano int; v_mes int;
BEGIN
  IF auth.uid() IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  v := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  IF TG_TABLE_NAME = 'mo_apropriacao' THEN
    v_obra := v->>'obra_id'; v_ano := (v->>'ano')::int; v_mes := (v->>'mes')::int;
  ELSE
    SELECT a.obra_id, a.ano, a.mes INTO v_obra, v_ano, v_mes
    FROM public.mo_apropriacao a WHERE a.id = (v->>'apropriacao_id')::bigint;
  END IF;

  IF v_obra IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.mo_mes_fechado f WHERE f.obra_id = v_obra AND f.ano = v_ano AND f.mes = v_mes
  ) THEN
    RAISE EXCEPTION 'Mês fechado para apropriação. Peça ao administrador para reabrir o mês.' USING ERRCODE = 'PT409';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_mo_bloquear_mes_fechado() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_mo_bloquear_mes_fechado ON public.mo_apropriacao;
CREATE TRIGGER trg_mo_bloquear_mes_fechado BEFORE INSERT OR UPDATE OR DELETE ON public.mo_apropriacao
  FOR EACH ROW EXECUTE FUNCTION public.fn_mo_bloquear_mes_fechado();

DROP TRIGGER IF EXISTS trg_mo_bloquear_mes_fechado ON public.mo_apropriacao_item;
CREATE TRIGGER trg_mo_bloquear_mes_fechado BEFORE INSERT OR UPDATE OR DELETE ON public.mo_apropriacao_item
  FOR EACH ROW EXECUTE FUNCTION public.fn_mo_bloquear_mes_fechado();

-- ─── 5. mo_efetivo_estado: devolve os meses fechados ────────────────────────
-- Mesma função da migration 20261010000004; só acrescenta a chave "mesesFechados".

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
-- Rollback (volta ao comportamento da migration 20261010000004):
--   DROP TRIGGER  IF EXISTS trg_mo_bloquear_mes_fechado ON public.mo_apropriacao_item;
--   DROP TRIGGER  IF EXISTS trg_mo_bloquear_mes_fechado ON public.mo_apropriacao;
--   DROP FUNCTION IF EXISTS public.fn_mo_bloquear_mes_fechado();
--   DROP FUNCTION IF EXISTS public.mo_mes_reabrir(text, int, int);
--   DROP FUNCTION IF EXISTS public.mo_mes_fechar(text, int, int);
--   -- reaplicar mo_efetivo_estado de 20261010000004 (sem "mesesFechados")
--   -- reaplicar fn_audit_mo de 20261010000004 (sem o ramo de mo_mes_fechado)
--   DROP TABLE    IF EXISTS public.mo_mes_fechado;
-- ============================================================================
