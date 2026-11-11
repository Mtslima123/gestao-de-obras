// Fórmulas de soma dos grupos no Excel da Lista de Tarefas (sem React e sem a biblioteca do xlsx, para poder testar).
//
// Na tela, o valor de um grupo é a soma dos filhos diretos (cada subgrupo já soma os próprios filhos: bubble-up em
// computeCustoOrcadoMap e computeValorVinculadoMap). No Excel o grupo saía como número fixo; aqui se monta a mesma
// regra como fórmula, para o grupo e o total acompanharem quem edita um valor na planilha.

// 0 -> 'A', 25 -> 'Z', 26 -> 'AA' (a Lista pode ter muitas colunas personalizadas).
export const letraDaColuna = (i) => {
  let n = i + 1;
  let letra = '';
  while (n > 0) {
    const resto = (n - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    n = Math.floor((n - 1) / 26);
  }
  return letra;
};

// Linhas seguidas viram intervalo: ([12,13,14,15,17], 'J') -> 'J12:J15,J17'. Os filhos de um grupo ficam espalhados
// quando há subgrupos (os netos aparecem entre eles), então a fórmula leva vários trechos.
export const comprimirLinhas = (linhas, letra) => {
  const ordenadas = [...new Set(linhas)].sort((a, b) => a - b);
  const partes = [];
  let i = 0;
  while (i < ordenadas.length) {
    let j = i;
    while (j + 1 < ordenadas.length && ordenadas[j + 1] === ordenadas[j] + 1) j += 1;
    partes.push(j > i ? `${letra}${ordenadas[i]}:${letra}${ordenadas[j]}` : `${letra}${ordenadas[i]}`);
    i = j + 1;
  }
  return partes.join(',');
};

// exportadas: as linhas na ordem em que vão para a planilha, [{ id, parentId, isGroup }].
// todas: a lista COMPLETA de tarefas da obra, [{ id, parentId }]. Serve para saber se algum filho ficou de fora
//   (filtro ativo, grupo recolhido): nesse caso a soma da planilha divergiria da tela e o grupo mantém o número fixo.
// colunas: índices (0 = coluna A) das colunas que recebem fórmula.
// primeiraLinhaExcel: número (1 = primeira linha da planilha) da linha de exportadas[0].
// Devolve { porLinha: Map(posição em exportadas -> { [coluna]: 'SUM(...)' }), total: { [coluna]: 'SUM(...)' } | null,
// linhasDoTotal: [número da linha no Excel] }.
// `total` soma as tarefas de topo e só existe quando TODAS as tarefas foram exportadas; `linhasDoTotal` diz quais são,
// para quem grava a planilha calcular o valor que fica guardado junto da fórmula (a célula do Total não tinha valor
// próprio em todas as colunas, ex.: Valor Vinculado saía em branco).
export function montarSomasDosGrupos({ exportadas, todas, colunas, primeiraLinhaExcel }) {
  const resultado = { porLinha: new Map(), total: null, linhasDoTotal: [] };
  if (!colunas?.length || !exportadas?.length) return resultado;

  const posicao = new Map(exportadas.map((e, i) => [e.id, i]));
  const filhosDe = new Map();
  todas.forEach((e) => {
    if (e.parentId == null) return;
    if (!filhosDe.has(e.parentId)) filhosDe.set(e.parentId, []);
    filhosDe.get(e.parentId).push(e.id);
  });

  const formulas = (posicoes) => {
    const linhas = posicoes.map((p) => primeiraLinhaExcel + p);
    return Object.fromEntries(colunas.map((c) => [c, `SUM(${comprimirLinhas(linhas, letraDaColuna(c))})`]));
  };

  exportadas.forEach((e, i) => {
    if (!e.isGroup) return;
    const filhos = filhosDe.get(e.id) || [];
    if (!filhos.length || !filhos.every((id) => posicao.has(id))) return;
    resultado.porLinha.set(i, formulas(filhos.map((id) => posicao.get(id))));
  });

  if (todas.every((e) => posicao.has(e.id))) {
    const topo = [];
    exportadas.forEach((e, i) => { if (e.parentId == null) topo.push(i); });
    if (topo.length) {
      resultado.total = formulas(topo);
      resultado.linhasDoTotal = topo.map((p) => primeiraLinhaExcel + p);
    }
  }
  return resultado;
}
