// Cache em memória do Cronograma, compartilhado entre módulos (por obra).
// Extraído de Cronograma.jsx para que outras telas (ex.: Orçamento × Cronograma)
// possam invalidar o cache após gravar direto no banco — senão o Cronograma
// restaura etapas antigas do cache sem reler o banco.
export const _cronCache   = {}; // { [obraId]: { etapas, customCols, baselines, reprogramacoes, vinculos, orcamentoItensMap } }
export const _cronSavedAt = {}; // { [obraId]: updated_at } — baseline do bloqueio otimista
// Espelho do que está gravado no banco (JSON por id + ordem), base do diff do save
// incremental. Ver etapasPatch.js. Sem isto o save cai no envio do array inteiro.
export const _cronSavedSnap = {}; // { [obraId]: { porId, ordem, outros } }

export function invalidateCronCache(obraId) {
  delete _cronCache[obraId];
  delete _cronSavedAt[obraId];
  delete _cronSavedSnap[obraId];
}

// Cache da tela Orçamento × Cronograma (vínculos + itens + etapas), mesmo padrão acima —
// espelhado aqui pra que o Cronograma/Lista também possa invalidá-lo ao gravar direto no
// banco, senão o Orçamento × Cronograma reexibe pesos antigos até recarregar sozinho.
export const _ocCache = {}; // { [obraId]: { vinculos, itens, etapas, updatedAt } }

export function invalidateOcCache(obraId) {
  delete _ocCache[obraId];
}

// Cache de "quais obras já têm cronograma criado" (dropdown de obra do Orçamento ×
// Cronograma) — sem isto, a tela buscava o `etapas` inteiro (até ~500 KB por obra) de
// TODAS as obras toda vez que montava, só para saber se cada uma tem etapas ou não.
// Chave: ids das obras ordenados e unidos — o resultado depende do conjunto inteiro, não
// de uma obra isolada. Invalidado ao salvar um cronograma, que é o único jeito de uma obra
// mudar de "sem cronograma" para "com cronograma" (ou vice-versa).
export const _obrasComCronCache = {}; // { [idsOrdenadosJuntos]: Set<obraId> }

export function invalidateObrasComCronCache() {
  for (const k of Object.keys(_obrasComCronCache)) delete _obrasComCronCache[k];
}
