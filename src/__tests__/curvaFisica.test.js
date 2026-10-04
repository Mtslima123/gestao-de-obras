import { describe, it, expect } from 'vitest';
import { agregarDist, computeCurvaSeries, defaultBlId, defaultRepId, percentualPlanejadoAte } from '../modules/cronograma/curvaFisica';

const months = [{ key: '2026-09' }, { key: '2026-10' }, { key: '2026-11' }];

describe('agregarDist', () => {
  it('soma a distribuição por tarefa em total por mês', () => {
    expect(agregarDist({ a: { '2026-09': 10, '2026-10': 5 }, b: { '2026-10': 5 } }))
      .toEqual({ '2026-09': 10, '2026-10': 10 });
  });
});

describe('computeCurvaSeries', () => {
  const planned = { '2026-09': 25, '2026-10': 50, '2026-11': 25 };

  it('sem linha de base nem reprogramação: Real e Reprogramado seguem o plano ao vivo', () => {
    const s = computeCurvaSeries({ months, planned });
    expect(s.rrM).toEqual([25, 50, 25]);
    expect(s.rrA).toEqual([25, 75, 100]);
    expect(s.repA).toEqual(s.rrA);
    expect(s.blA).toEqual([0, 0, 0]);
    expect(s.difBL).toEqual([null, null, null]);
  });

  it('linha de base é relativa ao próprio total e gera a diferença acumulada', () => {
    const s = computeCurvaSeries({ months, planned, baselineDist: { '2026-09': 50, '2026-10': 50 } });
    expect(s.blA).toEqual([50, 100, 100]);
    expect(s.difBL).toEqual([-25, -25, 0]);
  });

  it('reprogramação é relativa ao total do plano ao vivo', () => {
    const s = computeCurvaSeries({ months, planned, repDist: { '2026-09': 50, '2026-10': 50 } });
    expect(s.repM).toEqual([50, 50, 0]);
    expect(s.difRep).toEqual([-25, -25, 0]);
  });
});

describe('seleção padrão', () => {
  it('linha de base: a mais recente', () => {
    expect(defaultBlId([{ id: 'a', criadaEm: '2026-01-01' }, { id: 'b', criadaEm: '2026-05-01' }])).toBe('b');
    expect(defaultBlId([])).toBeNull();
  });

  it('reprogramação: a mais recente antes do mês de referência', () => {
    const reps = [{ id: 'a', criadaEm: '2026-07-10' }, { id: 'b', criadaEm: '2026-09-05' }];
    expect(defaultRepId(reps, '2026-09')).toBe('a');
    expect(defaultRepId(reps, '2026-07')).toBe('b');
  });
});

describe('percentualPlanejadoAte', () => {
  const dist = { '2026-09': 30, '2026-10': 30, '2026-11': 40 };
  it('soma meses anteriores e a fração do mês atual pelos dias corridos', () => {
    // 15/10: setembro inteiro (30) + 15/31 de outubro (30) = 44,516... de 100
    expect(percentualPlanejadoAte(dist, new Date(2026, 9, 15))).toBeCloseTo(30 + 30 * 15 / 31, 6);
  });
  it('antes do início é 0 e depois do fim é 100', () => {
    expect(percentualPlanejadoAte(dist, new Date(2026, 7, 20))).toBe(0);
    expect(percentualPlanejadoAte(dist, new Date(2027, 0, 5))).toBe(100);
  });
  it('sem distribuição ou sem total, null', () => {
    expect(percentualPlanejadoAte(null)).toBeNull();
    expect(percentualPlanejadoAte({ '2026-09': 0 })).toBeNull();
  });
});
