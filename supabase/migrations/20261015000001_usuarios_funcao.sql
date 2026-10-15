-- ============================================================================
-- Migration: "Função" do usuário (Apontador, Engenheiro...) em Administração > Usuários
-- Data: 2026-10-15. Depende de 20260917000002 (is_current_user_admin) e de user_profiles.
--
-- A função é só um RÓTULO para identificar e separar os usuários na lista: não muda módulos,
-- abas nem obras (isso continua sendo marcado à mão no cadastro). As funções existentes saem de
-- um catálogo que o administrador mantém na própria tela de usuários (criar, renomear, excluir).
--   - tabela funcoes_usuario (nome único sem diferenciar caixa nem espaços nas pontas);
--   - coluna user_profiles.funcao_id, opcional (NULL = sem função) e com ON DELETE SET NULL: excluir
--     uma função do catálogo deixa os usuários dela sem função, não os apaga nem barra a exclusão.
--     Tem que aceitar NULL: o gatilho do 1º login (handle_new_user_default_role) insere em
--     user_profiles com lista fixa de colunas e não conhece esta;
--   - segurança: uma única regra, só administrador (is_current_user_admin) lê e escreve. Quem edita
--     o usuário é sempre admin (profiles_admin_write), então o usuário comum nunca grava a própria
--     função. Sem nenhuma regra para anon, e REVOKE explícito;
--   - auditoria: user_profiles já grava a linha inteira a cada mudança (fn_audit_row), então a
--     troca de função de um usuário aparece sozinha. As mudanças no catálogo em si não passam por
--     gatilho; o app registra no log de auditoria (origem Web).
--
-- Aplicar manualmente no SQL Editor do Supabase (projeto gestao-de-obras), com aprovação do TI.
-- Selecione tudo (Ctrl+A) antes de rodar. Idempotente. Rollback no final.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.funcoes_usuario (
  id         BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome       TEXT        NOT NULL CHECK (btrim(nome) <> ''),
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_funcoes_usuario_nome ON public.funcoes_usuario (lower(btrim(nome)));

ALTER TABLE public.funcoes_usuario ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS funcoes_usuario_admin ON public.funcoes_usuario;
CREATE POLICY funcoes_usuario_admin ON public.funcoes_usuario FOR ALL TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());
REVOKE ALL ON public.funcoes_usuario FROM anon;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS funcao_id BIGINT REFERENCES public.funcoes_usuario(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_user_profiles_funcao ON public.user_profiles (funcao_id);

-- ============================================================================
-- Rollback (remove a coluna antes da tabela; as funções atribuídas se perdem):
--   ALTER TABLE public.user_profiles DROP COLUMN IF EXISTS funcao_id;
--   DROP TABLE IF EXISTS public.funcoes_usuario;
-- ============================================================================
