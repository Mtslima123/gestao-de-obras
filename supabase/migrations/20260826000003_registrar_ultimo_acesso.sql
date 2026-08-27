-- ============================================================================
-- Função: registrar_ultimo_acesso — grava a coluna ultimo_acesso da própria
-- linha em user_profiles a cada login/restauração de sessão.
-- Data: 2026-08-26
--
-- Causa do bug corrigido: a coluna ultimo_acesso (exibida em Configurações
-- / Usuários) nunca era escrita em lugar nenhum do app — sempre "—". Nem
-- daria pra escrever direto via update(): as únicas policies de escrita em
-- user_profiles são profiles_admin_write (exige is_current_user_admin()),
-- então um usuário comum não tem permissão de UPDATE na própria linha por
-- policy nenhuma (confirmado por inspeção das policies reais da tabela).
--
-- Por que não alargar a policy em vez disso: profiles_admin_write é ALL
-- (INSERT/UPDATE/DELETE) — dar UPDATE geral pra usuário comum abriria
-- brecha pra alterar o próprio perfil/permissões (modulos_ids, perfil,
-- status etc.), não só ultimo_acesso. Uma função SECURITY DEFINER estreita,
-- que só sabe tocar essa coluna e só na linha do próprio chamador (via
-- auth.email()), evita abrir essa porta — mesmo padrão já usado em
-- reabrir_medicao_mensal (20260823000001).
--
-- Aplicar manualmente no SQL Editor do Supabase (projeto gestao-de-obras).
-- Idempotente (CREATE OR REPLACE).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.registrar_ultimo_acesso()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_profiles
  SET ultimo_acesso = now()
  WHERE email = auth.email();
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_ultimo_acesso() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_ultimo_acesso() TO authenticated;

-- ============================================================================
-- Rollback:
--   DROP FUNCTION IF EXISTS public.registrar_ultimo_acesso();
-- ============================================================================
