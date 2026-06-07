-- Separa o código de exibição (sigla) do identificador de sistema (id).
-- O campo id passa a ser sempre um UUID gerado pelo app — imutável.
-- A sigla fica num campo separado para exibição e pode ser editada livremente.

ALTER TABLE obras ADD COLUMN IF NOT EXISTS sigla TEXT;

-- Backfill: obras existentes usam o id atual como sigla (backward compat)
UPDATE obras SET sigla = id WHERE sigla IS NULL;
