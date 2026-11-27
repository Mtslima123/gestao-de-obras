// ─── itensHierarquia ──────────────────────────────────────────────────────────
// Hierarquia dos itens de orçamento, que é implícita no `codigo`: 001.08.04 é pai de
// 001.08.04.01. Não existe parentId aqui — a árvore mora na string, mesma convenção
// que Orcamentos.jsx usa para calcular nível pela contagem de pontos.
//
// Serve o multi-select do "Adicionar vínculo" (Orçamento × Cronograma), onde só as
// folhas podem virar vínculo: item-resumo é apenas agrupador. Também agrupa os itens já
// vinculados a uma tarefa pelo grupo do orçamento (agruparVinculosPorGrupo).

/** '001.08.04.01' → ['001', '001.08', '001.08.04'] (o próprio código fica de fora). */
export function ancestraisDe(codigo) {
  if (!codigo) return [];
  const partes = String(codigo).split('.');
  const out = [];
  for (let i = 1; i < partes.length; i++) out.push(partes.slice(0, i).join('.'));
  return out;
}

/**
 * Busca que enxerga a subárvore.
 *
 * Casar item a item não bastava: "Ferragens" é o nome do resumo, as filhas se chamam
 * "FECHADURA C/…", então buscar o nome do grupo trazia só a linha que não dá para
 * marcar. Aqui um item entra se ele casa, se é descendente de quem casou (é o que o
 * usuário quer marcar) ou se é ancestral de quem casou (senão as filhas apareceriam
 * soltas, sem a linha de grupo que dá contexto).
 *
 * O casamento roda sobre a lista completa e o resultado é filtrado contra
 * `disponiveis`, então um pai já vinculado continua puxando as filhas livres dele.
 *
 * @param {Array}  todos       - todos os itens do orçamento
 * @param {Array}  disponiveis - os que podem aparecer (já sem os vinculados)
 * @param {string} busca       - termo digitado
 */
export function filtrarComSubarvore(todos, disponiveis, busca) {
  const q = (busca || '').trim().toLowerCase();
  if (!q) return disponiveis;

  const casou = (todos || []).filter(it =>
    it.nome?.toLowerCase().includes(q) || it.codigo?.toLowerCase().includes(q)
  );
  if (!casou.length) return [];

  // Códigos que casaram + todos os ancestrais deles
  const manter = new Set();
  const raizes = new Set();
  casou.forEach(it => {
    if (!it.codigo) return;
    manter.add(it.codigo);
    raizes.add(it.codigo);
    ancestraisDe(it.codigo).forEach(a => manter.add(a));
  });

  // Descendente entra se algum ancestral seu casou. Caminhar os ancestrais de cada item
  // é O(n x profundidade); comparar startsWith de todos contra todos seria O(n^2), e a
  // lista de itens de orçamento chega a milhares.
  const ehDescendente = (codigo) => ancestraisDe(codigo).some(a => raizes.has(a));

  return (disponiveis || []).filter(it => {
    // Item sem código não tem lugar na árvore: sobrevive só se casou por nome.
    if (!it.codigo) return casou.includes(it);
    return manter.has(it.codigo) || ehDescendente(it.codigo);
  });
}

/**
 * Folhas vinculáveis abaixo de `pai` dentro de `lista` — em qualquer profundidade,
 * pulando os sub-resumos, que também não podem virar vínculo.
 *
 * `lista` é a lista visível, não a completa: clicar no pai marca o que está na tela.
 */
export function folhasDaSubarvore(pai, lista, resumoIds) {
  if (!pai?.codigo) return [];
  const prefixo = pai.codigo + '.';
  return (lista || []).filter(it =>
    it.codigo?.startsWith(prefixo) && !resumoIds?.has(it.id)
  );
}

// Ordem natural de código: 001.07.2 vem antes de 001.07.10 (comparação numérica por trecho),
// como nas demais telas que ordenam por código/WBS.
const comparaCodigo = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'pt-BR', { numeric: true });

const CHAVE_SEM_GRUPO = 'sem-grupo';

