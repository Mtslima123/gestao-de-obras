// Localizar na Lista (Ctrl+L), sem React, para teste. "Localizar próxima" e "Localizar tudo" usam
// a MESMA busca: uma ocorrência por CÉLULA (tarefa x coluna) cujo texto exibido contém o termo,
// ignorando acento e caixa, na ordem da tela (linha a linha e, na linha, coluna a coluna), como o
// Excel. Quem sabe o texto de cada célula é a Lista (colFilterValue); aqui só se varre.

// Mesma normalização das outras buscas do projeto (cronogramaModais.jsx: buscaPred/normBusca).
export const normBusca = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Teto de resultados na lista: um termo de uma letra numa EAP grande casa em dezenas de milhares
// de células, e a tabela de resultados não precisa (nem consegue) mostrar tudo.
export const LIMITE_RESULTADOS = 2000;

// tarefas: linhas candidatas, na ordem da tela. colunas: [{ id, label }] visíveis, na ordem da tela.
// textoDaCelula(tarefa, colId) -> texto como aparece na célula. Devolve [{ taskId, colId, colLabel, texto }].
export const encontrarTudo = ({ tarefas, colunas, termo, textoDaCelula, limite = Infinity }) => {
  const q = normBusca(termo);
  const out = [];
  if (!q) return out;
  for (const t of tarefas) {
    for (const c of colunas) {
      const texto = String(textoDaCelula(t, c.id) ?? '');
      if (texto && normBusca(texto).includes(q)) {
        out.push({ taskId: t.id, colId: c.id, colLabel: c.label, texto });
        if (out.length >= limite) return out;
      }
    }
  }
  return out;
};

// Busca da Lista. `candidatas` = linhas que passam pelos filtros ATIVOS, inclusive as dentro de
// grupo recolhido (ficam fora só as escondidas por filtro); `visiveis` = ids que estão na grade
// agora (sem as de grupo recolhido). Cada resultado diz se está em grupo recolhido: ao ir até ele,
// a Lista abre os grupos. `contarOcultos` (só a "Localizar tudo" precisa) conta as tarefas que
// casariam mas estão escondidas por filtro, para a lista avisar quantas ficaram de fora.
export const buscarNaLista = ({ todas, candidatas, visiveis, colunas, termo, textoDaCelula, contarOcultos = false }) => {
  const itens = encontrarTudo({ tarefas: candidatas, colunas, termo, textoDaCelula, limite: LIMITE_RESULTADOS + 1 });
  const truncado = itens.length > LIMITE_RESULTADOS;
  if (truncado) itens.length = LIMITE_RESULTADOS;
  for (const r of itens) r.recolhido = !visiveis.has(r.taskId);
  let ocultosPorFiltro = 0;
  if (contarOcultos) {
    const candidatasIds = new Set(candidatas.map((t) => t.id));
    const escondidas = encontrarTudo({ tarefas: todas.filter((t) => !candidatasIds.has(t.id)), colunas, termo, textoDaCelula });
    ocultosPorFiltro = new Set(escondidas.map((r) => r.taskId)).size;
  }
  return { itens, truncado, ocultosPorFiltro };
};

// Grupos recolhidos que escondem a tarefa (do mais próximo ao mais distante). Mesma regra de
// getVisibleEtapas (scheduleEngine.js): só conta pai que é grupo E está recolhido.
export const ancestraisRecolhidos = (etapas, taskId) => {
  const porId = new Map(etapas.map((e) => [e.id, e]));
  const ids = [];
  let cur = porId.get(taskId);
  while (cur?.parentId) {
    const pai = porId.get(cur.parentId);
    if (!pai) break;
    if (pai.isGroup && pai.collapsed) ids.push(pai.id);
    cur = pai;
  }
  return ids;
};
