-- ============================================================================
-- Migration: módulo Mão de Obra > Efetivo (abas Previsto, Apropriação, Análise)
-- Data: 2026-10-10
--
-- Efetivo por função em QUANTIDADE DE PESSOAS (não custo). Base: pacote
-- design_handoff_mao_de_obra_efetivo (db/schema.postgres.sql), adaptado ao projeto:
--   - obra_id é TEXT (obras.id é text) e referencia obras(id);
--   - sem policy de escrita: TODA gravação passa pelas funções mo_* abaixo
--     (SECURITY DEFINER), que conferem acesso à obra, somente-leitura por aba e trava;
--   - trava no banco: previsto trancado e apropriação LANCADA recusam qualquer
--     escrita com SQLSTATE PT409 (o PostgREST devolve HTTP 409);
--   - cadastros globais (grupos, classificações, funções): só admin altera;
--   - efetivo do mês = última quinzena LANCADA (view vw_mo_efetivo_mes).
--
-- As fórmulas de negócio vivem em src/modules/maoDeObra/efetivo/regras.ts (fonte da
-- verdade). Aqui só ficam as colunas calculadas triviais (meses, trab_canteiro, ativos).
--
-- Aplicar manualmente no SQL Editor do Supabase (projeto gestao-de-obras), com
-- aprovação do TI. Idempotente: tabelas com IF NOT EXISTS, policies e triggers são
-- derrubados antes de recriar, seed só insere o que ainda não existe.
-- Rollback no final.
-- ============================================================================

-- ─── 1. Cadastros globais ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.mo_grupo (
  id    TEXT PRIMARY KEY,
  nome  TEXT NOT NULL,
  ordem INT  NOT NULL
);

