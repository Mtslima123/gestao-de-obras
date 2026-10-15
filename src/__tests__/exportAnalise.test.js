import { describe, it, expect } from 'vitest';
import { mesDeAbs, mesesDaObra } from '../modules/maoDeObra/efetivo/efetivoStore';
import { TODOS, evolucao, kpisAnalise, linhasAnalise } from '../modules/maoDeObra/efetivo/analisePure';
import { LARGURAS_TABELA, fmt, montarAnalise, nomeArquivo, sg, titulo } from '../modules/maoDeObra/efetivo/exportAnalise';

const item = (funcaoId, totalEfetivo) => ({ apropriacaoId: 'x', funcaoId, totalEfetivo, trabAdm: 0, inssSeguro: 0, ferias: 0, emprestManut: 0, destino: null, recebidoOutraObra: 0, origem: null });
const apr = (mes, quinzena, status, itens) => ({ id: `${mes}-${quinzena}`, obraId: 'O1', ano: 2026, mes, quinzena, dataReferencia: '', status, lancadaEm: null, lancadaPor: null, itens });
const prev = (funcaoId, qtdMes) => ({ obraId: 'O1', funcaoId, qtdMes, inicio: '2026-09-01', termino: '2026-12-31' });

// Mesma obra do analisePure.test.js: Set/26 a Dez/26; Carpinteiro (1) e 1/2 Of. Carpinteiro (2) somam em "Carpinteiro".
const s = {
  obra: { id: 'O1', codigo: 'AAZ', inicio: '2026-09-01', termino: '2026-12-31', previstoTrancado: true },
  funcoes: [
    { id: '1', nome: 'Carpinteiro', grupoId: 'OFICIAL', classificacao: 'Carpinteiro', ativo: true },
    { id: '2', nome: '1/2 Of. Carpinteiro', grupoId: 'MEIO_OFICIAL', classificacao: 'Carpinteiro', ativo: true },
    { id: '3', nome: 'Servente', grupoId: 'SERVENTE', classificacao: null, ativo: true },
  ],
  classificacoes: ['Carpinteiro'],
  previsto: [prev('1', 4), prev('2', 2), prev('3', 10)],
  apropriacoes: [
    apr(9, 1, 'LANCADA', [item('1', 4), item('2', 2), item('3', 10)]),
    apr(10, 1, 'LANCADA', [item('1', 3), item('2', 2), item('3', 8)]),
    apr(10, 2, 'LANCADA', [item('1', 5), item('2', 1), item('3', 12)]),
  ],
};
const OUT = mesDeAbs(2026 * 12 + 9);
const meses = mesesDaObra(s.obra);
const montar = (extra = {}) => {
  const linhas = linhasAnalise(s, OUT, { verPor: 'funcao' });
  return montarAnalise({ s, mesSel: OUT, meses, opcao: 'Carpinteiro', linhas, evo: evolucao(s, meses, 2026 * 12 + 9), nA: kpisAnalise(s, OUT, linhas).nA, obraNome: 'Pulse', obraCodigo: 'AAZ', filtros: { verPor: 'funcao' }, ...extra });
};

