-- ============================================================================
-- Migration: orcamentos_own / orcamento_itens_own passam a exigir a obra ATUAL
-- Data: 2026-08-25
--
-- BUG reportado: usuário comum com só 1 obra liberada via user_obras conseguia
--   ver orçamento de outra obra na tela de Orçamentos.
--
-- CAUSA RAIZ: o client (orcamentos.service.js) buscava a tabela inteira sem
--   filtrar por obra (corrigido em paralelo no frontend, ver
--   src/modules/financeiro/orcamentos.service.js — agora usa .in('obra_id',
--   obrasPermitidas(userProfile))). Mas o RLS sozinho já tinha uma lacuna
--   estrutural: a policy `orcamentos_own` (FOR ALL, USING auth.uid() =
--   user_id) libera SELECT/UPDATE/DELETE só por autoria, sem checar se o
--   dono ainda tem a obra liberada HOJE em user_obras. Se o admin desvincula
--   a obra de um usuário depois de um orçamento já existir com esse
--   user_id, `orcamentos_own` continua liberando — é a mesma classe de
--   "policy antiga não acompanhou a regra nova" já corrigida antes neste
--   projeto (ver 20260606000011, 20260713000001, 20260719000002). Mesmo
--   problema em `orcamento_itens_own`. Sem esse fix, o filtro do client é só
--   cosmético: um usuário com DevTools ainda puxaria a linha direto da API.
--
-- FIX: substitui as policies `_own` (SELECT+UPDATE+DELETE juntos em FOR ALL)
--   por policies dedicadas por operação, exigindo também
--   public.user_has_obra(obra_id) em UPDATE/DELETE. SELECT por autoria não é
--   recriado — `orcamentos_assigned_select` (user_has_obra) e
--   `orcamentos_admin_select` (is_current_user_admin) já cobrem os dois
--   casos legítimos de leitura; ficaria redundante exigir user_has_obra ali
--   também. INSERT mantém a mesma condição de hoje (auth.uid() = user_id),
--   sem mudança de comportamento — não foi pedido e telas de criação hoje só
--   abrem pra admin.
--
-- ACHADO ADJACENTE, não corrigido nesta migration (fora do que foi pedido):
--   o WITH CHECK de INSERT (igual ao que já existia) não exige user_has_obra
--   nem admin — tecnicamente qualquer autenticado pode inserir um orçamento
--   pra uma obra que não é dele, contanto que informe o próprio user_id.
--   Recomendo fechar isso numa migration futura, trocando o WITH CHECK do
--   INSERT para `auth.uid() = user_id and (public.user_has_obra(obra_id) or
--   public.is_current_user_admin())`.
--
-- Aplicar manualmente no SQL Editor do Supabase (projeto gestao-de-obras).
-- Idempotente (DROP POLICY IF EXISTS antes de cada CREATE).
-- ============================================================================

drop policy if exists orcamentos_own on public.orcamentos;

create policy orcamentos_own_insert on public.orcamentos
  as permissive for insert to authenticated
  with check (auth.uid() = user_id);

create policy orcamentos_own_update on public.orcamentos
  as permissive for update to authenticated
  using (auth.uid() = user_id and public.user_has_obra(obra_id))
  with check (auth.uid() = user_id and public.user_has_obra(obra_id));

create policy orcamentos_own_delete on public.orcamentos
  as permissive for delete to authenticated
  using (auth.uid() = user_id and public.user_has_obra(obra_id));

drop policy if exists orcamento_itens_own on public.orcamento_itens;

create policy orcamento_itens_own_insert on public.orcamento_itens
  as permissive for insert to authenticated
  with check (exists (
    select 1 from public.orcamentos o
    where o.id = orcamento_itens.orcamento_id and o.user_id = auth.uid()
  ));

create policy orcamento_itens_own_update on public.orcamento_itens
  as permissive for update to authenticated
  using (exists (
    select 1 from public.orcamentos o
    where o.id = orcamento_itens.orcamento_id and o.user_id = auth.uid()
      and public.user_has_obra(o.obra_id)
  ))
  with check (exists (
    select 1 from public.orcamentos o
    where o.id = orcamento_itens.orcamento_id and o.user_id = auth.uid()
      and public.user_has_obra(o.obra_id)
  ));

create policy orcamento_itens_own_delete on public.orcamento_itens
  as permissive for delete to authenticated
  using (exists (
    select 1 from public.orcamentos o
    where o.id = orcamento_itens.orcamento_id and o.user_id = auth.uid()
      and public.user_has_obra(o.obra_id)
  ));

-- ============================================================================
-- Rollback:
--   drop policy if exists orcamentos_own_insert on public.orcamentos;
--   drop policy if exists orcamentos_own_update on public.orcamentos;
--   drop policy if exists orcamentos_own_delete on public.orcamentos;
--   drop policy if exists orcamento_itens_own_insert on public.orcamento_itens;
--   drop policy if exists orcamento_itens_own_update on public.orcamento_itens;
--   drop policy if exists orcamento_itens_own_delete on public.orcamento_itens;
--   create policy orcamentos_own on public.orcamentos as permissive for all
--     to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
--   create policy orcamento_itens_own on public.orcamento_itens as permissive for all
--     to authenticated using (exists (select 1 from public.orcamentos o
--       where o.id = orcamento_itens.orcamento_id and o.user_id = auth.uid()));
-- ============================================================================