CREATE TABLE IF NOT EXISTS public.mo_classificacao (
  id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mo_classificacao_nome ON public.mo_classificacao (lower(nome));

CREATE TABLE IF NOT EXISTS public.mo_funcao (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome             TEXT NOT NULL,
  grupo_id         TEXT NOT NULL REFERENCES public.mo_grupo(id),
  classificacao_id BIGINT REFERENCES public.mo_classificacao(id) ON DELETE SET NULL, -- null = própria função
  ordem            INT NOT NULL DEFAULT 0,
  ativo            BOOLEAN NOT NULL DEFAULT true, -- exclusão = soft delete (preserva histórico)
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Nome único (sem diferenciar caixa) entre as funções ativas.
CREATE UNIQUE INDEX IF NOT EXISTS ux_mo_funcao_nome_ativa ON public.mo_funcao (lower(nome)) WHERE ativo;

-- ─── 2. Dados por obra ──────────────────────────────────────────────────────

-- Término da obra (base dos "meses restantes") e trava do previsto. Tabela própria
-- em vez de colunas em `obras`: não mexe numa tabela usada pelo app inteiro.
CREATE TABLE IF NOT EXISTS public.mo_obra_config (
  obra_id           TEXT PRIMARY KEY REFERENCES public.obras(id),
  termino_obra      DATE,
  previsto_trancado BOOLEAN NOT NULL DEFAULT false,
  trancado_em       TIMESTAMPTZ,
  trancado_por      TEXT,
  destrancado_em    TIMESTAMPTZ,
  destrancado_por   TEXT
);

CREATE TABLE IF NOT EXISTS public.mo_previsto (
  obra_id   TEXT   NOT NULL REFERENCES public.obras(id),
  funcao_id BIGINT NOT NULL REFERENCES public.mo_funcao(id),
  qtd_mes   INT    NOT NULL CHECK (qtd_mes >= 0),
  inicio    DATE   NOT NULL,
  termino   DATE   NOT NULL,
  meses     INT GENERATED ALWAYS AS (
              ((extract(year from termino) - extract(year from inicio)) * 12
               + extract(month from termino) - extract(month from inicio) + 1)::int
            ) STORED,
  PRIMARY KEY (obra_id, funcao_id),
  CHECK (termino >= inicio)
);
CREATE INDEX IF NOT EXISTS idx_mo_previsto_funcao ON public.mo_previsto(funcao_id);

CREATE TABLE IF NOT EXISTS public.mo_apropriacao (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  obra_id         TEXT     NOT NULL REFERENCES public.obras(id),
  ano             SMALLINT NOT NULL,
  mes             SMALLINT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  quinzena        SMALLINT NOT NULL CHECK (quinzena IN (1, 2)),
  data_referencia DATE     NOT NULL, -- dia 01 ou 16
  status          TEXT     NOT NULL DEFAULT 'RASCUNHO' CHECK (status IN ('RASCUNHO', 'LANCADA')),
  lancada_em      TIMESTAMPTZ,
  lancada_por     TEXT,
  reaberta_em     TIMESTAMPTZ,
  reaberta_por    TEXT,
  UNIQUE (obra_id, ano, mes, quinzena)
);

CREATE TABLE IF NOT EXISTS public.mo_apropriacao_item (
  apropriacao_id      BIGINT NOT NULL REFERENCES public.mo_apropriacao(id) ON DELETE CASCADE,
  funcao_id           BIGINT NOT NULL REFERENCES public.mo_funcao(id),
  total_efetivo       INT CHECK (total_efetivo >= 0),
  trab_adm            INT CHECK (trab_adm >= 0),
  inss_seguro         INT CHECK (inss_seguro >= 0),
  ferias              INT CHECK (ferias >= 0),
  emprest_manut       INT CHECK (emprest_manut >= 0),
  destino             TEXT,
  recebido_outra_obra INT CHECK (recebido_outra_obra >= 0),
  origem              TEXT,
  -- trab. canteiro = total - ADM - INSS - férias - emprest./manut. (pode ficar negativo: a tela
  -- mostra em vermelho e o lançamento é recusado)
  trab_canteiro INT GENERATED ALWAYS AS (
    coalesce(total_efetivo, 0) - coalesce(trab_adm, 0) - coalesce(inss_seguro, 0)
    - coalesce(ferias, 0) - coalesce(emprest_manut, 0)
  ) STORED,
  -- ativos = ADM + canteiro + recebido  (= total - INSS - férias - emprest. + recebido)
  ativos INT GENERATED ALWAYS AS (
    coalesce(total_efetivo, 0) - coalesce(inss_seguro, 0) - coalesce(ferias, 0)
    - coalesce(emprest_manut, 0) + coalesce(recebido_outra_obra, 0)
  ) STORED,
  PRIMARY KEY (apropriacao_id, funcao_id)
);
CREATE INDEX IF NOT EXISTS idx_mo_apropriacao_item_funcao ON public.mo_apropriacao_item(funcao_id);

-- Efetivo do mês = ATIVOS da última quinzena LANCADA (2ª se lançada, senão a 1ª). Nunca média.
CREATE OR REPLACE VIEW public.vw_mo_efetivo_mes WITH (security_invoker = true) AS
SELECT DISTINCT ON (a.obra_id, a.ano, a.mes, i.funcao_id)
  a.obra_id, a.ano, a.mes, i.funcao_id, i.ativos AS efetivo
FROM public.mo_apropriacao a
JOIN public.mo_apropriacao_item i ON i.apropriacao_id = a.id
JOIN public.mo_funcao f ON f.id = i.funcao_id AND f.ativo
WHERE a.status = 'LANCADA'
ORDER BY a.obra_id, a.ano, a.mes, i.funcao_id, a.quinzena DESC;

-- ─── 3. Trava no banco (HTTP 409) ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mo_trg_previsto_trancado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.mo_obra_config c
    WHERE c.obra_id = coalesce(NEW.obra_id, OLD.obra_id) AND c.previsto_trancado
  ) THEN
    RAISE EXCEPTION 'Previsto trancado. Use "Editar previsto" para alterar.' USING ERRCODE = 'PT409';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_mo_previsto_trancado ON public.mo_previsto;
CREATE TRIGGER trg_mo_previsto_trancado
  BEFORE INSERT OR UPDATE OR DELETE ON public.mo_previsto
  FOR EACH ROW EXECUTE FUNCTION public.mo_trg_previsto_trancado();

CREATE OR REPLACE FUNCTION public.mo_trg_item_lancada()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.mo_apropriacao a
    WHERE a.id = coalesce(NEW.apropriacao_id, OLD.apropriacao_id) AND a.status = 'LANCADA'
  ) THEN
    RAISE EXCEPTION 'Apropriação lançada. Reabra para alterar.' USING ERRCODE = 'PT409';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_mo_item_lancada ON public.mo_apropriacao_item;
CREATE TRIGGER trg_mo_item_lancada
  BEFORE INSERT OR UPDATE OR DELETE ON public.mo_apropriacao_item
  FOR EACH ROW EXECUTE FUNCTION public.mo_trg_item_lancada();

-- Cabeçalho lançado não muda nem é apagado (só a transição LANCADA -> RASCUNHO, via reabrir).
CREATE OR REPLACE FUNCTION public.mo_trg_apropriacao_lancada()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'LANCADA' THEN
      RAISE EXCEPTION 'Apropriação lançada. Reabra para alterar.' USING ERRCODE = 'PT409';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'LANCADA' AND NEW.status = 'LANCADA' THEN
    RAISE EXCEPTION 'Apropriação lançada. Reabra para alterar.' USING ERRCODE = 'PT409';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mo_apropriacao_lancada ON public.mo_apropriacao;
