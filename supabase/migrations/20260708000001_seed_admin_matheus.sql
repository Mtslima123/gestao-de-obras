-- Semeia o administrador inicial do sistema (bootstrap do controle de acesso).
-- Necessário porque só um admin consegue cadastrar os demais usuários.
-- Idempotente: se o email já existir, apenas garante perfil admin e status ativo.
insert into public.user_profiles (email, nome, perfil, status)
values ('matheus.nascimento@soter.com.br', 'Matheus Nascimento', 'admin', 'ativo')
on conflict (email) do update
  set perfil = 'admin',
      status = 'ativo';
