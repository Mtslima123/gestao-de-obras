-- ============================================================================
-- Migration: reforço de RLS para a nova permissão "aba somente leitura"
-- Data: 2026-08-25
--
-- CONTEXTO: modulos_readonly_ids (módulo inteiro em modo consulta) já tem
--   reforço no banco via is_module_readonly() + policies RESTRICTIVE em
--   obras/fotos_obra/orcamentos/orcamento_itens/cronogramas (migration
--   20260712_rls_readonly_enforcement.sql). A nova coluna
--   abas_readonly_ids (ver 20260825000003) precisa do mesmo tipo de
--   reforço, senão esconder o botão no frontend não impede gravação via
--   API direta — mesma classe de lacuna já documentada e fechada antes
--   neste projeto pro caso de módulo inteiro.
--
-- ESCOPO: só a aba "obras.fotos" por enquanto — é a única aba, dentro do
--   detalhe de obra, com ações de escrita reais hoje (upload/editar/excluir
--   foto). As abas "visao" e "cronograma" dentro de Obras são só leitura
--   (quem edita cronograma de fato é o módulo Cronograma separado, com seu
--   próprio controle de somente-leitura por MÓDULO, id 'cronograma' —
--   diferente do id de ABA 'cronograma' dentro do módulo 'obras'). Se no
--   futuro outra aba ganhar ação de escrita própria, replicar o mesmo
--   padrão (nova policy RESTRICTIVE citando is_aba_readonly('modulo','aba')
--   na tabela correspondente).
--
-- is_aba_readonly() casa o usuário por auth.email() = user_profiles.email
-- (não auth.uid() = id), seguindo o mesmo padrão de is_module_readonly/
-- user_has_obra/can_access_obra — usar auth.uid() aqui não funcionaria pra
-- ninguém (user_profiles.id é gerado antes de existir conta SSO; mesmo tipo
-- de bug já corrigido em 20260606000011 e 20260713000001).
--
-- As 3 policies novas (fotos_aba_ro_ins/upd/del) são RESTRICTIVE e aditivas:
-- somam por AND com as PERMISSIVE existentes (fotos_obra_own,
-- fotos_obra_write_access) e por AND com a RESTRICTIVE de módulo já
-- existente (fotos_ro_*) — não precisam alterar nenhuma policy hoje.
--
-- Aplicar manualmente no SQL Editor do Supabase (projeto gestao-de-obras),
-- DEPOIS de 20260825000003 (a coluna abas_readonly_ids precisa existir).
-- Idempotente (CREATE OR REPLACE FUNCTION + DROP POLICY IF EXISTS).
-- ============================================================================

create or replace function public.is_aba_readonly(p_module text, p_aba text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_module_readonly(p_module)
    or exists (
      select 1 from public.user_profiles up
      where up.email = auth.email()
        and up.perfil <> 'admin'
        and coalesce(up.abas_readonly_ids, '[]'::jsonb) ? (p_module || '.' || p_aba)
    );
$$;
grant execute on function public.is_aba_readonly(text, text) to authenticated;

drop policy if exists fotos_aba_ro_ins on public.fotos_obra;
create policy fotos_aba_ro_ins on public.fotos_obra
  as restrictive for insert to authenticated
  with check (not public.is_aba_readonly('obras', 'fotos'));

drop policy if exists fotos_aba_ro_upd on public.fotos_obra;
create policy fotos_aba_ro_upd on public.fotos_obra
  as restrictive for update to authenticated
  using (not public.is_aba_readonly('obras', 'fotos'))
  with check (not public.is_aba_readonly('obras', 'fotos'));

drop policy if exists fotos_aba_ro_del on public.fotos_obra;
create policy fotos_aba_ro_del on public.fotos_obra
  as restrictive for delete to authenticated
  using (not public.is_aba_readonly('obras', 'fotos'));

-- ============================================================================
-- Rollback:
--   drop policy if exists fotos_aba_ro_ins on public.fotos_obra;
--   drop policy if exists fotos_aba_ro_upd on public.fotos_obra;
--   drop policy if exists fotos_aba_ro_del on public.fotos_obra;
--   drop function if exists public.is_aba_readonly(text, text);
-- ============================================================================
