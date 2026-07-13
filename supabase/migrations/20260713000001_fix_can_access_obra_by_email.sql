-- ============================================================================
-- Migration: Corrige can_access_obra() para comparar por e-mail, não por id
-- Data: 2026-07-13
--
-- BUG: public.can_access_obra(), criada em 20260712_task_attachments_history.sql,
--      compara `user_profiles.id = auth.uid()` / `user_obras.user_id = auth.uid()`.
--      Só que `user_profiles.id` é gerado como gen_random_uuid() no momento em que
--      um admin cadastra o usuário PELO E-MAIL (tela Administração > Usuários),
--      antes de existir qualquer conta em auth.users — a conta real só é criada
--      pela Microsoft no 1º login SSO. Não existe trigger em auth.users que
--      reconcilie os dois ids. Resultado: `p.id = auth.uid()` nunca bate, para
--      NINGUÉM (nem admin) — a policy de anexos/histórico/storage bloqueia
--      100% dos uploads, independente de perfil ou vínculo de obra.
--
-- FIX: usar o e-mail da sessão (via auth.users, já que a função é
--      security definer e pode ler auth.users) como chave de correspondência,
--      igual ao que App.jsx já faz no client (loadUserProfile por e-mail).
--      Também passa a exigir status = 'ativo', alinhado ao portão de acesso
--      do app (aplicarSessao em App.jsx).
--
-- COMO RODAR: cole no SQL Editor do Supabase (projeto do sistema) e execute.
--             É idempotente (pode rodar mais de uma vez).
-- ============================================================================

create or replace function public.can_access_obra(p_obra text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles p
    left join public.user_obras uo on uo.user_id = p.id
    where p.status = 'ativo'
      and p.email = (select email from auth.users where id = auth.uid())
      and (p.perfil = 'admin' or uo.obra_id = p_obra)
  );
$$;

grant execute on function public.can_access_obra(text) to authenticated;

-- ============================================================================
-- Rollback (se precisar voltar à versão anterior, com o bug):
--   create or replace function public.can_access_obra(p_obra text)
--   returns boolean language sql stable security definer set search_path = public as $$
--     select
--       exists (select 1 from public.user_profiles p
--               where p.id = auth.uid() and p.perfil = 'admin')
--       or
--       exists (select 1 from public.user_obras uo
--               where uo.user_id = auth.uid() and uo.obra_id = p_obra);
--   $$;
-- ============================================================================
