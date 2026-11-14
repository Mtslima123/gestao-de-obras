-- ============================================================================
-- Migration: anotações da medição (`medicoes_mensais.anotacoes`)
-- Data: 2026-11-03
--
-- Contexto: a Medição Mensal só tinha a observação por tarefa (guardada dentro de
-- `itens[].observacao`). O botão "Anotações" abre uma janela com um texto livre que vale
-- para a medição inteira do mês (obra + mês), e o menu Exportar deixa escolher se ele sai
-- no Excel e no PDF.
--
-- A anotação só é editável enquanto a medição está aberta (rascunho): depois de fechada
-- ela fica só para leitura, como o % medido, e para mudar a medição é reaberta. Por isso
-- não precisa de função nova: a policy RESTRICTIVE medicoes_mensais_no_edit_fechada já
-- trava UPDATE de medição fechada. Reabrir, fechar, aprovar e "Atualizar valores" não
-- escrevem esta coluna, então ela sobrevive a todos eles.
--
-- Enquanto não for aplicada, o app continua funcionando: o botão abre, mas o Salvar avisa
-- que depende desta atualização (e nada é gravado).
--
-- Depende de: 20260819000001_medicoes_mensais.sql.
-- Aplicar manualmente no SQL Editor do Supabase (projeto gestao-de-obras), pelo TI.
-- Idempotente.
-- ============================================================================

ALTER TABLE public.medicoes_mensais
  ADD COLUMN IF NOT EXISTS anotacoes TEXT;

COMMENT ON COLUMN public.medicoes_mensais.anotacoes IS
  'Anotação livre da medição do mês (texto único, até 4000 caracteres na tela).
  Editável só com a medição em rascunho. NULL ou vazio = sem anotação.';

-- RLS: nada a fazer. Coluna nova herda as policies da tabela.

-- ============================================================================
-- Rollback:
--   ALTER TABLE public.medicoes_mensais DROP COLUMN IF EXISTS anotacoes;
-- ============================================================================
