import { describe, it, expect } from 'vitest';
import { dimensoesDaReducao, FOTO_LADO_MAIOR, FOTO_QUALIDADE } from '../modules/obras/compressImagem';

describe('dimensoesDaReducao', () => {
  describe("pelo = 'largura' (padrão: miniatura e capa, como sempre foi)", () => {
    it('limita só a largura: foto deitada de celular sai em 1200x900', () => {
      expect(dimensoesDaReducao(4032, 3024, 1200)).toEqual({ largura: 1200, altura: 900 });
    });

    it('foto em pé também é limitada pela largura (1200x1600), não pelo lado maior', () => {
      expect(dimensoesDaReducao(3024, 4032, 1200)).toEqual({ largura: 1200, altura: 1600 });
    });

    it('miniatura de 600 px de largura', () => {
      expect(dimensoesDaReducao(1200, 1600, 600)).toEqual({ largura: 600, altura: 800 });
    });
  });

  describe("pelo = 'maior-lado' (fotos da galeria)", () => {
    it('foto deitada: lado maior em 2048', () => {
      expect(dimensoesDaReducao(4032, 3024, FOTO_LADO_MAIOR, 'maior-lado')).toEqual({ largura: 2048, altura: 1536 });
    });

    it('foto em pé: a ALTURA é o lado maior, então sai com a mesma nitidez da deitada', () => {
      expect(dimensoesDaReducao(3024, 4032, FOTO_LADO_MAIOR, 'maior-lado')).toEqual({ largura: 1536, altura: 2048 });
    });

    it('quadrada', () => {
      expect(dimensoesDaReducao(3000, 3000, 2048, 'maior-lado')).toEqual({ largura: 2048, altura: 2048 });
    });

    it('mantém a proporção arredondando para o pixel inteiro', () => {
      expect(dimensoesDaReducao(3000, 2000, 2048, 'maior-lado')).toEqual({ largura: 2048, altura: 1365 });
    });
  });

  it('nunca amplia: imagem menor que o limite fica como está, em qualquer modo', () => {
    expect(dimensoesDaReducao(800, 600, 2048, 'maior-lado')).toEqual({ largura: 800, altura: 600 });
    expect(dimensoesDaReducao(800, 600, 1200)).toEqual({ largura: 800, altura: 600 });
    expect(dimensoesDaReducao(2048, 1536, 2048, 'maior-lado')).toEqual({ largura: 2048, altura: 1536 });
  });

  it('a foto da galeria não passa de 2048 px nem de qualidade 0,85 (subir pesa no aparelho e no Storage)', () => {
    expect(FOTO_LADO_MAIOR).toBe(2048);
    expect(FOTO_QUALIDADE).toBe(0.85);
  });
});
