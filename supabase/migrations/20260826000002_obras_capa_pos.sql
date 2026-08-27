-- ============================================================================
-- Migration: coluna "capaPos" em obras
-- Data: 2026-08-26
--
-- PEDIDO: permitir ajustar a posição da foto de capa dentro do quadro (a
--   capa usa object-fit: cover, então parte da imagem some por trás das
--   bordas — o usuário quer poder arrastar pra escolher qual parte fica
--   visível, em vez de ficar preso no recorte central automático).
--
-- Guarda o deslocamento como object-position em porcentagem: {"x":50,"y":50}
-- é o centro (comportamento atual, sem mudança visual pra quem nunca ajustar).
-- Nome em camelCase pra bater com a convenção já usada na tabela (imageUrl,
-- avancoFisico, dataFimObra — confirmado por inspeção do schema real).
--
-- Aplicar manualmente no SQL Editor do Supabase (projeto gestao-de-obras).
-- Idempotente (ADD COLUMN IF NOT EXISTS).
-- ============================================================================

alter table public.obras
  add column if not exists "capaPos" jsonb not null default '{"x":50,"y":50}'::jsonb;

-- ============================================================================
-- Rollback:
--   alter table public.obras drop column if exists "capaPos";
-- ============================================================================