describe('exportAnalise: montarAnalise', () => {
  it('projeção: KPIs do gráfico da função escolhida e a série mês a mês (realizado até o mês, projeção depois)', () => {
    const { projecao } = montar();
    expect(projecao.subtitulo).toBe('Carpinteiro');
    // Carpinteiro + 1/2 Of. Carpinteiro: orçado (4+2) x 4 meses = 24; realizado Set 6 + Out (5+1) = 12
    expect(projecao.kpis.map((k) => [k.rotulo, k.valor])).toEqual([
      ['Orçado', '24'], ['Realizado até Out/26', '12'], ['Saldo', '12'], ['Projeção/mês (2 meses)', '6'],
    ]);
    expect(projecao.pts.map((p) => [p.label, p.past, p.atual])).toEqual([['Set/26', true, false], ['Out/26', true, true], ['Nov/26', false, false], ['Dez/26', false, false]]);
    expect(projecao.pts[1]).toMatchObject({ v: 6, prev: 6 }); // Out: efetivo do mês = última quinzena (5+1); o 12 é o acumulado do KPI
    expect(projecao.pts[2]).toMatchObject({ v: 6, prev: 6, past: false }); // projeção = saldo / meses restantes
  });

  it('opção Todos soma todas as funções e usa o rótulo certo', () => {
    const { projecao } = montar({ opcao: TODOS });
    expect(projecao.subtitulo).toBe('Todas as funções somadas');
    expect(projecao.kpis[0].valor).toBe('64'); // (4+2+10) x 4
  });

  it('sem opção (obra sem previsto) não monta a projeção', () => {
    expect(montar({ opcao: undefined }).projecao).toBeNull();
  });

  it('evolução vai do início da obra até o mês corrente, com o mês selecionado marcado', () => {
    const { evolucao: e } = montar();
    expect(e.map((x) => [x.label, x.p, x.e, x.atual])).toEqual([['Set/26', 16, 16, false], ['Out/26', 16, 18, true]]);
  });

  it('tabela: saldo do mês, uso, status e cores iguais aos da tela', () => {
    const { tabela } = montar();
    const serv = tabela.linhas.find((l) => l.nome === 'Servente');
    expect(serv).toMatchObject({ p: 10, a1: 8, a2: 12, m: 12, saldoMes: -2, uso: 120, status: 'Acima do previsto', corStatus: '#b42318', corSaldoMes: '#b42318' });
    expect(tabela.titulo).toBe('Efetivo do mês por função');
    expect(tabela.primeiraColuna).toBe('Função');
  });

  it('por classificação muda título e primeira coluna', () => {
    const linhas = linhasAnalise(s, OUT, { verPor: 'classificacao' });
    const { tabela } = montar({ linhas, filtros: { verPor: 'classificacao' } });
    expect(tabela.titulo).toBe('Efetivo do mês por classificação');
    expect(tabela.primeiraColuna).toBe('Classificação');
    expect(tabela.linhas.find((l) => l.nome === 'Carpinteiro')).toMatchObject({ p: 6, m: 6 });
  });

  it('função sem apropriação lançada fica com valores nulos e status Pendente', () => {
    const vazio = { ...s, apropriacoes: [apr(10, 1, 'RASCUNHO', [item('1', 9)])] };
    const linhas = linhasAnalise(vazio, OUT);
    const { tabela } = montarAnalise({ s: vazio, mesSel: OUT, meses, opcao: 'Carpinteiro', linhas, evo: [], nA: 0, obraNome: 'Pulse', filtros: {} });
    const l = tabela.linhas.find((x) => x.nome === 'Carpinteiro');
    expect(l).toMatchObject({ m: null, saldoMes: null, uso: null, status: 'Pendente' });
  });

  it('subtítulo diz o mês, a quinzena usada e os filtros ativos', () => {
    expect(montar().subtitulo).toBe('Out/2026 · Efetivo do mês = última apropriação lançada (usando a 2ª quinzena)');
    const d = montar({ filtros: { verPor: 'funcao', grupoNome: 'Servente', ordemRotulo: 'maior desvio (qtd)' } });
    expect(d.subtitulo).toBe('Out/2026 · Efetivo do mês = última apropriação lançada (usando a 2ª quinzena) · Grupo: Servente · Ordem: maior desvio (qtd)');
  });
});

describe('exportAnalise: formatação e arquivo', () => {
  it('números em pt-BR com 1 casa; sinal e vazio em ASCII (a fonte do PDF não tem o "−")', () => {
    expect(fmt(2.5)).toBe('2,5');
    expect(fmt(null)).toBe('-');
    expect(sg(-1.5)).toBe('-1,5');
    expect(sg(3)).toBe('+3');
    expect(sg(0.01)).toBe('0');
  });

  it('larguras da tabela fecham os 277 mm úteis do A4 paisagem', () => {
    expect(LARGURAS_TABELA.reduce((a, b) => a + b, 0)).toBe(277);
  });

  it('título e nome do arquivo', () => {
    expect(titulo({ obraNome: 'Pulse', obraCodigo: 'SMK' })).toBe('Análise de Efetivo · Pulse');
    expect(titulo({ obraNome: '', obraCodigo: 'SMK' })).toBe('Análise de Efetivo · SMK');
    expect(nomeArquivo({ obraCodigo: 'SMK', ano: 2026, mes: 6 })).toBe('analise-efetivo-smk-2026-06.pdf');
  });
});
