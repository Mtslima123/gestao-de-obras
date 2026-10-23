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

/** Códigos que têm filhos em `lista` (os "pais"), em O(n). Sempre derivado da lista recebida. */
export function conjuntoDePais(lista) {
  const pais = new Set();
  for (const it of lista || []) ancestraisDe(it.codigo).forEach(a => pais.add(a));
  return pais;
}

const nivelDe = (codigo) => (String(codigo).match(/\./g) || []).length;
// Arredonda para centavos por linha ANTES de somar, evitando acúmulo de erro de ponto
// flutuante ao propagar os totais de baixo para cima (folha → grupos).
const arredondar2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Totais bottom-up: folha = quantidade × valor unitário; grupo = soma dos filhos diretos.
 *
 * Quem é grupo e quem é folha vem da PRÓPRIA `lista` recebida, nunca de um conjunto de
 * pais calculado antes: na importação a lista acabou de ser recarregada do banco, e usar
 * os pais da lista anterior (vazia na 1ª importação) tratava os grupos como folha e
 * gravava `orcamentos.valor` errado.
 */
export function calcularTotaisItens(lista) {
  const itens = lista || [];
  const pais = conjuntoDePais(itens);
  const total = {};
  [...itens]
    .sort((a, b) => nivelDe(b.codigo) - nivelDe(a.codigo))
    .forEach(it => {
      if (pais.has(it.codigo)) {
        const filhos = itens.filter(ch =>
          ch.codigo.startsWith(it.codigo + '.') &&
          nivelDe(ch.codigo) === nivelDe(it.codigo) + 1
        );
        total[it.codigo] = arredondar2(filhos.reduce((s, ch) => s + (total[ch.codigo] ?? 0), 0));
      } else {
        total[it.codigo] = arredondar2((Number(it.quantidade) || 0) * (Number(it.valor_unitario) || 0));
      }
    });
  return itens.map(it => ({ ...it, valor_total: total[it.codigo] ?? it.valor_total ?? 0 }));
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
