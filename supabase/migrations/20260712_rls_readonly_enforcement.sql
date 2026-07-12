-- ============================================================================
-- Migration: enforcement de "somente leitura" no servidor (RLS)
-- Data: 2026-07-12
--
-- Problema: a flag `modulos_readonly_ids` (user_profiles) só é respeitada no
-- frontend. Um usuário marcado como somente-leitura ainda consegue gravar via
-- API direta, porque as policies de escrita liberam por dono/vínculo.
--
-- Solução: função is_module_readonly(modulo) + políticas RESTRICTIVE apenas em
-- INSERT/UPDATE/DELETE das tabelas de cada módulo. RESTRICTIVE é combinada com
-- AND às policies permissivas existentes, então a escrita passa a exigir
-- "dono/vínculo E não-somente-leitura". SELECT não é afetado (leitura continua).
--
-- Casa o usuário por auth.email() = user_profiles.email (padrão de user_has_obra),
-- por causa da inconsistência conhecida entre user_profiles.id e auth.uid().
-- Admin nunca é somente-leitura.
--
-- Módulos (ids reais de src/config/modulos.js): obras, orcamentos, cronograma.
-- Mapeamento: obras/fotos_obra -> 'obras'; orcamentos/orcamento_itens ->
-- 'orcamentos'; cronogramas -> 'cronograma'.
--
-- Idempotente. Rollback no final.
-- ============================================================================

create or replace function public.is_module_readonly(p_module text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles up
    where up.email = auth.email()
      and up.perfil <> 'admin'
      and p_module = any (coalesce(up.modulos_readonly_ids, '{}'::text[]))
  );
$$;
grant execute on function public.is_module_readonly(text) to authenticated;

-- ── obras (módulo 'obras') ───────────────────────────────────────────────────
drop policy if exists obras_ro_ins on public.obras;
create policy obras_ro_ins on public.obras as restrictive for insert to authenticated
  with check (not public.is_module_readonly('obras'));
drop policy if exists obras_ro_upd on public.obras;
create policy obras_ro_upd on public.obras as restrictive for update to authenticated
  using (not public.is_module_readonly('obras')) with check (not public.is_module_readonly('obras'));
drop policy if exists obras_ro_del on public.obras;
create policy obras_ro_del on public.obras as restrictive for delete to authenticated
  using (not public.is_module_readonly('obras'));

-- ── fotos_obra (módulo 'obras') ──────────────────────────────────────────────
drop policy if exists fotos_ro_ins on public.fotos_obra;
create policy fotos_ro_ins on public.fotos_obra as restrictive for insert to authenticated
  with check (not public.is_module_readonly('obras'));
drop policy if exists fotos_ro_upd on public.fotos_obra;
create policy fotos_ro_upd on public.fotos_obra as restrictive for update to authenticated
  using (not public.is_module_readonly('obras')) with check (not public.is_module_readonly('obras'));
drop policy if exists fotos_ro_del on public.fotos_obra;
create policy fotos_ro_del on public.fotos_obra as restrictive for delete to authenticated
  using (not public.is_module_readonly('obras'));

-- ── orcamentos (módulo 'orcamentos') ─────────────────────────────────────────
drop policy if exists orc_ro_ins on public.orcamentos;
create policy orc_ro_ins on public.orcamentos as restrictive for insert to authenticated
  with check (not public.is_module_readonly('orcamentos'));
drop policy if exists orc_ro_upd on public.orcamentos;
create policy orc_ro_upd on public.orcamentos as restrictive for update to authenticated
  using (not public.is_module_readonly('orcamentos')) with check (not public.is_module_readonly('orcamentos'));
drop policy if exists orc_ro_del on public.orcamentos;
create policy orc_ro_del on public.orcamentos as restrictive for delete to authenticated
  using (not public.is_module_readonly('orcamentos'));

-- ── orcamento_itens (módulo 'orcamentos') ────────────────────────────────────
drop policy if exists orci_ro_ins on public.orcamento_itens;
create policy orci_ro_ins on public.orcamento_itens as restrictive for insert to authenticated
  with check (not public.is_module_readonly('orcamentos'));
drop policy if exists orci_ro_upd on public.orcamento_itens;
create policy orci_ro_upd on public.orcamento_itens as restrictive for update to authenticated
  using (not public.is_module_readonly('orcamentos')) with check (not public.is_module_readonly('orcamentos'));
drop policy if exists orci_ro_del on public.orcamento_itens;
create policy orci_ro_del on public.orcamento_itens as restrictive for delete to authenticated
  using (not public.is_module_readonly('orcamentos'));

-- ── cronogramas (módulo 'cronograma') ────────────────────────────────────────
drop policy if exists cron_ro_ins on public.cronogramas;
create policy cron_ro_ins on public.cronogramas as restrictive for insert to authenticated
  with check (not public.is_module_readonly('cronograma'));
drop policy if exists cron_ro_upd on public.cronogramas;
create policy cron_ro_upd on public.cronogramas as restrictive for update to authenticated
  using (not public.is_module_readonly('cronograma')) with check (not public.is_module_readonly('cronograma'));
drop policy if exists cron_ro_del on public.cronogramas;
create policy cron_ro_del on public.cronogramas as restrictive for delete to authenticated
  using (not public.is_module_readonly('cronograma'));

-- ============================================================================
-- Rollback:
--   drop policy if exists obras_ro_ins  on public.obras;
--   drop policy if exists obras_ro_upd  on public.obras;
--   drop policy if exists obras_ro_del  on public.obras;
--   drop policy if exists fotos_ro_ins  on public.fotos_obra;
--   drop policy if exists fotos_ro_upd  on public.fotos_obra;
--   drop policy if exists fotos_ro_del  on public.fotos_obra;
--   drop policy if exists orc_ro_ins    on public.orcamentos;
--   drop policy if exists orc_ro_upd    on public.orcamentos;
--   drop policy if exists orc_ro_del    on public.orcamentos;
--   drop policy if exists orci_ro_ins   on public.orcamento_itens;
--   drop policy if exists orci_ro_upd   on public.orcamento_itens;
--   drop policy if exists orci_ro_del   on public.orcamento_itens;
--   drop policy if exists cron_ro_ins   on public.cronogramas;
--   drop policy if exists cron_ro_upd   on public.cronogramas;
--   drop policy if exists cron_ro_del   on public.cronogramas;
--   drop function if exists public.is_module_readonly(text);
-- ============================================================================
