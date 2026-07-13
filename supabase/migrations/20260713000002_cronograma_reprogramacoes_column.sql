-- ============================================================================
-- Migration: Coluna reprogramacoes na tabela cronogramas
-- Data: 2026-07-13
--
-- OBJETIVO: suportar a feature "Reprogramação" no Cronograma — um retrato
--           (snapshot) do cronograma, salvo manualmente pelo usuário logo
--           antes de reprogramar, para comparar depois na Curva Física
--           ("reprogramado real x reprogramação do mês anterior").
--
-- Mesmo formato/uso da coluna `baselines` já existente (array jsonb de
-- { id, nome, criadaEm, etapas }), guardado na mesma linha por obra_id.
-- Aditivo e seguro: herda as RLS policies já existentes em `cronogramas`,
-- não precisa de policy nova.
--
-- COMO RODAR: cole no SQL Editor do Supabase (projeto gestao-de-obras) e
--             execute. É idempotente (pode rodar mais de uma vez).
-- ============================================================================

alter table public.cronogramas
  add column if not exists reprogramacoes jsonb not null default '[]'::jsonb;

-- ============================================================================
-- Rollback (se precisar desfazer):
--   alter table public.cronogramas drop column if exists reprogramacoes;
-- ============================================================================
