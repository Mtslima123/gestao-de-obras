-- Corrige brecha real: o gatilho de perfil padrão criava um perfil ATIVO pra QUALQUER
-- login SSO bem-sucedido, sem checar se a pessoa está no grupo GESTAOOBRAS. Como o Azure
-- (tenant Free, sem "Assignment required") não bloqueia ninguém no login, e o App.jsx só
-- olha user_profiles.status === 'ativo' (nunca o grupo), qualquer conta Microsoft
-- corporativa que conseguisse fazer SSO ganhava acesso "viewer" automático — furando o
-- portão do grupo (has_app_access() só protege dados via RLS, não a entrada no app).
--
-- Caso real: usuária fora do grupo GESTAOOBRAS conseguiu logar, ganhou perfil ativo
-- automático e viu o Dashboard, mesmo sem pertencer ao grupo.
--
-- Agora o gatilho confere o mesmo GUID do grupo (f9e6ce01-e343-4b73-99f0-b238a6dbab9a)
-- direto em auth.identities ANTES de criar qualquer perfil — se a pessoa não está no
-- grupo, nenhum profile é criado (o app já nega acesso a quem não tem profile nenhum).
CREATE OR REPLACE FUNCTION public.handle_new_user_default_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pre record;
  esta_no_grupo boolean;
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_profiles WHERE email = NEW.email) THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM auth.identities i
    WHERE i.user_id = NEW.id
      AND (i.identity_data->'custom_claims'->'groups') ? 'f9e6ce01-e343-4b73-99f0-b238a6dbab9a'
  ) INTO esta_no_grupo;

  IF NOT esta_no_grupo THEN
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
