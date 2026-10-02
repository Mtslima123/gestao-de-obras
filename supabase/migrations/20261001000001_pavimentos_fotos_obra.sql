-- ============================================================================
-- Migration: cadastro de pavimentos próprio da aba Fotos (`pavimentos_fotos_obra`)
-- Data: 2026-10-01
--
-- Contexto: o campo Pavimento do upload/edição de foto era texto livre (combobox
-- alimentado por `pavimentos_obra`, compartilhada com o Cronograma). Cada pessoa
-- digitava de um jeito e o filtro "Todos os pavimentos" ficava poluído. Agora a
-- aba Fotos tem cadastro próprio e o campo vira lista suspensa só com os
-- pavimentos cadastrados aqui. Lista independente da do Cronograma.
--
-- Acesso (mesmo padrão de `fotos_obra`):
--   - dono da obra / can_access_obra: leitura e escrita
--   - atribuído à obra (user_has_obra): leitura
--   - escrita bloqueada se a aba obras.fotos estiver em somente-leitura
--     (is_aba_readonly) — não usa is_module_readonly('cronograma'), que
--     bloquearia quem só tem a aba Fotos
--   - DELETE só admin (is_current_user_admin), como em fotos_obra
--
-- Backfill: copia os pavimentos distintos já usados em `fotos_obra`, na ordem da
-- primeira foto de cada um, para as fotos atuais não ficarem fora do cadastro.
--
-- Pré-requisitos: funções can_access_obra, user_has_obra, has_app_access,
-- is_aba_readonly e is_current_user_admin já existentes.
--
-- Aplicar manualmente no SQL Editor do Supabase (projeto gestao-de-obras),
-- pelo TI. Idempotente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.pavimentos_fotos_obra (
  id         BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  obra_id    TEXT        NOT NULL,
  nome       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (obra_id, nome)
);

ALTER TABLE public.pavimentos_fotos_obra ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pavimentos_fotos_obra_own" ON public.pavimentos_fotos_obra;
CREATE POLICY "pavimentos_fotos_obra_own" ON public.pavimentos_fotos_obra
  FOR ALL
  USING (public.has_app_access() AND EXISTS (
    SELECT 1 FROM public.obras
    WHERE obras.id = pavimentos_fotos_obra.obra_id AND obras.user_id = auth.uid()
  ))
  WITH CHECK (public.has_app_access() AND EXISTS (
    SELECT 1 FROM public.obras
    WHERE obras.id = pavimentos_fotos_obra.obra_id AND obras.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "pavimentos_fotos_obra_write_access" ON public.pavimentos_fotos_obra;
CREATE POLICY "pavimentos_fotos_obra_write_access" ON public.pavimentos_fotos_obra
  FOR ALL
  TO authenticated
  USING (public.can_access_obra(obra_id))
  WITH CHECK (public.can_access_obra(obra_id));

DROP POLICY IF EXISTS "pavimentos_fotos_obra_assigned_select" ON public.pavimentos_fotos_obra;
CREATE POLICY "pavimentos_fotos_obra_assigned_select" ON public.pavimentos_fotos_obra
  FOR SELECT
  USING (public.user_has_obra(obra_id));

DROP POLICY IF EXISTS "pavimentos_fotos_obra_aba_ro_ins" ON public.pavimentos_fotos_obra;
CREATE POLICY "pavimentos_fotos_obra_aba_ro_ins" ON public.pavimentos_fotos_obra AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (NOT public.is_aba_readonly('obras', 'fotos'));

DROP POLICY IF EXISTS "pavimentos_fotos_obra_aba_ro_upd" ON public.pavimentos_fotos_obra;
CREATE POLICY "pavimentos_fotos_obra_aba_ro_upd" ON public.pavimentos_fotos_obra AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (NOT public.is_aba_readonly('obras', 'fotos'))
  WITH CHECK (NOT public.is_aba_readonly('obras', 'fotos'));

DROP POLICY IF EXISTS "pavimentos_fotos_obra_aba_ro_del" ON public.pavimentos_fotos_obra;
CREATE POLICY "pavimentos_fotos_obra_aba_ro_del" ON public.pavimentos_fotos_obra AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (NOT public.is_aba_readonly('obras', 'fotos'));

DROP POLICY IF EXISTS "pavimentos_fotos_obra_admin_only_delete" ON public.pavimentos_fotos_obra;
CREATE POLICY "pavimentos_fotos_obra_admin_only_delete" ON public.pavimentos_fotos_obra AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (public.is_current_user_admin());

-- Backfill: pavimentos já usados nas fotos de cada obra, na ordem da primeira foto.
INSERT INTO public.pavimentos_fotos_obra (obra_id, nome)
SELECT obra_id, pavimento
FROM (
  SELECT obra_id, btrim(pavimento) AS pavimento, MIN(created_at) AS primeira
  FROM public.fotos_obra
  WHERE pavimento IS NOT NULL AND btrim(pavimento) <> ''
  GROUP BY obra_id, btrim(pavimento)
) t
ORDER BY primeira, pavimento
ON CONFLICT (obra_id, nome) DO NOTHING;

-- ============================================================================
-- Rollback:
--   DROP TABLE IF EXISTS public.pavimentos_fotos_obra;
-- ============================================================================
