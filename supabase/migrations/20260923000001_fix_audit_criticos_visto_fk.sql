-- Corrige FK errada: audit_criticos_visto.user_id guarda auth.uid() (é o que a
-- policy RLS já compara e o que o front-end já envia — user.id = session.user.id),
-- mas a FK apontava pra user_profiles(id), um id INDEPENDENTE (perfil vincula à
-- sessão por e-mail, não por id compartilhado — ver can_access_obra()/
-- is_current_user_admin()). Resultado: todo upsert de "marcar como visto" violava
-- a FK e falhava (erro engolido no front-end sem log), então o badge de "Eventos
-- Críticos" nunca zerava pra ninguém — tabela ficou vazia desde a criação.
-- Tabela sem linhas até aqui, então a troca é direta (sem dado pra migrar).
ALTER TABLE public.audit_criticos_visto
  DROP CONSTRAINT audit_criticos_visto_user_id_fkey,
  ADD CONSTRAINT audit_criticos_visto_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
