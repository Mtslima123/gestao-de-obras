import { describe, it, expect } from 'vitest';
import {
  orcamentoDaCarteira, avancoDaCarteira, curvaPrevista,
  indiceDoMes, distribuicaoPorStatus, pendenciasDaCarteira,
} from '../modules/dashboard/carteiraPure';
import { tempoRelativo, mesCurto } from '../utils/formatters';

describe('orcamentoDaCarteira', () => {
  it('soma um orçamento por obra', () => {
    const r = orcamentoDaCarteira([
      { obra_id: 'A', valor: '100', data: '2026-01-01' },
      { obra_id: 'B', valor: '250', data: '2026-01-01' },
    ]);
    expect(r.total).toBe(350);
    expect(r.porObra).toEqual({ A: 100, B: 250 });
  });

  it('com várias versões da mesma obra usa só a mais recente', () => {
    const r = orcamentoDaCarteira([
      { obra_id: 'A', valor: 300, data: '2026-05-01' },
      { obra_id: 'A', valor: 100, data: '2026-01-01' },
    ]);
    expect(r.total).toBe(300); // não 400
  });

  it('desempata pelo created_at quando a data é igual', () => {
    const r = orcamentoDaCarteira([
      { obra_id: 'A', valor: 100, data: '2026-01-01', created_at: '2026-01-01T10:00:00Z' },
      { obra_id: 'A', valor: 500, data: '2026-01-01', created_at: '2026-01-02T10:00:00Z' },
    ]);
    expect(r.total).toBe(500);
  });

  it('não filtra por status — os orçamentos reais estão em rascunho', () => {
    const r = orcamentoDaCarteira([{ obra_id: 'A', valor: 77, status: 'rascunho', data: '2026-01-01' }]);
    expect(r.total).toBe(77);
  });

  it('valor nulo ou texto não vira NaN', () => {
    const r = orcamentoDaCarteira([
      { obra_id: 'A', valor: null, data: '2026-01-01' },
      { obra_id: 'B', valor: 'abc', data: '2026-01-01' },
      { obra_id: 'C', valor: '10.5', data: '2026-01-01' },
    ]);
    expect(r.total).toBe(10.5);
  });

  it('lista vazia ou ausente devolve zero', () => {
    expect(orcamentoDaCarteira([]).total).toBe(0);
    expect(orcamentoDaCarteira(null).total).toBe(0);
  });

  it('ignora linha sem obra_id', () => {
    expect(orcamentoDaCarteira([{ valor: 999, data: '2026-01-01' }]).total).toBe(0);
  });
});

describe('avancoDaCarteira', () => {
  it('pondera pelo peso financeiro', () => {
    // obra grande em 10%, obra pequena em 100% → perto de 10, não 55
    const r = avancoDaCarteira([{ avanco: 10, peso: 900 }, { avanco: 100, peso: 100 }]);
    expect(r).toBeCloseTo(19, 6);
  });

  it('sem peso nenhum cai na média simples', () => {
    // é o caso real hoje: nenhuma obra tem custo orçado lançado
    expect(avancoDaCarteira([{ avanco: 20, peso: 0 }, { avanco: 40, peso: 0 }])).toBe(30);
  });

  it('carteira vazia é zero, não NaN', () => {
    expect(avancoDaCarteira([])).toBe(0);
    expect(avancoDaCarteira(null)).toBe(0);
  });

  it('ignora obra sem avanço numérico', () => {
    expect(avancoDaCarteira([{ avanco: 50, peso: 1 }, { avanco: undefined, peso: 9 }])).toBe(50);
  });
});

describe('curvaPrevista', () => {
  const distA = { t1: { '2026-01': 100, '2026-02': 100 } };
  const distB = { t2: { '2026-02': 200 } };

  it('soma as distribuições das obras por mês e acumula', () => {
    const c = curvaPrevista([distA, distB]);
    expect(c.map(p => p.mes)).toEqual(['2026-01', '2026-02']);
    expect(c.map(p => p.valor)).toEqual([100, 300]);
    expect(c.map(p => p.acumulado)).toEqual([100, 400]);
  });

  it('o percentual fecha em 100 no último mês', () => {
    const c = curvaPrevista([distA, distB]);
    expect(c[0].pct).toBeCloseTo(25, 6);
    expect(c[c.length - 1].pct).toBeCloseTo(100, 6);
  });

  it('ordena os meses cronologicamente mesmo fora de ordem', () => {
    const c = curvaPrevista([{ t: { '2026-12': 1, '2026-02': 1, '2026-07': 1 } }]);
    expect(c.map(p => p.mes)).toEqual(['2026-02', '2026-07', '2026-12']);
  });

  it('total zero não gera NaN no percentual', () => {
    const c = curvaPrevista([{ t: { '2026-01': 0, '2026-02': 0 } }]);
    expect(c.every(p => p.pct === 0)).toBe(true);
  });

  it('entrada vazia devolve curva vazia', () => {
    expect(curvaPrevista([])).toEqual([]);
    expect(curvaPrevista(null)).toEqual([]);
    expect(curvaPrevista([{}])).toEqual([]);
  });
});

