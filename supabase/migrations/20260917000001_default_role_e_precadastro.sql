-- Perfil no primeiro login, com menor privilégio (item 2 da separação SSO/perfil).
-- Independente do "portão" do grupo do Entra (item 1, migration separada) — este arquivo
-- é seguro de aplicar agora, não depende do groups claim existir.
--
-- Hoje, um e-mail sem user_profiles cadastrado antes não consegue usar o app de jeito
-- nenhum (App.jsx: autorizado = perfil?.status === 'ativo', perfil vem null). Isso passa
-- a criar automaticamente um perfil de MENOR PRIVILÉGIO no primeiro login (perfil
-- 'usuario', só o módulo Dashboard liberado, nenhuma obra vinculada) — a pessoa aparece
-- na tela de Usuários com um papel real, pronta pro admin promover, em vez de precisar
-- ser cadastrada manualmente ANTES de conseguir logar.
--
-- Cuidado deliberado: modulos_ids = '{}' (array vazio) é interpretado pelo FRONTEND como
-- "sem restrição = todos os módulos liberados" (ver transformar() em Usuarios.jsx e
-- moduloLiberado() em utils/permissions.js) — INSERIR vazio aqui daria acesso total por
-- engano. Por isso o default é ARRAY['dashboard'], não '{}'.

-- ─── Pré-cadastro por e-mail (item 3, opcional) ───────────────────────────────
-- Permite ao admin definir o papel de alguém ANTES do primeiro login (mesma ideia do
-- migrate_role_by_email do Controle de Patrimônio). Se existir uma linha aqui pro e-mail
-- que está entrando, o trigger abaixo usa esses valores em vez do default de viewer, e
-- consome (apaga) a linha depois de aplicar.
CREATE TABLE IF NOT EXISTS public.pre_cadastro_papeis (
  email        text PRIMARY KEY,
  nome         text,
  perfil       text NOT NULL DEFAULT 'usuario' CHECK (perfil IN ('admin', 'usuario')),
  modulos_ids  text[] NOT NULL DEFAULT ARRAY['dashboard'],
  abas_ids     jsonb NOT NULL DEFAULT '[]'::jsonb,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  criado_por   uuid REFERENCES auth.users(id)
);

ALTER TABLE public.pre_cadastro_papeis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pre_cadastro_admin_only ON public.pre_cadastro_papeis;
CREATE POLICY pre_cadastro_admin_only ON public.pre_cadastro_papeis
  FOR ALL USING (is_current_user_admin()) WITH CHECK (is_current_user_admin());

-- ─── Trigger: cria o profile no primeiro login (auth.users), se ainda não existir ─────
CREATE OR REPLACE FUNCTION public.handle_new_user_default_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pre record;
BEGIN
  -- Já tem profile pra esse e-mail (cadastro manual prévio, ou login duplicado do
  -- GoTrue) — não mexe, "se ele já tem papel, não mexe".
  IF EXISTS (SELECT 1 FROM public.user_profiles WHERE email = NEW.email) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO pre FROM public.pre_cadastro_papeis WHERE email = NEW.email;

  INSERT INTO public.user_profiles (nome, email, perfil, status, modulos_ids, abas_ids)
  VALUES (
    COALESCE(pre.nome, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.email,
    COALESCE(pre.perfil, 'usuario'),
    'ativo',
    COALESCE(pre.modulos_ids, ARRAY['dashboard']),
    COALESCE(pre.abas_ids, '[]'::jsonb)
  );

  IF pre.email IS NOT NULL THEN
    DELETE FROM public.pre_cadastro_papeis WHERE email = NEW.email;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_default_role ON auth.users;
CREATE TRIGGER on_auth_user_created_default_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_default_role();
