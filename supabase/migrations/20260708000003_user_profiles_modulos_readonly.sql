-- Adiciona coluna modulos_readonly_ids em user_profiles
-- Mesma semântica de modulos_ids: array vazio = comportamento atual (edição
-- liberada); presença do id do módulo = usuário só pode visualizar aquele
-- módulo (sem criar/editar/excluir).
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS modulos_readonly_ids TEXT[] DEFAULT '{}';
