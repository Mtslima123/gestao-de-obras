-- ============================================================================
-- Migration: coluna `feriados jsonb` sincronizada por obra em `cronogramas` (A4)
-- Data: 2026-07-19
--
-- Antes os feriados / dias não trabalhados ficavam só no localStorage do navegador
-- (cada usuário via um calendário diferente na mesma obra). Passam a viver no
-- cronograma da obra, sincronizados entre usuários.
--
-- Formato do valor (igual ao usado no código, cronogramaDateUtils.setWorkCal):
--   {"dias": [{"data": "2026-12-25", "descricao": "Natal"}], "sabadoUtil": false}
--
-- Aplicada manualmente no SQL Editor do Supabase. Idempotente.
-- ============================================================================

alter table public.cronogramas
  add column if not exists feriados jsonb
  not null default '{"dias": [], "sabadoUtil": false}'::jsonb;

-- ============================================================================
-- Rollback:
--   alter table public.cronogramas drop column if exists feriados;
-- ============================================================================