CREATE TRIGGER trg_mo_apropriacao_lancada
  BEFORE UPDATE OR DELETE ON public.mo_apropriacao
  FOR EACH ROW EXECUTE FUNCTION public.mo_trg_apropriacao_lancada();

-- ─── 4. Auditoria (quem/quando) ─────────────────────────────────────────────
-- Cadastros, trava do previsto e cabeçalho da apropriação. Os itens ficam de fora de
-- propósito: cada rascunho salvo geraria dezenas de registros. Mesmo padrão e mesma
-- proteção de fn_audit_row (falha ao auditar nunca derruba a operação real).

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

DROP TRIGGER IF EXISTS trg_audit_mo ON public.mo_classificacao;
CREATE TRIGGER trg_audit_mo AFTER INSERT OR UPDATE OR DELETE ON public.mo_classificacao
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_mo();
DROP TRIGGER IF EXISTS trg_audit_mo ON public.mo_funcao;
CREATE TRIGGER trg_audit_mo AFTER INSERT OR UPDATE OR DELETE ON public.mo_funcao
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_mo();
DROP TRIGGER IF EXISTS trg_audit_mo ON public.mo_obra_config;
CREATE TRIGGER trg_audit_mo AFTER INSERT OR UPDATE OR DELETE ON public.mo_obra_config
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_mo();
DROP TRIGGER IF EXISTS trg_audit_mo ON public.mo_apropriacao;
CREATE TRIGGER trg_audit_mo AFTER INSERT OR UPDATE OR DELETE ON public.mo_apropriacao
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_mo();

-- ─── 5. RLS: só leitura direta; escrita exclusivamente pelas funções mo_* ──────

ALTER TABLE public.mo_grupo            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mo_classificacao    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mo_funcao           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mo_obra_config      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mo_previsto         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mo_apropriacao      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mo_apropriacao_item ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mo_grupo_select         ON public.mo_grupo;
DROP POLICY IF EXISTS mo_classificacao_select ON public.mo_classificacao;
DROP POLICY IF EXISTS mo_funcao_select        ON public.mo_funcao;
DROP POLICY IF EXISTS mo_obra_config_select   ON public.mo_obra_config;
DROP POLICY IF EXISTS mo_previsto_select      ON public.mo_previsto;
DROP POLICY IF EXISTS mo_apropriacao_select   ON public.mo_apropriacao;
DROP POLICY IF EXISTS mo_apropriacao_item_select ON public.mo_apropriacao_item;

CREATE POLICY mo_grupo_select         ON public.mo_grupo         FOR SELECT TO authenticated USING (public.has_app_access());
CREATE POLICY mo_classificacao_select ON public.mo_classificacao FOR SELECT TO authenticated USING (public.has_app_access());
CREATE POLICY mo_funcao_select        ON public.mo_funcao        FOR SELECT TO authenticated USING (public.has_app_access());
CREATE POLICY mo_obra_config_select   ON public.mo_obra_config   FOR SELECT TO authenticated USING (public.can_access_obra(obra_id));
CREATE POLICY mo_previsto_select      ON public.mo_previsto      FOR SELECT TO authenticated USING (public.can_access_obra(obra_id));
CREATE POLICY mo_apropriacao_select   ON public.mo_apropriacao   FOR SELECT TO authenticated USING (public.can_access_obra(obra_id));
CREATE POLICY mo_apropriacao_item_select ON public.mo_apropriacao_item FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.mo_apropriacao a
    WHERE a.id = mo_apropriacao_item.apropriacao_id AND public.can_access_obra(a.obra_id)
  ));

-- Defesa extra: sem privilégio de escrita direta nem para anon.
REVOKE ALL ON public.mo_grupo, public.mo_classificacao, public.mo_funcao, public.mo_obra_config,
              public.mo_previsto, public.mo_apropriacao, public.mo_apropriacao_item FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.mo_grupo, public.mo_classificacao, public.mo_funcao,
              public.mo_obra_config, public.mo_previsto, public.mo_apropriacao,
              public.mo_apropriacao_item FROM authenticated;
GRANT SELECT ON public.vw_mo_efetivo_mes TO authenticated;
REVOKE ALL ON public.vw_mo_efetivo_mes FROM anon;

-- ─── 6. Seed (sem duplicar se rodar de novo) ────────────────────────────────

INSERT INTO public.mo_grupo (id, nome, ordem) VALUES
  ('ADM_TEC',      'Administrativo e técnico', 1),
  ('LIDERANCA',    'Liderança de campo',       2),
  ('OFICIAL',      'Oficial',                  3),
  ('MEIO_OFICIAL', 'Meio-oficial',             4),
  ('SERVENTE',     'Servente',                 5),
  ('EQUIPAMENTOS', 'Operação de equipamentos', 6),
  ('APOIO',        'Apoio',                    7)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.mo_classificacao (nome)
