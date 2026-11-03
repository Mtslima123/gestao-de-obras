// Moldura tracejada ("marching ants") da seleção copiada na Lista. Puro (sem React/DOM),
// testável em node.
//
// A moldura é um retângulo em coordenadas do CONTEÚDO, dentro do container que rola: acompanha a
// rolagem sozinha. As colunas congeladas e a calha são `sticky` e ficam paradas por cima do que
// rola, então quando se rola para o lado a moldura de células comuns passa por baixo delas
// (o cabeçalho é coberto pelo z-index, ver ListaInterativa.jsx). O CSS não consegue cortar um
// elemento absoluto na borda de uma coluna sticky; este recorte faz isso.

// Quantos px da esquerda da moldura ficam por baixo da área congelada: o conteúdo visível começa
// em `scrollLeft + bordaCongelado` (borda direita do trecho congelado, em coordenadas do conteúdo).
// Limitado à largura da moldura (toda escondida) e a 0 (nada escondido).
export function recorteEsquerdoDoMarquee({ scrollLeft, bordaCongelado, left, width }) {
  const x = scrollLeft + bordaCongelado - left;
  return Math.min(Math.max(x, 0), width);
}

// `clip-path` correspondente; 'none' quando não há o que cortar.
export function clipPathDoMarquee(recorte) {
  return recorte > 0 ? `inset(0 0 0 ${recorte}px)` : 'none';
}
