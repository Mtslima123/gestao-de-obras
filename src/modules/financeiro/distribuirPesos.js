// ─── distribuirPesos ──────────────────────────────────────────────────────────
// Funções puras por trás do modal "Distribuir pesos" (Orçamento × Cronograma).
// Ficam fora do componente para poderem ser testadas isoladamente: o rateio de
// dinheiro entre irmãos é a parte do modal que erra em silêncio se quebrar.
//
// O rateio em si continua sendo do computeValorVinculadoMap (ganttUtils.js) — aqui
// mora só o caminho inverso, de valor digitado em R$ de volta para fator_peso.

/** Map parentId → filhos diretos, na ordem do array de etapas. */
export function buildChildrenMap(etapas) {
  const m = new Map();
  (etapas || []).forEach(e => {
    if (!e.parentId) return;
    const arr = m.get(e.parentId);
    if (arr) arr.push(e); else m.set(e.parentId, [e]);
  });
  return m;
}

/**
 * Achata a subárvore de `rootId` em linhas { etapa, depth, temFilhos }, incluindo
 * os grupos intermediários (ao contrário do walk antigo, que só devolvia folhas).
 * Com `collapsed`, para de descer nos ids colapsados — é o que a tela renderiza.
 * Sem ele, devolve todos os descendentes — é o que alimenta o estado e o save.
 */
export function flattenTree(rootId, childrenOf, collapsed = null) {
  const out = [];
  const vistos = new Set();
  const walk = (id, depth) => {
    if (vistos.has(id)) return; // guarda contra parentId cíclico em dado corrompido
    vistos.add(id);
    (childrenOf.get(id) || []).forEach(c => {
      const filhos = childrenOf.get(c.id) || [];
      out.push({ etapa: c, depth, temFilhos: filhos.length > 0 });
      if (filhos.length && !(collapsed && collapsed.has(c.id))) walk(c.id, depth + 1);
    });
  };
  walk(rootId, 0);
  return out;
}

/** Folha travada: concluída ou com valor congelado no momento da conclusão. */
export const folhaTravada = (e) => (e?.avanco ?? 0) >= 100 || e?.valorVinculadoFixo != null;

/**
 * Nó travado. Para grupo, NÃO usa o `avanco` (que recomputeHierarchy deriva como
 * média dos filhos e passaria de 100 fácil): só trava se toda folha descendente
 * estiver travada — caso em que o peso do grupo não move dinheiro nenhum.
 */
export function noTravado(e, childrenOf, vistos = new Set()) {
  if (!e || vistos.has(e.id)) return true;
  vistos.add(e.id);
  const filhos = childrenOf.get(e.id) || [];
  if (filhos.length === 0) return folhaTravada(e);
  return filhos.every(c => noTravado(c, childrenOf, vistos));
}

// Arredonda o peso só para tirar o lixo de ponto flutuante. Precisão baixa aqui vira
// centavo perdido no rateio: com 6 casas, um grupo de R$ 479 mil já erra ~R$ 0,08.
const arredonda = (n) => {
  const v = Math.round(n * 1e10) / 1e10;
  return Math.abs(v) < 1e-9 ? 0 : v;
};

/** Trava do cadeado. Enquanto o modal está aberto vale o estado dele; fora, o campo salvo. */
export const pesoTravado = (e, travas) => (travas ? travas.has(e.id) : !!e?.peso_travado);

/**
 * Caminho inverso: o usuário digitou `valorAlvo` em R$ na linha `alvoId`; devolve
 * os novos fator_peso do conjunto de irmãos para que o rateio produza esse valor.
 *
 * Os outros irmãos livres absorvem a diferença mantendo a proporção que já tinham
 * entre si, então mexer num subgrupo não embaralha a divisão interna de nenhum.
 *
 * A soma dos pesos do conjunto (`W`) é invariante. Isso faz duas coisas de uma vez:
 * mantém os pesos numa ordem de grandeza legível (quatro irmãos de peso 1 divididos
 * 50/20/20/10 viram 2 / 0,8 / 0,8 / 0,4, não 0,5 / 0,2 / 0,2 / 0,1) e, como a fatia
 * de cada linha é `V × w/W`, segura o R$ das linhas travadas sem tocar no peso delas.
 *
 * @returns {Object|null} patch { [id]: string } dos irmãos livres, ou null quando não
 *                        há o que redistribuir
 */
export function redistribuirPorValor({ irmaos, alvoId, valorAlvo, valorPai, valorPorNo, pesos, travas }) {
  const fixos    = (irmaos || []).filter(e => e.valorVinculadoFixo != null);
  const rateados = (irmaos || []).filter(e => e.valorVinculadoFixo == null);
  const alvoEtapa = rateados.find(e => e.id === alvoId);
  if (!alvoEtapa || pesoTravado(alvoEtapa, travas)) return null;

  const livres = rateados.filter(e => !pesoTravado(e, travas));
  // Um único irmão livre sempre recebe todo o restante: não há grau de liberdade.
  if (livres.length < 2) return null;

  // Conjunto inteiro com peso zero: trata todo mundo como 1, senão W zera e o rateio
  // não teria como dividir nada.
  const bruto = (e) => {
    const v = pesos?.[e.id];
    const n = v != null && v !== '' ? parseFloat(v) : (e.fator_peso ?? 1);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const somaBruta = rateados.reduce((s, e) => s + bruto(e), 0);
  const pesoDe = somaBruta > 0 ? bruto : () => 1;

  // Dinheiro rateado por peso: o dos irmãos congelados na conclusão sai por cima
  const R = Math.max(0, (valorPai || 0) - fixos.reduce((s, e) => s + e.valorVinculadoFixo, 0));
  if (R <= 0) return null;

  const W  = rateados.reduce((s, e) => s + pesoDe(e), 0);
  const Wt = rateados.filter(e => pesoTravado(e, travas)).reduce((s, e) => s + pesoDe(e), 0);
  // O que sobra para os livres depois de reservar a fatia das travadas
  const disponivel = R * (W - Wt) / W;
  if (disponivel <= 0) return null;

  const alvo = Math.min(Math.max(0, Number.isFinite(valorAlvo) ? valorAlvo : 0), disponivel);
  const outros = livres.filter(e => e.id !== alvoId);
  const somaOutros = outros.reduce((s, e) => s + (valorPorNo?.[e.id] || 0), 0);
  const restante = disponivel - alvo;

  const novosValores = { [alvoId]: alvo };
  outros.forEach(e => {
    novosValores[e.id] = somaOutros > 0
      ? (valorPorNo[e.id] || 0) * restante / somaOutros
      : restante / outros.length;
  });

  // Só os livres entram no patch — o peso das travadas sai daqui intacto
  const patch = {};
  livres.forEach(e => { patch[e.id] = String(arredonda((novosValores[e.id] / R) * W)); });
  return patch;
}
