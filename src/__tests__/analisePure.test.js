import { describe, it, expect } from 'vitest';
import { mesDeAbs, mesesDaObra } from '../modules/maoDeObra/efetivo/efetivoStore';
import { evolucao, kpisAnalise, linhasAnalise, opcoesClassificacao, saldoPorGrupo, serieProjecao } from '../modules/maoDeObra/efetivo/analisePure';

const item = (funcaoId, totalEfetivo) => ({ apropriacaoId: 'x', funcaoId, totalEfetivo, trabAdm: 0, inssSeguro: 0, ferias: 0, emprestManut: 0, destino: null, recebidoOutraObra: 0, origem: null });
const apr = (mes, quinzena, status, itens) => ({ id: `${mes}-${quinzena}`, obraId: 'O1', ano: 2026, mes, quinzena, dataReferencia: '', status, lancadaEm: null, lancadaPor: null, itens });
const prev = (funcaoId, qtdMes, inicio = '2026-09-01', termino = '2026-12-31') => ({ obraId: 'O1', funcaoId, qtdMes, inicio, termino });

// Obra Set/26 a Dez/26. Carpinteiro (id 1) e 1/2 Of. Carpinteiro (id 2) somam na classificação
// "Carpinteiro"; Servente (id 3) é a própria classificação.
const estado = (apropriacoes) => ({
  obra: { id: 'O1', codigo: 'AAZ', inicio: '2026-09-01', termino: '2026-12-31', previstoTrancado: true },
  funcoes: [
    { id: '1', nome: 'Carpinteiro', grupoId: 'OFICIAL', classificacao: 'Carpinteiro', ativo: true },
    { id: '2', nome: '1/2 Of. Carpinteiro', grupoId: 'MEIO_OFICIAL', classificacao: 'Carpinteiro', ativo: true },
    { id: '3', nome: 'Servente', grupoId: 'SERVENTE', classificacao: null, ativo: true },
    { id: '4', nome: 'Vigia', grupoId: 'APOIO', classificacao: null, ativo: false },
  ],
  classificacoes: ['Carpinteiro'],
  previsto: [prev('1', 4), prev('2', 2), prev('3', 10)],
  apropriacoes,
});
const OUT = mesDeAbs(2026 * 12 + 9);

const base = estado([
  apr(9, 1, 'LANCADA', [item('1', 4), item('2', 2), item('3', 10)]),
  apr(10, 1, 'LANCADA', [item('1', 3), item('2', 2), item('3', 8)]),
  apr(10, 2, 'LANCADA', [item('1', 5), item('2', 1), item('3', 12)]),
]);

describe('linhasAnalise', () => {
  it('por função usa o efetivo da última quinzena lançada e o saldo acumulado', () => {
    const l = linhasAnalise(base, OUT, { verPor: 'funcao' });
    const carp = l.find((x) => x.nome === 'Carpinteiro');
    expect(carp).toMatchObject({ p: 4, a1: 3, a2: 5, m: 5 });
    expect(carp.ac).toBe((4 - 4) + (4 - 5)); // Set: 4-4, Out: 4-5
    expect(l.find((x) => x.nome === 'Servente')).toMatchObject({ p: 10, a1: 8, a2: 12, m: 12 });
  });

  it('função inativa não aparece', () => {
    expect(linhasAnalise(base, OUT).some((x) => x.nome === 'Vigia')).toBe(false);
  });

  it('por classificação soma as funções da mesma classificação', () => {
    const l = linhasAnalise(base, OUT, { verPor: 'classificacao' });
    const c = l.find((x) => x.nome === 'Carpinteiro');
    expect(c).toMatchObject({ p: 6, a1: 5, a2: 6, m: 6 });
    expect(c.sub).toBe('Classificação · Carpinteiro + 1/2 Of. Carpinteiro');
    expect(l.find((x) => x.nome === 'Servente').sub).toBe('Servente');
  });

  it('filtra por grupo e ordena por maior desvio', () => {
    expect(linhasAnalise(base, OUT, { grupoF: 'SERVENTE' }).map((x) => x.nome)).toEqual(['Servente']);
    const porDesvio = linhasAnalise(base, OUT, { ordem: 'desvio' }).map((x) => x.nome);
    expect(porDesvio[0]).toBe('Servente'); // |12-10| = 2 é o maior
  });

  it('rascunho não entra: sem lançada o efetivo é nulo', () => {
    const s = estado([apr(10, 1, 'RASCUNHO', [item('1', 9)])]);
    const carp = linhasAnalise(s, OUT).find((x) => x.nome === 'Carpinteiro');
    expect(carp.m).toBeNull();
    expect(carp.a1).toBeNull();
    expect(carp.ac).toBeNull();
  });
});

