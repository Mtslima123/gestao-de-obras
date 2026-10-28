// Larguras do PDF da Lista de Tarefas: coluna de valor nunca fica menor que o texto (ver larguraColunasPdfPure.js).
import { describe, it, expect } from 'vitest';
import { repartirLarguras, minimosCabem } from '../modules/cronograma/larguraColunasPdfPure';

const soma = (a) => a.reduce((s, x) => s + x, 0);

describe('repartirLarguras', () => {
  it('sem piso apertado, divide proporcional aos pesos e ocupa o total', () => {
    const w = repartirLarguras([100, 100, 200], [5, 5, 5], 80);
    expect(w).toEqual([20, 20, 40]);
  });

  it('coluna cuja fatia ficaria menor que o mínimo fica no mínimo', () => {
    // 10 colunas de peso igual em 100mm = 10mm cada; a de valor precisa de 22mm
    const pesos = new Array(10).fill(100);
    const minimas = new Array(10).fill(5);
    minimas[3] = 22;
    const w = repartirLarguras(pesos, minimas, 100);
    expect(w[3]).toBe(22);
    expect(soma(w)).toBeCloseTo(100, 6);
    w.forEach((x, i) => { if (i !== 3) expect(x).toBeCloseTo(78 / 9, 6); });
  });

  it('o que sobra depois dos pisos é redividido pelos pesos das demais', () => {
    const w = repartirLarguras([100, 100, 300], [30, 5, 5], 100);
    expect(w[0]).toBe(30);
    expect(w[1]).toBeCloseTo(17.5, 6);
    expect(w[2]).toBeCloseTo(52.5, 6);
  });

  it('piso em cascata: fixar uma coluna pode fixar outra', () => {
    const w = repartirLarguras([100, 100, 100], [40, 28, 1], 90);
    expect(w[0]).toBe(40);
    expect(w[1]).toBe(28);
    expect(w[2]).toBeCloseTo(22, 6);
  });

  it('nenhuma coluna fica abaixo do mínimo quando os mínimos cabem', () => {
    const minimas = [12, 8, 22, 22, 18, 9];
    const w = repartirLarguras([60, 80, 112, 120, 300, 70], minimas, 270);
    w.forEach((x, i) => expect(x).toBeGreaterThanOrEqual(minimas[i] - 1e-9));
    expect(soma(w)).toBeCloseTo(270, 6);
  });

  it('mínimos que não cabem na página são reduzidos na mesma proporção', () => {
    const w = repartirLarguras([1, 1], [60, 60], 90);
    expect(w).toEqual([45, 45]);
  });

  it('sem colunas devolve lista vazia', () => {
    expect(repartirLarguras([], [], 100)).toEqual([]);
  });
});

describe('minimosCabem', () => {
  it('compara a soma dos mínimos com a largura disponível', () => {
    expect(minimosCabem([10, 20], 30)).toBe(true);
    expect(minimosCabem([10, 21], 30)).toBe(false);
  });
});
