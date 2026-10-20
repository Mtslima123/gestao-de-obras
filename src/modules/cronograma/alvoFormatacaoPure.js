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
