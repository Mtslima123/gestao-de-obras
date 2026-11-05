// Regras puras da tela Orçamento × Cronograma na casca mobile (sem React): o que cada lista mostra, como a seleção de
// itens se comporta (item-resumo marca as folhas visíveis), busca de tarefa e o resumo por tarefa. São as mesmas regras
// do desktop (OrcamentoCronograma.jsx e itensHierarquia.js), reunidas aqui para teste. Quem guarda o estado e grava os
// vínculos continua sendo o OrcamentoCronogramaScreen.
import { filtrarComSubarvore, folhasDaSubarvore, ancestraisDe } from '../../../financeiro/itensHierarquia';

// Valor de um item de orçamento: o valor_total gravado costuma ser 0, então cai em quantidade x valor unitário (mesma
// regra do itemValor de vinculoService, copiada para esta camada não puxar o cliente do banco).
export const valorDoItem = (it) => it?.valor_total || (it?.quantidade || 0) * (it?.valor_unitario || 0);

// Sem acento e sem caixa: "fundacao" acha "Fundação".
export const normalizar = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// ---- Itens do orçamento ----
// Itens-resumo: qualquer item cujo código é prefixo de outro (001.01 é pai de 001.01.01). Não podem ser vinculados.
export const idsDeResumo = (itens = []) =>
  new Set(itens.filter(it => itens.some(o => o.codigo?.startsWith(it.codigo + '.'))).map(it => it.id));

// Valor mostrado no item-resumo: soma das FOLHAS da subárvore inteira (o resumo em si vale 0 no banco).
export const valorDoGrupoMap = (itens = [], resumoIds = new Set()) => {
  const mapa = {};
  itens.forEach(it => {
    if (resumoIds.has(it.id)) return; // só folha conta, senão soma em dobro
    const v = valorDoItem(it);
    if (!v || !it.codigo) return;
    ancestraisDe(it.codigo).forEach(a => { mapa[a] = (mapa[a] || 0) + v; });
  });
  return mapa;
};

// O que o seletor lista: itens ainda sem vínculo, com a busca enxergando a subárvore (buscar o nome do resumo traz as
// filhas; as filhas trazem o resumo como contexto).
export const itensDoSeletor = ({ itens = [], itensVinculadosIds = new Set(), busca = '' }) =>
  filtrarComSubarvore(itens, itens.filter(it => !itensVinculadosIds.has(it.id)), busca);

// Estado de uma linha do seletor. Item comum: marcado se está na seleção. Item-resumo: marca e desmarca as folhas
// visíveis na lista; fica "parcial" com parte marcada e "inerte" sem nenhuma folha visível. Os ids da seleção são
// texto (o pai converte para número ao gravar).
export const estadoDoItem = (it, { resumoIds, valorGrupoMap, lista, selItens }) => {
  const resumo = resumoIds.has(it.id);
  if (!resumo) {
    return { resumo: false, valor: valorDoItem(it), folhas: [], marcado: selItens.includes(String(it.id)), parcial: false, inerte: false };
  }
  const folhas = folhasDaSubarvore(it, lista, resumoIds);
  const marcadas = folhas.filter(f => selItens.includes(String(f.id))).length;
  return {
    resumo: true,
    valor: valorGrupoMap[it.codigo] || 0,
    folhas,
    marcado: folhas.length > 0 && marcadas === folhas.length,
    parcial: marcadas > 0 && marcadas < folhas.length,
    inerte: folhas.length === 0,
  };
};

// Soma dos itens escolhidos (a pílula "N itens → tarefa, Total").
export const totalDosSelecionados = (itens = [], selItens = []) => {
  const ids = new Set(selItens.map(String));
  return itens.filter(it => ids.has(String(it.id))).reduce((s, it) => s + valorDoItem(it), 0);
};

// ---- Tarefas do cronograma ----
export const rotuloDaTarefa = (etapa, rowNumberMap = {}) => `${rowNumberMap[etapa.id] ?? etapa.id}  ${etapa.etapa}`;
export const nomeDoPai = (etapa, etapas = []) => (etapa?.parentId ? (etapas.find(e => e.id === etapa.parentId)?.etapa || '') : '');
// Busca por nome ou número da linha, sem acento. Filtro plano (não mantém os ancestrais), como no desktop.
export const filtrarTarefas = (etapas = [], query = '', rowNumberMap = {}) => {
  if (!query) return etapas;
  const q = normalizar(query);
  return etapas.filter(et => normalizar(et.etapa).includes(q) || normalizar(String(rowNumberMap[et.id] ?? et.id)).includes(q));
};
export const nivelDaTarefa = (etapa) => (etapa?.isGroup ? 'Grupo' : `N${etapa?.nivel ?? 0}`);

// ---- Vínculos ----
export const totalDosVinculos = (vinculos = []) => vinculos.reduce((s, v) => s + valorDoItem(v.orcamento_itens), 0);

// "Resumo por tarefa": uma linha por tarefa que tem vínculo (na ordem do cronograma), com o nº de itens e a soma dos
// vínculos DIRETOS dela (não inclui valor rateado por pesos nem herdado de pai ou filhos). Vínculo de tarefa que não
// existe mais no cronograma não aparece aqui.
export const resumoPorTarefa = (vinculos = [], etapas = []) => {
  const porEtapa = {};
  vinculos.forEach(v => {
    if (!porEtapa[v.etapa_id]) porEtapa[v.etapa_id] = { itens: 0, total: 0 };
    porEtapa[v.etapa_id].itens += 1;
    porEtapa[v.etapa_id].total += valorDoItem(v.orcamento_itens);
  });
  return etapas.filter(e => porEtapa[e.id]).map(e => ({ etapa: e, itens: porEtapa[e.id].itens, total: porEtapa[e.id].total }));
};
export const filtrarResumo = (lista = [], texto = '') => {
  const q = String(texto).trim().toLowerCase();
  return q ? lista.filter(l => (l.etapa.etapa || '').toLowerCase().includes(q)) : lista;
};

// ---- Textos ----
export const plural = (n, singular, pluralTexto) => (n === 1 ? singular : pluralTexto);
export const textoDaSelecao = ({ nItens = 0, tarefa = '' }) => (
  tarefa ? `${nItens} ${plural(nItens, 'item', 'itens')} → ${tarefa}` : `${nItens} ${plural(nItens, 'item selecionado', 'itens selecionados')}`
);
export const textoDoBotaoAdicionar = (nItens) => (nItens > 1 ? `Adicionar (${nItens} itens)` : 'Adicionar');
