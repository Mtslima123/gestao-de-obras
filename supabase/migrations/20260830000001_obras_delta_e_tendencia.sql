-- ============================================================================
-- Colunas: obras."deltaFisicoFinanceiro" e obras."tendenciaFechamento"
-- Data: 2026-08-30
--
-- Dois indicadores percentuais digitados à mão, exibidos no cabeçalho da obra ao
-- lado de Avanço físico. São digitados, e não calculados, porque hoje o sistema não
-- tem como derivá-los: não existe avanço financeiro acumulado real (o gráfico
-- "físico × financeiro" do Dashboard usa série mock de utils/data.js) nem motor de
-- tendência/projeção de fechamento.
--
-- Por que precisa de coluna: obrasService.atualizar faz .update(dados) com o objeto
-- inteiro da obra. Chave que não seja coluna real derruba o update com PGRST204 —
-- não dá para guardar só no cliente.
--
-- camelCase entre aspas para acompanhar as colunas recentes da tabela
-- (dataFimObra, capaPos, avancoFisico), não o snake_case das antigas.
--
-- numeric sem NOT NULL: vazio é NULL e o cabeçalho exibe "—", igual às datas.
--
-- Aplicar manualmente no SQL Editor do Supabase (projeto gestao-de-obras).
-- Idempotente (ADD COLUMN IF NOT EXISTS). Não altera dado existente.
-- ============================================================================

ALTER TABLE obras ADD COLUMN IF NOT EXISTS "deltaFisicoFinanceiro" numeric;
ALTER TABLE obras ADD COLUMN IF NOT EXISTS "tendenciaFechamento"  numeric;

COMMENT ON COLUMN obras."deltaFisicoFinanceiro" IS 'Delta (%) entre avanço físico e financeiro — informado manualmente';
COMMENT ON COLUMN obras."tendenciaFechamento"  IS 'Tendência de fechamento (%) — informada manualmente';

-- ============================================================================
-- Verificação (somente leitura): devem voltar as duas linhas, tipo numeric.
--
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'obras'
--     AND column_name IN ('deltaFisicoFinanceiro', 'tendenciaFechamento');
--
-- Rollback:
--   ALTER TABLE obras DROP COLUMN IF EXISTS "deltaFisicoFinanceiro";
--   ALTER TABLE obras DROP COLUMN IF EXISTS "tendenciaFechamento";
-- ============================================================================
