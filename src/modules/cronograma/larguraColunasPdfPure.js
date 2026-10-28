// Larguras das colunas do PDF da Lista de Tarefas. Cada coluna recebe uma fatia proporcional ao peso
// (largura configurada na tela), mas nunca menos que o mínimo: o texto mais largo que tem que caber
// numa linha só (valor em R$, WBS, data). Sem esse piso, com muitas colunas visíveis a fatia ficava
// menor que "R$ 44.771.288,90" e o autotable quebrava o número no meio da casa decimal.
// Quem não cabe na fatia proporcional fica no mínimo, e o que sobra é redividido entre as demais.
export const repartirLarguras = (pesos, minimas, total) => {
  const n = pesos.length;
  const largura = new Array(n).fill(0);
  const fixas = new Set();
  for (;;) {
    const livres = [];
    for (let i = 0; i < n; i++) if (!fixas.has(i)) livres.push(i);
    let restante = total;
    fixas.forEach(i => { restante -= minimas[i]; });
    const somaPesos = livres.reduce((s, i) => s + pesos[i], 0) || 1;
    let mudou = false;
    livres.forEach(i => {
      if ((pesos[i] / somaPesos) * restante < minimas[i]) { fixas.add(i); mudou = true; }
    });
    if (!mudou) {
      livres.forEach(i => { largura[i] = (pesos[i] / somaPesos) * restante; });
      fixas.forEach(i => { largura[i] = minimas[i]; });
      break;
    }
  }
  // Os mínimos sozinhos já passam do espaço da página: reduz tudo na mesma proporção (último recurso).
  const soma = largura.reduce((s, w) => s + w, 0);
  return soma > total + 1e-9 ? largura.map(w => (w / soma) * total) : largura;
};

// Cabe se a soma dos mínimos não passa da largura disponível.
export const minimosCabem = (minimas, total) => minimas.reduce((s, w) => s + w, 0) <= total;
