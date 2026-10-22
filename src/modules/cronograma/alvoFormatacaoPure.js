// Regras puras da seleção da Lista: alvo da formatação, Ctrl+clique em células soltas e seleção de
// volta ao desfazer/refazer (mais abaixo).
//
// Células que recebem a formatação da faixa (negrito, cor de fundo, fonte, limpar formatação).
// A Lista tem quatro formas de selecionar e a formatação só enxergava duas (colunas e intervalo):
// Ctrl+clique em células soltas e Ctrl+clique em números da calha moviam a célula ativa para a
// última clicada, então só ela era formatada. Aqui fica a regra única, na mesma precedência e com
// a mesma convenção `length > 1` de Copiar/Excluir (uma célula só vale como seleção comum).
//
//  1. colunas marcadas no cabeçalho (Ctrl+clique) -> todas as linhas visíveis dessas colunas
//  2. células soltas (Ctrl+clique)                 -> exatamente elas
//  3. linhas soltas (Ctrl+clique na calha)         -> essas linhas, todas as colunas visíveis
//     (`linhasSoltas` já vem resolvida pela tela: multiSel + linha ativa + intervalo)
//  4. senão                                        -> o intervalo (âncora até a célula ativa)
// Linhas fora do filtro atual ficam de fora: não se formata o que a pessoa não está vendo.
export function celulasAlvoFormatacao({
  multiSelCols = [], multiSelCells = [], linhasSoltas = [],
  linhas = [], colunas = [], intervalo = [], ignorarCols = new Set(),
}) {
  const visiveis = new Set(linhas);
  const lista = [];
  const vistos = new Set();
  const add = (taskId, colId, soVisiveis = true) => {
    if ((soVisiveis && !visiveis.has(taskId)) || ignorarCols.has(colId)) return;
    const chave = taskId + '|' + colId;
    if (vistos.has(chave)) return;
    vistos.add(chave);
    lista.push({ taskId, colId });
  };

  if (multiSelCols.length) {
    linhas.forEach(taskId => multiSelCols.forEach(colId => add(taskId, colId)));
  } else if (multiSelCells.length > 1) {
    multiSelCells.forEach(c => add(c.taskId, c.colId));
  } else if (linhasSoltas.length) {
    linhasSoltas.forEach(taskId => colunas.forEach(colId => add(taskId, colId)));
  } else {
    // O intervalo já nasce da lista filtrada; mantém o comportamento de sempre, sem refiltrar.
    intervalo.forEach(c => add(c.taskId, c.colId, false));
  }
  return lista;
}

// Ctrl+clique numa célula: alterna ela na lista de células soltas. No PRIMEIRO Ctrl+clique depois de
// uma seleção comum, a seleção de antes (a célula ou o intervalo) continua marcada, como no Excel:
// sem isso a primeira célula clicada ficava de fora e só as seguintes eram formatadas/copiadas.
// `anterior` é a seleção vigente antes do clique; só entra quando a lista de soltas ainda está vazia.
export function alternarCelulaMarcada(marcadas, anterior, clicada) {
  const base = marcadas.length ? marcadas : anterior;
  const igual = (c) => c.taskId === clicada.taskId && c.colId === clicada.colId;
  return base.some(igual) ? base.filter(c => !igual(c)) : [...base, { taskId: clicada.taskId, colId: clicada.colId }];
}

// Ctrl+clique na calha de uma linha: alterna ela na lista de linhas marcadas, que guarda a ORDEM DO
// CLIQUE (o Ctrl+F2 vincula nessa ordem, como no Project: a primeira clicada vira predecessora da
// seguinte). A linha clicada SEM Ctrl fica fora dessa lista (é só a seleção ativa), então no primeiro
// Ctrl+clique ela entra na frente: sem isso a lista nascia só com a 2ª linha e o vínculo saía de cima
// para baixo, ignorando qual foi clicada primeiro. `anterior` é a seleção vigente (ids na ordem da
// tela, ou na ordem em que foi marcada); só vale enquanto a lista de marcadas está vazia.
export function alternarLinhaMarcada(marcadas, anterior, clicada) {
  const base = marcadas.length ? marcadas : anterior;
  return base.includes(clicada) ? base.filter(id => id !== clicada) : [...base, clicada];
}

// ── Seleção de volta ao desfazer/refazer ─────────────────────────────────────────────────────────
// Cada ação gravada no histórico guarda a seleção da Lista do instante em que foi feita. Desfazer ou
// refazer devolve essa seleção (as mesmas células, soltas ou em intervalo), em vez de só pular para a
// linha da primeira tarefa alterada. Só vale se a seleção guardada tem a ver com o que mudou; ações
// que não nascem da seleção (Gantt, Medição, modais) caem no foco por tarefa de sempre.

/** Ids das tarefas cujo conteúdo difere entre dois snapshots (alteradas, incluídas ou removidas). */
export function tarefasAlteradas(antes, depois) {
  const mudados = new Set();
  const porId = new Map(depois.map(e => [e.id, JSON.stringify(e)]));
  const vistos = new Set();
  antes.forEach(e => {
    vistos.add(e.id);
    if (porId.get(e.id) !== JSON.stringify(e)) mudados.add(e.id);
  });
  depois.forEach(e => { if (!vistos.has(e.id)) mudados.add(e.id); });
  return mudados;
}

/** Ids de todas as tarefas tocadas por uma seleção guardada da Lista. */
export function idsDaSelecao(sel) {
  const ids = new Set();
  if (!sel) return ids;
  if (sel.selectedCell) ids.add(sel.selectedCell.taskId);
  if (sel.selAnchor) ids.add(sel.selAnchor.taskId);
  if (sel.selectedId != null) ids.add(sel.selectedId);
  (sel.multiSel || []).forEach(id => ids.add(id));
  (sel.multiSelCells || []).forEach(c => ids.add(c.taskId));
  return ids;
}

/** A seleção guardada pertence a esta mudança? (alguma tarefa dela foi alterada) */
export function selecaoTocaMudanca(sel, mudados) {
  if (!sel || !sel.selectedCell || !mudados?.size) return false;
  for (const id of idsDaSelecao(sel)) if (mudados.has(id)) return true;
  return false;
}