SELECT v.nome FROM (VALUES ('Carpinteiro'), ('Pedreiro'), ('Bombeiro')) AS v(nome)
WHERE NOT EXISTS (SELECT 1 FROM public.mo_classificacao c WHERE lower(c.nome) = lower(v.nome));

-- (nome, grupo, classificação, ordem de exibição): mesma lista e ordem do seed.ts do handoff.
INSERT INTO public.mo_funcao (nome, grupo_id, classificacao_id, ordem)
SELECT v.nome, v.grupo_id, c.id, v.ordem
FROM (VALUES
  ('Almoxarife',                       'ADM_TEC',      NULL,          1),
  ('Aux. Almoxarife',                  'ADM_TEC',      NULL,          2),
  ('Apontador',                        'ADM_TEC',      NULL,          3),
  ('Aux. Apontador',                   'ADM_TEC',      NULL,          4),
  ('Aux. Técnico',                     'ADM_TEC',      NULL,          5),
  ('Engenheiro',                       'ADM_TEC',      NULL,          6),
  ('Trainee',                          'ADM_TEC',      NULL,          7),
  ('Técnico de Segurança do Trabalho', 'ADM_TEC',      NULL,          8),
  ('Estagiário (Seg. do Trabalho)',    'ADM_TEC',      NULL,          9),
  ('Estagiário (Engenharia)',          'ADM_TEC',      NULL,         10),
  ('Supervisor',                       'LIDERANCA',    NULL,         11),
  ('Enc. de Carpinteiro',              'LIDERANCA',    NULL,         12),
  ('Enc. de Eletricista',              'LIDERANCA',    NULL,         13),
  ('Enc. de Manutenção C',             'LIDERANCA',    NULL,         14),
  ('Enc. de Montador',                 'LIDERANCA',    NULL,         15),
  ('Enc. de Pedreiro',                 'LIDERANCA',    NULL,         16),
  ('Enc. de Servente',                 'LIDERANCA',    NULL,         17),
  ('Enc. de Pintor',                   'LIDERANCA',    NULL,         18),
  ('Mestre de Obras',                  'LIDERANCA',    NULL,         19),
  ('Impermeabilizador',                'OFICIAL',      NULL,         20),
  ('Bombeiro',                         'OFICIAL',      'Bombeiro',   21),
  ('Carpinteiro',                      'OFICIAL',      'Carpinteiro',22),
  ('Eletricista',                      'OFICIAL',      NULL,         23),
  ('Carpinteiro de Esquadria',         'OFICIAL',      NULL,         24),
  ('Pedreiro',                         'OFICIAL',      'Pedreiro',   25),
  ('Soldador',                         'OFICIAL',      NULL,         26),
  ('1/2 Of. de Bombeiro',              'MEIO_OFICIAL', 'Bombeiro',   27),
  ('1/2 Of. Carpinteiro',              'MEIO_OFICIAL', 'Carpinteiro',28),
  ('1/2 Of. Pedreiro',                 'MEIO_OFICIAL', 'Pedreiro',   29),
  ('Servente',                         'SERVENTE',     NULL,         30),
  ('Guincheiro',                       'EQUIPAMENTOS', NULL,         31),
  ('Op. de Bobcat',                    'EQUIPAMENTOS', NULL,         32),
  ('Op. de Grua',                      'EQUIPAMENTOS', NULL,         33),
  ('Sinaleiro',                        'EQUIPAMENTOS', NULL,         34),
  ('Motorista',                        'APOIO',        NULL,         35),
  ('Vigia',                            'APOIO',        NULL,         36),
  ('Porteiro',                         'APOIO',        NULL,         37),
  ('Jovem Aprendiz',                   'APOIO',        NULL,         38)
) AS v(nome, grupo_id, classificacao, ordem)
LEFT JOIN public.mo_classificacao c ON lower(c.nome) = lower(v.classificacao)
WHERE NOT EXISTS (SELECT 1 FROM public.mo_funcao f WHERE f.ativo AND lower(f.nome) = lower(v.nome));

-- ============================================================================
-- Rollback (apaga todos os dados do módulo):
--   DROP VIEW     IF EXISTS public.vw_mo_efetivo_mes;
--   DROP TABLE    IF EXISTS public.mo_apropriacao_item, public.mo_apropriacao, public.mo_previsto,
--                           public.mo_obra_config, public.mo_funcao, public.mo_classificacao,
--                           public.mo_grupo CASCADE;
--   DROP FUNCTION IF EXISTS public.fn_audit_mo(), public.mo_trg_previsto_trancado(),
--                           public.mo_trg_item_lancada(), public.mo_trg_apropriacao_lancada();
-- ============================================================================