/**
 * Agrupa os vínculos de uma tarefa pelo grupo (item-resumo) do orçamento a que cada item pertence,
 * para o modal "Editar Itens Associados" mostrar um separador por grupo.
 *
 * O grupo de um item é o resumo mais próximo acima dele no código: 001.07.06.05 → 001.07.06. Se o
 * pai imediato não existir no orçamento (código pulado na importação), sobe até o ancestral mais
 * próximo que existe, em vez de largar o item sem contexto. A busca é feita dentro do mesmo
 * `orcamento_id` do item: a obra pode ter mais de um orçamento com os mesmos códigos, e sem isso o
 * nome do grupo vinha de outro orçamento.
 *
 * Quem não tem grupo identificável (sem código, raiz, nenhum ancestral existe, ou item do orçamento
 * apagado: `orcamento_itens` nulo) cai num grupo "Sem grupo" (`codigo: null`) no fim da lista. O
 * vínculo nunca some: a lixeira dele continua sendo o único jeito de desfazer.
 *
 * `valorDe` entra por parâmetro (e não importado) porque a fórmula do valor do item mora no
 * vinculoService, que puxa o cliente Supabase; este módulo precisa continuar puro para os testes.
 *
 * @param {Array}    vinculos - vínculos da tarefa, cada um com `orcamento_itens` aninhado
 * @param {Array}    itens    - todos os itens do orçamento da obra (fonte do nome dos grupos)
 * @param {Function} valorDe  - (item do orçamento) => valor em R$
 * @returns {Array<{chave: string, codigo: string|null, nome: string|null, caminho: string, vinculos: Array, valor: number}>}
 *   grupos na ordem do código, "Sem grupo" por último; itens de cada grupo também na ordem do código
 */
export function agruparVinculosPorGrupo(vinculos, itens, valorDe) {
  const chaveDe = (orcamentoId, codigo) => `${orcamentoId ?? ''}|${codigo}`;

  const porCodigo = new Map();
  (itens || []).forEach(it => {
    if (it?.codigo) porCodigo.set(chaveDe(it.orcamento_id, it.codigo), it);
  });

  const grupos = new Map();
  (vinculos || []).forEach(v => {
    const item = v.orcamento_itens;

    // Ancestral existente mais próximo (do pai imediato para cima)
    let pai = null;
    if (item?.codigo) {
      const ancestrais = ancestraisDe(item.codigo);
      for (let i = ancestrais.length - 1; i >= 0 && !pai; i--) {
        pai = porCodigo.get(chaveDe(item.orcamento_id, ancestrais[i])) || null;
      }
    }

    const chave = pai ? chaveDe(pai.orcamento_id, pai.codigo) : CHAVE_SEM_GRUPO;
    if (!grupos.has(chave)) {
      grupos.set(chave, {
        chave,
        codigo: pai ? pai.codigo : null,
        nome: pai ? (pai.nome ?? '') : null,
        // Cadeia de resumos acima do grupo, só para o tooltip do cabeçalho
        caminho: pai
          ? ancestraisDe(pai.codigo)
              .map(c => porCodigo.get(chaveDe(pai.orcamento_id, c)))
              .filter(Boolean)
              .map(a => `${a.codigo} ${a.nome ?? ''}`.trim())
              .join(' › ')
          : '',
        vinculos: [],
        valor: 0,
      });
    }
    const g = grupos.get(chave);
    g.vinculos.push(v);
    g.valor += valorDe(item) || 0;
  });

  const lista = [...grupos.values()];
  lista.forEach(g => g.vinculos.sort((a, b) => comparaCodigo(a.orcamento_itens?.codigo, b.orcamento_itens?.codigo)));
  // "Sem grupo" por último, mesmo que seus códigos (ou a ausência deles) ordenassem antes
  return lista.sort((a, b) => {
    if (a.codigo === null || b.codigo === null) return (a.codigo === null) - (b.codigo === null);
    return comparaCodigo(a.codigo, b.codigo);
  });
}
