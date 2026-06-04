-- Adiciona coluna modulos_ids em user_profiles
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS modulos_ids TEXT[] DEFAULT '{}';