describe('kpisAnalise', () => {
  it('totais do mês, acumulado e quantas funções estão acima do previsto', () => {
    const linhas = linhasAnalise(base, OUT);
    const k = kpisAnalise(base, OUT, linhas);
    expect(k.previsto).toBe(16);
    expect(k.efetivo).toBe(5 + 1 + 12);
    expect(k.nA).toBe(2);
    expect(k.acima).toBe(2); // Carpinteiro (5 > 4) e Servente (12 > 10)
    // acumulado: Carpinteiro (-1) + 1/2 Of (0 + 1 = +1) + Servente (0 + -2)
    expect(k.acumulado).toBe(-1 + 1 + -2);
  });

  it('só a 1ª lançada: nA = 1', () => {
    const s = estado([apr(10, 1, 'LANCADA', [item('1', 3)]), apr(10, 2, 'RASCUNHO', [item('1', 9)])]);
    expect(kpisAnalise(s, OUT, linhasAnalise(s, OUT)).nA).toBe(1);
  });
});

describe('serieProjecao', () => {
  it('realizado até o mês selecionado e projeção constante = saldo ÷ meses restantes', () => {
    const fs = base.funcoes.filter((f) => f.classificacao === 'Carpinteiro');
    const r = serieProjecao(base, fs, OUT, mesesDaObra(base.obra));
    // orçado: (4+2) × 4 meses = 24; consumido: Set 6, Out 6 = 12; saldo 12; restam Nov e Dez
    expect(r).toMatchObject({ tot: 24, cons: 12, saldo: 12, rest: 2, proj: 6, qtd: 6 });
    expect(r.pts.map((p) => [p.m.label, p.past, p.v, p.prev])).toEqual([
      ['Set/26', true, 6, 6], ['Out/26', true, 6, 6], ['Nov/26', false, 6, 6], ['Dez/26', false, 6, 6],
    ]);
  });

  it('projeção nunca fica negativa quando o orçado foi excedido', () => {
    const s = estado([apr(9, 1, 'LANCADA', [item('1', 30)]), apr(10, 1, 'LANCADA', [item('1', 30)])]);
    const r = serieProjecao(s, [s.funcoes[0]], OUT, mesesDaObra(s.obra));
    expect(r.saldo).toBeLessThan(0);
    expect(r.pts.filter((p) => !p.past).every((p) => p.v === 0)).toBe(true);
  });

  it('no último mês da obra não há meses restantes', () => {
    const dez = mesDeAbs(2026 * 12 + 11);
    const r = serieProjecao(base, [base.funcoes[0]], dez, mesesDaObra(base.obra));
    expect(r.rest).toBe(0);
    expect(r.proj).toBe(0);
  });
});

describe('demais seletores', () => {
  it('opções do gráfico: classificações em ordem alfabética, sem funções inativas', () => {
    expect(opcoesClassificacao(base)).toEqual(['Carpinteiro', 'Servente']);
  });

  it('evolução vai do início da obra até o mês pedido', () => {
    const meses = mesesDaObra(base.obra);
    const e = evolucao(base, meses, 2026 * 12 + 9);
    expect(e.map((x) => x.m.label)).toEqual(['Set/26', 'Out/26']);
    expect(e[1]).toMatchObject({ p: 16, e: 18 });
    expect(evolucao(base, meses, 2026 * 12 + 7)).toEqual([]);
  });

  it('saldo por grupo só lista grupos com previsto ou efetivo', () => {
    const g = saldoPorGrupo(base, OUT);
    expect(g.map((x) => x.g.id)).toEqual(['OFICIAL', 'MEIO_OFICIAL', 'SERVENTE']);
    expect(g.find((x) => x.g.id === 'SERVENTE')).toMatchObject({ p: 10, m: 12, ac: -2 });
  });
});
