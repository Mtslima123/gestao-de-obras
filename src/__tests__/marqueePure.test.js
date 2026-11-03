// Testes do recorte da moldura tracejada da seleção copiada. Executar: npm test
import { describe, it, expect } from 'vitest';
import { recorteEsquerdoDoMarquee, clipPathDoMarquee } from '../modules/cronograma/marqueePure';

// Área congelada até x=400 (calha + colunas fixas). Moldura nas colunas comuns, em x=900 com 200 de largura.
const borda = 400;

describe('recorteEsquerdoDoMarquee', () => {
  it('sem rolagem para o lado nada fica por baixo do congelado', () => {
    expect(recorteEsquerdoDoMarquee({ scrollLeft: 0, bordaCongelado: borda, left: 900, width: 200 })).toBe(0);
  });

  it('rolou o bastante para a moldura ainda estar toda à direita da borda: nada cortado', () => {
    // visível a partir de 100 + 400 = 500, a moldura começa em 900
    expect(recorteEsquerdoDoMarquee({ scrollLeft: 100, bordaCongelado: borda, left: 900, width: 200 })).toBe(0);
  });

  it('parte da moldura por baixo do congelado: corta só essa parte', () => {
    // visível a partir de 600 + 400 = 1000: os primeiros 100 px da moldura (900..1000) ficam escondidos
    expect(recorteEsquerdoDoMarquee({ scrollLeft: 600, bordaCongelado: borda, left: 900, width: 200 })).toBe(100);
  });

  it('moldura toda por baixo do congelado: corta a largura inteira', () => {
    expect(recorteEsquerdoDoMarquee({ scrollLeft: 2000, bordaCongelado: borda, left: 900, width: 200 })).toBe(200);
  });
});

describe('clipPathDoMarquee', () => {
  it('sem corte não aplica clip-path', () => {
    expect(clipPathDoMarquee(0)).toBe('none');
  });

  it('com corte recorta a esquerda', () => {
    expect(clipPathDoMarquee(100)).toBe('inset(0 0 0 100px)');
  });
});
