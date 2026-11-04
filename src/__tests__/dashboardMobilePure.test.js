// Dashboard na casca mobile (modules/mobile/full/dashboard): o preparo por obra, a ordem dos cartões e os
// números do Físico Financeiro. As contas em si são as do cronograma e do Físico Financeiro (já testadas);
// aqui se confere a orquestração e que bate com a regra do Dashboard do desktop.
import { describe, it, expect } from 'vitest';
import {
  obrasAtivasDe, montarCarteira, ordenarPorTermino, escolherObraFF, resumoFisicoFinanceiro,
  indicadoresFF, corCss,
} from '../modules/mobile/full/dashboard/dashboardMobilePure';
import { computeKPIs } from '../modules/fisicoFinanceiro/fisicoFinanceiroPure';

const folha = (id, avanco) => ({ id, parentId: null, isGroup: false, inicio: 0, dur: 5, avanco, custo: 0 });
const itemValor = (it) => it.valor;

describe('obrasAtivasDe', () => {
  it('tira as concluídas e mantém as demais', () => {
    const obras = [{ id: 'a', status: 'em_andamento' }, { id: 'b', status: 'concluida' }, { id: 'c' }];
    expect(obrasAtivasDe(obras).map(o => o.id)).toEqual(['a', 'c']);
  });
  it('lista ausente vira lista vazia', () => {
    expect(obrasAtivasDe(undefined)).toEqual([]);
  });
});

