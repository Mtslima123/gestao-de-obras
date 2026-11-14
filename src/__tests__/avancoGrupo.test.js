// Testes do avanço dos grupos (Lista, Gantt): média ponderada pelo valor, sem somar erro de
// arredondamento a cada nível. Executar: npm test
import { describe, it, expect } from 'vitest';
import { computeGroupValues, computeAvancoFisico, avancoExibido } from '../modules/cronograma/scheduleEngine';

const folha = (id, parentId, avanco, custo) => ({ id, parentId, isGroup: false, inicio: 0, dur: 5, avanco, custo });
const grupo = (id, parentId) => ({ id, parentId, isGroup: true, inicio: 0, dur: 5, avanco: 0, custo: 0 });

describe('avancoExibido', () => {
  it('mostra uma casa decimal e deixa o inteiro como está', () => {
    expect(avancoExibido(63.8686)).toBe(63.9);
    expect(avancoExibido(64)).toBe(64);
    expect(avancoExibido(0)).toBe(0);
  });

  it('não chega a 100 antes da hora', () => {
    expect(avancoExibido(99.96)).toBe(99.9);
    expect(avancoExibido(100)).toBe(100);
  });

  it('a sobra de ponto flutuante da média não tira o 100', () => {
    expect(avancoExibido(99.99999999999999)).toBe(100);
  });
});

describe('computeGroupValues: avanço do grupo', () => {
  // ESTRUTURA da obra ION (valores da Lista): 13 folhas a 100% e o "Teto 8º Tipo" a 50%
  // (dois filhos de metade do valor), mais 7 folhas a 0%.
  const valores100 = [285144.86, 95048.29, 273662.94, 91220.98, 533723.99, 789497.58, 426160.49,
    441080.54, 441080.54, 441080.54, 441080.54, 441080.54, 441080.54];
  const valores0 = [441080.54, 441080.54, 441080.54, 481196.44, 536127.00, 303674.75, 168205.78];
  const estrutura = [
    grupo('E', null),
    ...valores100.map((v, i) => folha(`a${i}`, 'E', 100, v)),
    grupo('T8', 'E'),
    folha('t8a', 'T8', 50, 220540.27),
    folha('t8b', 'T8', 50, 220540.27),
    ...valores0.map((v, i) => folha(`z${i}`, 'E', 0, v)),
  ];

  it('dá 63,87% na ESTRUTURA, não 64', () => {
    const gv = computeGroupValues(estrutura);
    expect(gv.E.avancoExato).toBeCloseTo(63.87, 2);
    expect(gv.E.avanco).toBe(63.9);
  });

  it('o pai usa o valor exato do filho, igual ao avanço das folhas de baixo', () => {
    // Três níveis, números propositalmente quebrados: com o filho arredondado o pai se afastava
    // da média das folhas.
    const etapas = [
      grupo('R', null),
      grupo('A', 'R'), grupo('B', 'R'),
      grupo('A1', 'A'), grupo('A2', 'A'),
      folha('f1', 'A1', 33, 1000), folha('f2', 'A1', 41, 700), folha('f3', 'A2', 7, 1300),
      folha('f4', 'A2', 88, 400), folha('f5', 'B', 52, 900), folha('f6', 'B', 19, 1700),
    ];
    const gv = computeGroupValues(etapas);
    const folhas = etapas.filter(e => !e.isGroup);
    expect(gv.R.avancoExato).toBeCloseTo(computeAvancoFisico(folhas), 9);
    expect(gv.A.avancoExato).toBeCloseTo(computeAvancoFisico(folhas.filter(e => ['f1', 'f2', 'f3', 'f4'].includes(e.id))), 9);
  });

  it('com valor vinculado (weightOverride) pondera pelo valor de cada filho, grupo inclusive', () => {
    const etapas = [grupo('R', null), grupo('A', 'R'), folha('f1', 'A', 100, 1), folha('f2', 'A', 0, 1), folha('f3', 'R', 0, 1)];
    // A vale 2 e f3 vale 2: A está a 50%, então R = (50*2 + 0*2) / 4 = 25.
    const gv = computeGroupValues(etapas, { R: 4, A: 2, f1: 1, f2: 1, f3: 2 });
    expect(gv.A.avanco).toBe(50);
    expect(gv.R.avanco).toBe(25);
  });

  it('todos os filhos a 100% fecha em 100, mesmo com valores quebrados', () => {
    const etapas = [grupo('R', null), folha('a', 'R', 100, 333.33), folha('b', 'R', 100, 666.67), folha('c', 'R', 100, 0.01)];
    expect(computeGroupValues(etapas).R.avanco).toBe(100);
  });

  it('quase completo não aparece como 100', () => {
    const etapas = [grupo('R', null), folha('a', 'R', 100, 9999), folha('b', 'R', 0, 1)];
    expect(computeGroupValues(etapas).R.avanco).toBe(99.9);
  });
});
