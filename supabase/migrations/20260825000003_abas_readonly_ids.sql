-- ============================================================================
-- Migration: coluna abas_readonly_ids em user_profiles
-- Data: 2026-08-25
--
-- PEDIDO: permitir configurar, por usuário, quais abas de um módulo são
--   editáveis ou só leitura (ex: usuário edita só a aba "Fotos" de Obras, as
--   demais ficam em modo consulta) — mais granular que
--   modulos_readonly_ids, que hoje só cobre o módulo inteiro.
--
-- Mesmo formato/convenção de abas_ids: array de strings "modId.abaId"
-- (ex: "obras.fotos"). Presença na lista = aba somente leitura para esse
-- usuário; ausente/vazio = editável (mesma polaridade de
-- modulos_readonly_ids). Tipo jsonb pra bater com abas_ids (que já é jsonb
-- no banco hoje, diferente de modulos_ids/modulos_readonly_ids que são
-- text[] — confirmado por inspeção do schema real antes desta migration).
--
-- Aplicar manualmente no SQL Editor do Supabase (projeto gestao-de-obras).
-- Idempotente (ADD COLUMN IF NOT EXISTS).
-- ============================================================================

alter table public.user_profiles
  add column if not exists abas_readonly_ids jsonb not null default '[]'::jsonb;

-- ============================================================================
-- Rollback:
--   alter table public.user_profiles drop column if exists abas_readonly_ids;
-- ============================================================================
