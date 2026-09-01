// ─── itensHierarquia ──────────────────────────────────────────────────────────
// Hierarquia dos itens de orçamento, que é implícita no `codigo`: 001.08.04 é pai de
// 001.08.04.01. Não existe parentId aqui — a árvore mora na string, mesma convenção
// que Orcamentos.jsx usa para calcular nível pela contagem de pontos.
//
// Serve o multi-select do "Adicionar vínculo" (Orçamento × Cronograma), onde só as
// folhas podem virar vínculo: item-resumo é apenas agrupador.

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
