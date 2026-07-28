// Cache em memória do Cronograma, compartilhado entre módulos (por obra).
// Extraído de Cronograma.jsx para que outras telas (ex.: Orçamento × Cronograma)
// possam invalidar o cache após gravar direto no banco — senão o Cronograma
// restaura etapas antigas do cache sem reler o banco.
export const _cronCache   = {}; // { [obraId]: { etapas, customCols, baselines, reprogramacoes, vinculos, orcamentoItensMap } }
export const _cronSavedAt = {}; // { [obraId]: updated_at } — baseline do bloqueio otimista

export function invalidateCronCache(obraId) {
  delete _cronCache[obraId];
  delete _cronSavedAt[obraId];
}
