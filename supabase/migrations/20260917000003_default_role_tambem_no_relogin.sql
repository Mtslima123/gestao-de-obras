-- Corrige: quem já tinha logado antes (auth.users já existe) e teve o user_profiles
-- excluído fica preso sem perfil pra sempre, porque o gatilho só disparava em
-- AFTER INSERT ON auth.users — ou seja, só no primeiro login de uma conta NOVA. Um
-- relogin de conta já existente é um UPDATE em auth.users (last_sign_in_at etc.), não
-- um INSERT, então o gatilho nunca rodava de novo pra recriar o perfil.
--
-- Caso real: Maria estava no grupo do Entra (passa no has_app_access()), mas teve o
-- user_profiles excluído manualmente — relogou várias vezes e continuou sem acesso,
-- porque nenhum INSERT novo em auth.users era gerado.
--
-- A função já tinha a trava certa ("só cria se ainda não existe perfil pra esse
-- e-mail") — só faltava o gatilho também escutar UPDATE, que é o que acontece em todo
-- login de uma conta que já existia.
DROP TRIGGER IF EXISTS on_auth_user_created_default_role ON auth.users;
CREATE TRIGGER on_auth_user_created_default_role
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_default_role();
