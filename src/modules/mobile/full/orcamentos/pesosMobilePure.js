// Regras puras da folha "Distribuir pesos" na casca mobile (sem React). São as mesmas do DistribuirPesosModal do desktop
// (OrcamentoCronograma.jsx), reunidas aqui para teste: estado de partida, retirar/readicionar subárvore, valor que cai em
// cada linha, valor digitado em R$ virando fator peso, detecção de alteração e o payload do salvar. O rateio em si continua
// sendo do computeValorVinculadoMap e do redistribuirPorValor, que não foram copiados. Quem grava é o OrcamentoCronogramaScreen
// (handleSalvarPesos, o mesmo do desktop).
import { buildChildrenMap, flattenTree, noTravado, redistribuirPorValor } from '../../../financeiro/distribuirPesos';
import { computeValorVinculadoMap } from '../../../cronograma/ganttUtils';
import { parseNumero } from './orcamentoMobilePure';

export const UNIDADES_PESO = ['m²', 'm', 'm³', 'un', 'vb', '%', 'pav'];

export const subarvoreIds = (id, childrenOf) => [id, ...flattenTree(id, childrenOf).map(n => n.etapa.id)];

// Estado de partida da folha para o grupo `etapa`. Subgrupos além do primeiro nível começam recolhidos (os filhos diretos
// são a decisão principal). Quem já foi retirado antes é reconhecido pelo banco: ele só guarda fator_peso = 0, então a raiz
// de cada subárvore zerada é a que tem peso 0 com o pai diferente de 0 (filho direto do grupo conta como pai com peso 1).
export const estadoInicial = (etapa, etapas) => {
  const childrenOf = buildChildrenMap(etapas);
  const descendentes = flattenTree(etapa.id, childrenOf);
  const pesoDe = new Map(descendentes.map(n => [n.etapa.id, Number(n.etapa.fator_peso ?? 1)]));
  const removidos = new Set();
  descendentes.forEach(n => {
    const f = n.etapa;
    if ((pesoDe.get(f.id) ?? 1) !== 0) return;
    const pesoPai = f.parentId === etapa.id ? 1 : (pesoDe.get(f.parentId) ?? 1);
    if (pesoPai !== 0) removidos.add(f.id);
  });
  return {
    childrenOf,
    descendentes,
    collapsed: new Set(descendentes.filter(n => n.temFilhos && n.depth > 0).map(n => n.etapa.id)),
    pesos: Object.fromEntries(descendentes.map(n => [n.etapa.id, String(n.etapa.fator_peso ?? 1)])),
    travas: new Set(descendentes.filter(n => n.etapa.peso_travado).map(n => n.etapa.id)),
    removidos,
    unidade: etapa.peso_unidade || '',
  };
};

// "Retirar da distribuição": zera o peso da linha e de toda a subárvore dela (não apaga tarefa) e guarda o peso de antes
// para o "adicionar de volta". Sem peso guardado (já vinha zerado do banco) volta com 1, como no desktop.
export const retirarDaDistribuicao = ({ pesos, ids, guardados = {} }) => {
  const novo = { ...pesos };
  const g = { ...guardados };
  ids.forEach(id => { g[id] = pesos[id]; novo[id] = '0'; });
  return { pesos: novo, guardados: g };
};
export const readicionarNaDistribuicao = ({ pesos, ids, guardados = {} }) => {
  const novo = { ...pesos };
  ids.forEach(id => { novo[id] = guardados[id] ?? '1'; });
  return novo;
};

// Ids retirados + toda a subárvore de cada um (a subárvore some junto da lista principal).
export const idsComSubarvore = (removidos, childrenOf) => {
  const set = new Set();
  removidos.forEach(id => subarvoreIds(id, childrenOf).forEach(a => set.add(a)));
  return set;
};

// Linhas que a folha desenha: respeita o recolhido e esconde o que foi retirado.
export const linhasDaLista = ({ etapaId, childrenOf, collapsed, removidosSubarvore }) =>
  flattenTree(etapaId, childrenOf, collapsed).filter(no => !removidosSubarvore.has(no.etapa.id));

export const alternarEm = (set, id) => {
  const n = new Set(set);
  if (n.has(id)) n.delete(id); else n.add(id);
  return n;
};

// ---- Valores ----
// Valor que o grupo recebe: soma dos itens vinculados diretamente a ele.
export const valorDoGrupo = (vinculos = [], orcamentoItensMap = {}) =>
  vinculos.reduce((s, v) => s + (orcamentoItensMap[v.orcamento_item_id] || 0), 0);

