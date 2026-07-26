-- ============================================================================
-- Migration: tabela própria `pavimentos_obra` (substitui o uso provisório da
-- coluna `cronogramas.feriados` para guardar os nomes de pavimento salvos)
-- Data: 2026-07-26
--
-- Contexto: o modal "Inserção automática de pavimentos" (Cronograma > Gantt/Lista)
-- salva os nomes de pavimento já usados numa obra, pra sugerir de novo da próxima
-- vez (chips clicáveis), sem precisar redigitar. Como criar coluna/tabela nova
-- exige aprovação do TI, essa lista ficou temporariamente guardada dentro de
-- `cronogramas.feriados.pavimentosSalvos` (mesma coluna jsonb dos feriados) —
-- funciona, mas mistura dois conceitos sem relação na mesma coluna.
--
-- Esta migration cria a tabela própria. Depois de aplicada e confirmada, o
-- código passa a ler/escrever aqui em vez de `cronogramas.feriados.pavimentosSalvos`
-- (a chave `pavimentosSalvos` dentro de `feriados` pode ser removida depois,
-- não precisa de migração de dados — os nomes já digitados continuam
-- disponíveis nas tarefas que já foram criadas com eles).
--
-- Aplicar manualmente no SQL Editor do Supabase (projeto gestao-de-obras).
-- Idempotente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.pavimentos_obra (
  id         BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  obra_id    TEXT        NOT NULL,
  nome       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (obra_id, nome)
);

ALTER TABLE public.pavimentos_obra ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão de acesso já usado em `cronogramas`/`fotos_obra`: dono da obra,
-- usuário com acesso liberado (can_access_obra), leitura para quem foi
-- atribuído à obra (user_has_obra), e bloqueio de escrita se o módulo
-- "cronograma" estiver em modo somente-leitura para o usuário.

CREATE POLICY "pavimentos_obra_own" ON public.pavimentos_obra
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.obras
    WHERE obras.id = pavimentos_obra.obra_id AND obras.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.obras
    WHERE obras.id = pavimentos_obra.obra_id AND obras.user_id = auth.uid()
  ));

CREATE POLICY "pavimentos_obra_write_access" ON public.pavimentos_obra
  FOR ALL
  TO authenticated
  USING (can_access_obra(obra_id))
  WITH CHECK (can_access_obra(obra_id));

CREATE POLICY "pavimentos_obra_assigned_select" ON public.pavimentos_obra
  FOR SELECT
  USING (user_has_obra(obra_id));

CREATE POLICY "pavimentos_obra_ro_ins" ON public.pavimentos_obra AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (NOT is_module_readonly('cronograma'));

CREATE POLICY "pavimentos_obra_ro_upd" ON public.pavimentos_obra AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (NOT is_module_readonly('cronograma'))
  WITH CHECK (NOT is_module_readonly('cronograma'));

CREATE POLICY "pavimentos_obra_ro_del" ON public.pavimentos_obra AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (NOT is_module_readonly('cronograma'));

-- ============================================================================
-- Rollback:
--   DROP TABLE IF EXISTS public.pavimentos_obra;
-- ============================================================================