describe('montarCarteira', () => {
  const obrasAtivas = [
    { id: 'o1', nome: 'Alfa', sigla: 'ALF', status: 'em_andamento', area: '1000', dataFimObra: null },
    { id: 'o2', nome: 'Beta', status: 'em_andamento', area: null, dataFimObra: '2027-03-01' },
  ];
  const dados = {
    obrasAtivas,
    cronogramas: [{ obra_id: 'o1', etapas: [folha('a', 100), folha('b', 0)], baselines: [{ id: 'bl1' }], reprogramacoes: [] }],
    vinculos: [
      { obra_id: 'o1', etapa_id: 'a', orcamento_item_id: 'i1', orcamento_itens: { valor: 300 } },
      { obra_id: 'o1', etapa_id: 'b', orcamento_item_id: 'i2', orcamento_itens: { valor: 100 } },
    ],
    orcamentos: [
      { obra_id: 'o1', valor: 1000, data: '2026-01-01', created_at: '2026-01-01T10:00:00Z' },
      { obra_id: 'o1', valor: 2000, data: '2026-02-01', created_at: '2026-02-01T10:00:00Z' },
      { obra_id: 'o2', valor: 500, data: '2026-01-15', created_at: '2026-01-15T10:00:00Z' },
    ],
    fechamentos: [{ obra_id: 'o1', mes_referencia: '2026-10', itens: [{ codigo: '001', executadoFisico: 40, gastoPct: 35 }] }],
    itemValor,
  };
  const r = montarCarteira(dados);

  it('avanço físico ponderado pelo valor vinculado ao orçamento (300 a 100%, 100 a 0% = 75%)', () => {
    expect(r.porObra.find(o => o.id === 'o1').avanco).toBeCloseTo(75, 9);
  });

  it('sem vínculos o avanço cai na média simples das tarefas', () => {
    const sem = montarCarteira({ ...dados, vinculos: [] });
    expect(sem.porObra.find(o => o.id === 'o1').avanco).toBeCloseTo(50, 9);
  });

  it('obra sem cronograma: avanço 0 e sem fim de cronograma, mas aparece na lista', () => {
    const o2 = r.porObra.find(o => o.id === 'o2');
    expect(o2.avanco).toBe(0);
    expect(o2.fimCronograma).toBeNull();
    expect(r.curvaPorObra.o2.etapas).toEqual([]);
  });

  it('fim do cronograma sai como data ISO', () => {
    expect(r.porObra.find(o => o.id === 'o1').fimCronograma).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('orçamento da carteira: só o mais recente de cada obra (2000 + 500)', () => {
    expect(r.orcamentoTotal).toBe(2500);
  });

  it('sigla cai no id e área vira número', () => {
    const [o1, o2] = r.porObra;
    expect(o1.sigla).toBe('ALF');
    expect(o2.sigla).toBe('o2');
    expect(o1.area).toBe(1000);
    expect(o2.area).toBe(0);
  });

  it('guarda o último fechamento e o mês de cada obra', () => {
    expect(r.fechamentosPorObra.o1).toHaveLength(1);
    expect(r.mesFechamentoPorObra.o1).toBe('2026-10');
    expect(r.fechamentosPorObra.o2).toBeUndefined();
  });

  it('guarda linha de base e insumos da Curva S por obra', () => {
    expect(r.curvaPorObra.o1.baselines).toEqual([{ id: 'bl1' }]);
    expect(r.curvaPorObra.o1.etapas).toHaveLength(2);
    expect(r.curvaPorObra.o1.valorVinculadoMap).toEqual({ a: 300, b: 100 });
  });

  it('tudo vazio não quebra', () => {
    const v = montarCarteira({ obrasAtivas: [], itemValor });
    expect(v.porObra).toEqual([]);
    expect(v.orcamentoTotal).toBe(0);
  });
});

describe('ordenarPorTermino', () => {
  const o = (nome, dataFimObra, fimCronograma = null) => ({ nome, dataFimObra, fimCronograma });
  it('da que termina primeiro para a última', () => {
    const r = ordenarPorTermino([o('C', '2028-01-01'), o('A', '2026-06-01'), o('B', '2027-01-01')]);
    expect(r.map(x => x.nome)).toEqual(['A', 'B', 'C']);
  });
  it('sem data fim da obra usa o fim do cronograma', () => {
    const r = ordenarPorTermino([o('A', null, '2027-05-01'), o('B', '2027-01-01')]);
    expect(r.map(x => x.nome)).toEqual(['B', 'A']);
  });
  it('obra sem nenhuma data vai para o fim', () => {
    const r = ordenarPorTermino([o('Sem', null), o('Com', '2030-01-01')]);
    expect(r.map(x => x.nome)).toEqual(['Com', 'Sem']);
  });
  it('empate desempata pelo nome e não altera a lista original', () => {
    const entrada = [o('Zeta', '2027-01-01'), o('Alfa', '2027-01-01')];
    expect(ordenarPorTermino(entrada).map(x => x.nome)).toEqual(['Alfa', 'Zeta']);
    expect(entrada[0].nome).toBe('Zeta');
  });
  it('lista ausente vira vazia', () => {
    expect(ordenarPorTermino(undefined)).toEqual([]);
  });
});

describe('escolherObraFF', () => {
  const obrasAtivas = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  it('mantém a escolhida enquanto ela estiver na lista', () => {
    expect(escolherObraFF({ obrasAtivas, obraFiltro: 'c', fechamentosPorObra: { b: [] } })).toBe('c');
  });
  it('sem escolha, a primeira que tem fechamento importado', () => {
    expect(escolherObraFF({ obrasAtivas, obraFiltro: null, fechamentosPorObra: { b: [{}] } })).toBe('b');
  });
  it('escolhida que saiu da lista volta para a regra acima', () => {
    expect(escolherObraFF({ obrasAtivas, obraFiltro: 'x', fechamentosPorObra: { c: [{}] } })).toBe('c');
  });
  it('sem nenhum fechamento, a primeira da lista', () => {
    expect(escolherObraFF({ obrasAtivas, fechamentosPorObra: {} })).toBe('a');
  });
  it('sem obras, texto vazio (o select fica sem opção)', () => {
    expect(escolherObraFF({ obrasAtivas: [], fechamentosPorObra: {} })).toBe('');
  });
});

describe('resumoFisicoFinanceiro', () => {
  it('execução, gasto e delta em pontos percentuais', () => {
    const r = resumoFisicoFinanceiro([{ codigo: '001', executadoFisico: 40, gastoPct: 35 }]);
    expect(r).toEqual({ execFisico: 40, gastoPct: 35, delta: 5, cor: 'success' });
  });
  it('gasto à frente do físico dá delta negativo em vermelho', () => {
    const r = resumoFisicoFinanceiro([{ codigo: '001', executadoFisico: 30, gastoPct: 38.5 }]);
    expect(r.delta).toBeCloseTo(-8.5, 9);
    expect(r.cor).toBe('danger');
  });
  it('delta zero é neutro', () => {
    expect(resumoFisicoFinanceiro([{ codigo: '001', executadoFisico: 20, gastoPct: 20 }]).cor).toBe('neutral');
  });
  it('usa só a linha de total da obra (código sem ponto), não as disciplinas', () => {
    const r = resumoFisicoFinanceiro([
      { codigo: '001.01', executadoFisico: 99, gastoPct: 1 },
      { codigo: '001', executadoFisico: 10, gastoPct: 5 },
    ]);
    expect(r.execFisico).toBe(10);
  });
  it('sem fechamento ou sem linha de total: null', () => {
    expect(resumoFisicoFinanceiro(undefined)).toBeNull();
    expect(resumoFisicoFinanceiro([])).toBeNull();
    expect(resumoFisicoFinanceiro([{ codigo: '001.01', executadoFisico: 1 }])).toBeNull();
  });
  it('campos ausentes contam como zero', () => {
    expect(resumoFisicoFinanceiro([{ codigo: '001' }])).toEqual({ execFisico: 0, gastoPct: 0, delta: 0, cor: 'neutral' });
  });
});

describe('indicadoresFF', () => {
  const kpis = computeKPIs([{
    codigo: '001', valorOrcamentoAtualizado: 1000, executadoFisico: 50, gastoPct: 40,
    savingReal: 10, ganhosInccReal: -5, tendencia: 900,
  }]);
  const ind = indicadoresFF(kpis);

  it('os 4 indicadores do desktop, na mesma ordem', () => {
    expect(ind.map(i => i.rotulo)).toEqual(['Delta Físico × Financeiro', 'Saving', 'Ganhos em INCC', 'Tendência de Fechamento']);
  });
  it('valores e cores vêm dos KPIs do Físico Financeiro', () => {
    const por = Object.fromEntries(ind.map(i => [i.chave, i]));
    expect(por.delta.pct).toBeCloseTo(10, 9);
    expect(por.delta.real).toBeCloseTo(100, 9);
    expect(por.delta.cor).toBe('success');
    expect(por.saving.pct).toBeCloseTo(1, 9);
    expect(por.incc.pct).toBeCloseTo(-0.5, 9);
    expect(por.incc.cor).toBe('danger');
    expect(por.tendencia.pct).toBeCloseTo(10, 9);
    expect(por.tendencia.cor).toBe('success');
  });
  it('sem KPIs (obra sem fechamento): lista vazia', () => {
    expect(indicadoresFF(null)).toEqual([]);
  });
});

describe('corCss', () => {
  it('sinais semânticos viram variável de cor; neutro e ausente, cinza', () => {
    expect(corCss('success')).toBe('var(--success)');
    expect(corCss('danger')).toBe('var(--danger)');
    expect(corCss('neutral')).toBe('var(--text-muted)');
    expect(corCss(undefined)).toBe('var(--text-muted)');
  });
});