// Com os pesos digitados, quanto cai em cada nó (isolado aos vínculos deste grupo). Já devolve o agregado dos grupos.
export const valorPorNoDe = ({ etapas, pesos, vinculos, orcamentoItensMap }) => {
  const editadas = etapas.map(e => (pesos[e.id] != null ? { ...e, fator_peso: Math.max(0, parseFloat(pesos[e.id]) || 0) } : e));
  return computeValorVinculadoMap(editadas, vinculos, orcamentoItensMap);
};

// Só os filhos diretos: somar a árvore inteira contaria os grupos em dobro.
export const totalDistribuido = (etapaId, childrenOf, valorPorNo) =>
  (childrenOf.get(etapaId) || []).reduce((s, c) => s + (valorPorNo[c.id] || 0), 0);

// Dinheiro que não chegou a nenhuma subtarefa (conjunto de irmãs todo com peso zero).
export const divergenciaDe = (valorGrupo, total) => {
  const valor = valorGrupo - total;
  return { valor, tem: Math.abs(valor) > 0.01 };
};

// Valor do pai que chega ao conjunto de irmãs da linha `f`.
export const valorDoPai = (f, { etapaId, valorGrupo, valorPorNo }) =>
  (f.parentId === etapaId ? valorGrupo : (valorPorNo[f.parentId] || 0));

// Com um só irmão livre não há o que redistribuir: ele recebe tudo por definição.
export const valorEditavel = (f, { childrenOf, travas, valorPai }) => {
  if (travas.has(f.id) || valorPai <= 0) return false;
  const livres = (childrenOf.get(f.parentId) || []).filter(c => c.valorVinculadoFixo == null && !travas.has(c.id));
  return livres.length >= 2;
};

// Concluída (ou valor congelado) trava o peso pela regra de negócio; o cadeado é do usuário.
export const bloqueioDaLinha = (f, { childrenOf, travas }) => {
  const concluida = noTravado(f, childrenOf);
  const cadeado = travas.has(f.id);
  return { concluida, cadeado, bloqueada: concluida || cadeado };
};

// R$ digitado no celular. Aceita "1.234,50", "1234,5", "1234.5" (ponto decimal com 1 ou 2 casas) e "R$ 500". Nunca negativo.
// O desktop (parseBRL) lia "1234.5" como 12345: aqui o ponto decimal digitado no teclado numérico não vira milhar.
export const valorDigitado = (texto) => Math.max(0, parseNumero(String(texto ?? '').replace(/R\$\s?/g, '')));
export const valorParaCampo = (v) => (Number(v) || 0).toFixed(2).replace('.', ',');

// R$ digitado numa linha → patch de fator_peso dos irmãos livres (ou null quando não há o que redistribuir).
export const aplicarValorDigitado = ({ etapa, texto, childrenOf, valorPai, valorPorNo, pesos, travas }) =>
  redistribuirPorValor({
    irmaos: childrenOf.get(etapa.parentId) || [],
    alvoId: etapa.id,
    valorAlvo: valorDigitado(texto),
    valorPai,
    valorPorNo,
    pesos,
    travas,
  });

// ---- Alteração e salvar ----
// Comparação por valor (setPesos/setTravas sempre criam objeto novo, então === acusaria mudança sem edição real).
export const houveMudanca = (base, atual) => {
  const pesosMudou = Object.keys(base.pesos).some(id => Number(base.pesos[id]) !== Number(atual.pesos[id]));
  const igualSet = (a, b) => a.size === b.size && [...a].every(id => b.has(id));
  return pesosMudou || !igualSet(base.travas, atual.travas) || !igualSet(base.removidos, atual.removidos) || base.unidade !== atual.unidade;
};

// Payload do onSave, igual ao do desktop: o peso só fica de fora quando a regra de negócio bloqueia (concluída ou valor
// fixo), o cadeado do usuário não tira o que já está digitado; o estado do cadeado vai à parte, de todas as linhas.
export const payloadParaSalvar = ({ descendentes, pesos, travas, childrenOf }) => ({
  pesos: Object.fromEntries(descendentes.filter(n => !noTravado(n.etapa, childrenOf)).map(n => [n.etapa.id, pesos[n.etapa.id]])),
  travas: Object.fromEntries(descendentes.map(n => [n.etapa.id, travas.has(n.etapa.id)])),
});