describe('indiceDoMes', () => {
  const curva = [{ mes: '2026-08' }, { mes: '2026-09' }, { mes: '2026-10' }];

  it('acha o mês corrente', () => {
    expect(indiceDoMes(curva, new Date('2026-09-15T12:00:00'))).toBe(1);
  });

  it('devolve -1 quando hoje está fora da janela', () => {
    expect(indiceDoMes(curva, new Date('2027-01-10T12:00:00'))).toBe(-1);
  });

  it('curva vazia devolve -1', () => {
    expect(indiceDoMes([], new Date())).toBe(-1);
    expect(indiceDoMes(null, new Date())).toBe(-1);
  });
});

describe('distribuicaoPorStatus', () => {
  it('conta por status e traduz o rótulo', () => {
    const d = distribuicaoPorStatus([
      { status: 'em_andamento' }, { status: 'em_andamento' }, { status: 'concluida' },
    ]);
    expect(d).toEqual([
      { status: 'em_andamento', label: 'Em execução', color: 'var(--brand)', value: 2 },
      { status: 'concluida', label: 'Concluídas', color: 'var(--success)', value: 1 },
    ]);
  });

  it('status desconhecido ou ausente vira Outras, não é descartado', () => {
    const d = distribuicaoPorStatus([{ status: 'paralisada' }, {}]);
    expect(d.reduce((s, x) => s + x.value, 0)).toBe(2);
    expect(d.every(x => x.label === 'Outras')).toBe(true);
  });

  it('carteira vazia devolve lista vazia', () => {
    expect(distribuicaoPorStatus([])).toEqual([]);
    expect(distribuicaoPorStatus(null)).toEqual([]);
  });
});

describe('pendenciasDaCarteira', () => {
  it('aponta obra sem cronograma e não cobra orçamento dela', () => {
    const p = pendenciasDaCarteira([{ id: 'A', nome: 'Obra A', temCronograma: false, orcamento: 0, valorVinculado: 0 }]);
    expect(p).toHaveLength(1);
    expect(p[0].titulo).toContain('sem cronograma');
  });

  it('aponta obra sem orçamento', () => {
    const p = pendenciasDaCarteira([{ id: 'B', nome: 'Obra B', temCronograma: true, orcamento: 0, valorVinculado: 0 }]);
    expect(p[0].titulo).toContain('sem orçamento');
  });

  it('aponta orçamento não vinculado ao cronograma', () => {
    const p = pendenciasDaCarteira([{ id: 'C', nome: 'Obra C', temCronograma: true, orcamento: 500, valorVinculado: 0 }]);
    expect(p[0].titulo).toContain('sem vínculos');
    expect(p[0].tipo).toBe('info');
  });

  it('obra completa não gera pendência', () => {
    const p = pendenciasDaCarteira([{ id: 'D', nome: 'Obra D', temCronograma: true, orcamento: 500, valorVinculado: 500 }]);
    expect(p).toEqual([]);
  });
});

describe('formatters do dashboard', () => {
  const base = new Date('2026-09-03T12:00:00');

  it('tempoRelativo cobre a escala de minuto a data', () => {
    expect(tempoRelativo(new Date('2026-09-03T11:59:30'), base)).toBe('agora');
    expect(tempoRelativo(new Date('2026-09-03T11:30:00'), base)).toBe('há 30 min');
    expect(tempoRelativo(new Date('2026-09-03T10:00:00'), base)).toBe('há 2h');
    expect(tempoRelativo(new Date('2026-09-02T12:00:00'), base)).toBe('ontem');
    expect(tempoRelativo(new Date('2026-08-31T12:00:00'), base)).toBe('há 3 dias');
    // acima de 7 dias "há N dias" não localiza ninguém — mostra a data
    expect(tempoRelativo(new Date('2026-07-01T12:00:00'), base)).toBe('01/07/2026');
  });

  it('tempoRelativo trata data inválida e futuro', () => {
    expect(tempoRelativo('nao-e-data', base)).toBe('—');
    expect(tempoRelativo(null, base)).toBe('—');
    expect(tempoRelativo(new Date('2026-09-04T12:00:00'), base)).toBe('agora');
  });

  it('mesCurto formata a chave do mês', () => {
    expect(mesCurto('2026-09')).toBe('Set/26');
    expect(mesCurto('2026-01')).toBe('Jan/26');
    expect(mesCurto('2026-12')).toBe('Dez/26');
  });

  it('mesCurto não quebra com entrada inválida', () => {
    expect(mesCurto('')).toBe('');
    expect(mesCurto(null)).toBe('');
    expect(mesCurto('2026-13')).toBe('2026-13');
  });
});
