-- Acesso por obra: permite que usuários comuns LEIAM as obras (e dados
-- relacionados) às quais foram autorizados via user_obras.
--
-- Problema: as políticas de RLS existentes liberavam apenas o dono (owner) ou o
-- admin, ignorando user_obras. Resultado: um usuário comum não enxergava
-- nenhuma obra, mesmo tendo obras atribuídas pelo admin.
--
-- Estas políticas são ADITIVAS (permissivas): somam-se por OR às políticas
-- *_own já existentes. Dono e admin continuam com acesso total; o usuário comum
-- passa a LER o que lhe foi atribuído.

-- Função auxiliar: a obra está atribuída ao usuário atual em user_obras?
-- SECURITY DEFINER para não esbarrar no RLS de user_obras/user_profiles,
-- mesmo padrão de is_current_user_admin().
create or replace function public.user_has_obra(p_obra_id text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from user_obras uo
    join user_profiles up on up.id = uo.user_id
    where up.email = auth.email()
      and uo.obra_id = p_obra_id
  )
$$;

-- Obras atribuídas
create policy obras_assigned_select on public.obras
  for select using (user_has_obra(id));

-- Orçamentos das obras atribuídas
create policy orcamentos_assigned_select on public.orcamentos
  for select using (user_has_obra(obra_id));

-- Itens de orçamento das obras atribuídas (via orçamento pai)
create policy orcamento_itens_assigned_select on public.orcamento_itens
  for select using (
    exists (
      select 1 from public.orcamentos o
      where o.id = orcamento_itens.orcamento_id
        and user_has_obra(o.obra_id)
    )
  );

-- Cronogramas das obras atribuídas
create policy cronogramas_assigned_select on public.cronogramas
  for select using (user_has_obra(obra_id));

-- Fotos das obras atribuídas
create policy fotos_obra_assigned_select on public.fotos_obra
  for select using (user_has_obra(obra_id));
