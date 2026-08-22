-- ============================================================================
-- Fix: policy "medicoes_mensais_no_edit_fechada" bloqueava o próprio fechamento
-- (rascunho -> fechada), não só a edição de uma medição já fechada.
-- Data: 2026-08-21
--
-- Causa: a policy foi criada só com USING (status = 'rascunho'), sem WITH CHECK.
-- Quando uma policy de UPDATE não define WITH CHECK, o Postgres reaplica a
-- mesma expressão do USING sobre a linha NOVA (pós-update). Como o fechamento
-- muda status de 'rascunho' para 'fechada', a linha resultante deixava de
-- satisfazer "status = 'rascunho'" e o UPDATE era rejeitado pelo RLS — exatamente
-- o botão "Confirmar fechamento" da tela de Medição Mensal.
--
-- Depende de: 20260819000001_medicoes_mensais.sql
-- Aplicar manualmente no SQL Editor do Supabase (projeto gestao-de-obras).
-- Idempotente.
-- ============================================================================

DROP POLICY IF EXISTS "medicoes_mensais_no_edit_fechada" ON public.medicoes_mensais;

-- USING continua exigindo que a linha já esteja em rascunho para poder ser
-- tocada por um UPDATE comum — isso já impede qualquer edição futura de uma
-- linha que tenha virado 'fechada' (ela deixa de satisfazer o USING). O
-- WITH CHECK explícito (true) é o que faltava: sem ele, o resultado do UPDATE
-- também precisava satisfazer "status = 'rascunho'", o que bloqueava a própria
-- transição rascunho -> fechada.
CREATE POLICY "medicoes_mensais_no_edit_fechada" ON public.medicoes_mensais AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (status = 'rascunho')
  WITH CHECK (true);

-- ============================================================================
-- Rollback:
--   DROP POLICY IF EXISTS "medicoes_mensais_no_edit_fechada" ON public.medicoes_mensais;
--   CREATE POLICY "medicoes_mensais_no_edit_fechada" ON public.medicoes_mensais AS RESTRICTIVE
--     FOR UPDATE TO authenticated
--     USING (status = 'rascunho');
-- ============================================================================
