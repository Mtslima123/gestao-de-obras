import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { normalizar, paraIso, lerPlanilhaEfetivo, lerPlanilhaPrevisto, avisosDeContexto } from '../modules/maoDeObra/efetivo/importXlsxPure';

const funcoes = [
  { id: '1', nome: 'Almoxarife', ativo: true },
  { id: '2', nome: 'Aux. Técnico', ativo: true },
  { id: '3', nome: '1/2 Of. Carpinteiro', ativo: true },
  { id: '4', nome: 'Carpinteiro', ativo: true },
  { id: '5', nome: 'Vigia', ativo: false },
];

const CAB = ['FUNÇÃO', 'TOTAL EFETIVO', 'TRAB. NA ADM', 'TRAB. NO CANTEIRO', 'INSS/SEGURO', 'FÉRIAS', 'EMPREST/MANUT', 'DESTINO', 'RECEBIDO OUTRA OBRA', 'ORIGEM', 'ATIVOS'];

describe('normalizar e paraIso', () => {
  it('tira acento, caixa e pontuação', () => {
    expect(normalizar('Aux. Técnico')).toBe('AUX TECNICO');
    expect(normalizar('  1/2 Of.  Carpinteiro ')).toBe('1 2 OF CARPINTEIRO');
    expect(normalizar(null)).toBe('');
  });

  it('datas: serial do Excel, dd/mm/aaaa, aaaa-mm-dd; inválidas viram null', () => {
    expect(paraIso(46296)).toBe('2026-10-01');
    expect(paraIso('01/10/2026')).toBe('2026-10-01');
    expect(paraIso('1/5/26')).toBe('2026-05-01');
    expect(paraIso('2026-10-16')).toBe('2026-10-16');
    expect(paraIso('31/02/2026')).toBeNull();
    expect(paraIso('abc')).toBeNull();
    expect(paraIso(12)).toBeNull();
    expect(paraIso('')).toBeNull();
  });
});

describe('lerPlanilhaEfetivo', () => {
  it('lê o cabeçalho (DATA, OBRA), casa funções por nome normalizado e recalcula', () => {
    const rows = [
      ['EFETIVO DA OBRA'],
      ['DATA', '01/10/2026', null, 'OBRA', 'AAZ'],
      [],
      CAB,
      ['ALMOXARIFE', 1, 1, 0, null, null, null, null, null, null, 1],
      ['aux tecnico', 3, 0, 3, null, null, null, 'CRI/LEC', 1, 'DMS', 4],
      ['1/2 of. carpinteiro', 2, 0, 2, 0, 0, 0, null, 0, null, 2],
      ['TOTAL', 6, 1, 5, 0, 0, 0, null, 1, null, 7],
    ];
    const r = lerPlanilhaEfetivo(rows, funcoes);
    expect(r.erro).toBeUndefined();
    expect(r.itens).toHaveLength(3);
    expect(r.itens[1]).toMatchObject({ funcaoId: '2', totalEfetivo: 3, trabAdm: 0, recebidoOutraObra: 1, destino: 'CRI/LEC', origem: 'DMS' });
    expect(r.cabecalho).toEqual({ data: '2026-10-01', obra: 'AAZ' });
    expect(r.naoEncontradas).toEqual([]);
    expect(r.divergencias).toEqual([]);
  });

  it('ignora a coluna TRAB. NO CANTEIRO e confere ATIVOS contra o cálculo', () => {
    const rows = [CAB, ['Almoxarife', 4, 1, 99, 1, 0, 0, null, 2, null, 7]];
    const r = lerPlanilhaEfetivo(rows, funcoes);
    // ativos = total - inss - férias - emprest + recebido = 4 - 1 - 0 - 0 + 2 = 5 (a planilha diz 7)
    expect(r.divergencias).toEqual([{ nome: 'Almoxarife', planilha: 7, calculado: 5 }]);
  });

  it('função desconhecida, função inativa e título de grupo', () => {
    const rows = [
      CAB,
      ['ADMINISTRATIVO E TÉCNICO'],
      ['Almoxarife', 1, 1, 0, null, null, null, null, null, null, 1],
      ['Astronauta', 2, 0, 2, null, null, null, null, null, null, 2],
      ['Vigia', 1, 0, 1, null, null, null, null, null, null, 1],
    ];
    const r = lerPlanilhaEfetivo(rows, funcoes);
    expect(r.itens.map((i) => i.funcaoId)).toEqual(['1']);
    expect(r.naoEncontradas.map((n) => n.nome)).toEqual(['Astronauta', 'Vigia']);
  });

  it('valor inválido pula a linha com aviso; negativo no canteiro avisa; duplicada usa a primeira', () => {
    const rows = [
      CAB,
      ['Almoxarife', 'dois', 0, 0, null, null, null, null, null, null, null],
      ['Aux. Técnico', 1, 2, null, null, null, null, null, null, null, null],
      ['Carpinteiro', 5, 0, 5, null, null, null, null, null, null, 5],
      ['Carpinteiro', 6, 0, 6, null, null, null, null, null, null, 6],
    ];
    const r = lerPlanilhaEfetivo(rows, funcoes);
    expect(r.itens.map((i) => i.funcaoId)).toEqual(['2', '4']);
    expect(r.itens[1].totalEfetivo).toBe(5);
    expect(r.avisos.some((a) => a.includes('Almoxarife') && a.includes('TOTAL EFETIVO'))).toBe(true);
    expect(r.avisos.some((a) => a.includes('negativo'))).toBe(true);
    expect(r.avisos.some((a) => a.includes('mais de uma vez'))).toBe(true);
  });

  it('sem cabeçalho reconhecível ou sem nenhuma função conhecida devolve erro', () => {
    expect(lerPlanilhaEfetivo([['a', 'b'], [1, 2]], funcoes).erro).toMatch(/cabeçalho/);
    expect(lerPlanilhaEfetivo([CAB, ['Astronauta', 1, 0, 1, null, null, null, null, null, null, 1]], funcoes).erro).toMatch(/Nenhuma função/);
  });

  it('aceita vírgula e texto numérico ("3", "3,0" é inválido por não ser inteiro)', () => {
    const r = lerPlanilhaEfetivo([CAB, ['Almoxarife', '3', '1', null, null, null, null, null, null, null, null]], funcoes);
    expect(r.itens[0]).toMatchObject({ totalEfetivo: 3, trabAdm: 1 });
    const ruim = lerPlanilhaEfetivo([CAB, ['Almoxarife', '3,5', 0, null, null, null, null, null, null, null, null]], funcoes);
    expect(ruim.erro).toBeDefined();
  });
});

describe('avisosDeContexto', () => {
  const ctx = { obraCodigo: 'AAZ', obraNome: 'Edifício Aaz', ano: 2026, mes: 10, quinzena: 1 };
  it('sem aviso quando data e obra batem', () => {
    expect(avisosDeContexto({ data: '2026-10-01', obra: 'aaz' }, ctx)).toEqual([]);
  });
  it('avisa data de outra quinzena/mês e obra diferente', () => {
    expect(avisosDeContexto({ data: '2026-10-16', obra: null }, ctx)).toHaveLength(1);
    expect(avisosDeContexto({ data: '2026-09-01', obra: null }, ctx)).toHaveLength(1);
    expect(avisosDeContexto({ data: null, obra: 'BCO' }, ctx)).toHaveLength(1);
    expect(avisosDeContexto(null, ctx)).toEqual([]);
  });
});

describe('lerPlanilhaPrevisto', () => {
  const CABP = ['Função', 'Qtd/mês', 'Início', 'Término'];
  const padrao = { inicio: '2026-09-16', termino: '2027-10-31' };

  it('lê função, quantidade e datas (texto e serial do Excel)', () => {
    const r = lerPlanilhaPrevisto([CABP, ['Carpinteiro', 8, '01/05/2026', 46568], ['Almoxarife', '1', 46143, '31/10/2027']], funcoes, padrao);
    expect(r.erro).toBeUndefined();
    expect(r.itens).toEqual([
      { funcaoId: '4', qtdMes: 8, inicio: '2026-05-01', termino: '2027-06-30' },
      { funcaoId: '1', qtdMes: 1, inicio: '2026-05-01', termino: '2027-10-31' },
    ]);
  });

  it('data vazia usa a da obra; término antes do início e quantidade inválida vão para as inválidas', () => {
    const r = lerPlanilhaPrevisto([
      CABP,
      ['Carpinteiro', 2, null, null],
      ['Almoxarife', 1, '01/10/2026', '01/05/2026'],
      ['Aux. Técnico', 'x', '01/05/2026', '01/06/2026'],
    ], funcoes, padrao);
    expect(r.itens).toEqual([{ funcaoId: '4', qtdMes: 2, inicio: '2026-09-16', termino: '2027-10-31' }]);
    expect(r.invalidas.map((i) => i.motivo)).toEqual(['término antes do início', 'quantidade por mês inválida ("x")']);
  });

  it('só FUNÇÃO e QTD: usa as datas da obra e avisa', () => {
    const r = lerPlanilhaPrevisto([['Função', 'Quantidade'], ['Carpinteiro', 3]], funcoes, padrao);
    expect(r.itens[0]).toMatchObject({ inicio: '2026-09-16', termino: '2027-10-31' });
    expect(r.avisos[0]).toMatch(/INÍCIO e\/ou TÉRMINO/);
  });

  it('erro sem cabeçalho', () => {
    expect(lerPlanilhaPrevisto([['x', 'y']], funcoes).erro).toMatch(/cabeçalho/);
  });
});

describe('ida e volta por um .xlsx real', () => {
  it('lê o arquivo gerado pela lib xlsx do mesmo jeito que a tela lê', () => {
    const aoa = [
      ['DATA', '01/10/2026', null, 'OBRA', 'AAZ'],
      CAB,
      ['Almoxarife', 1, 1, 0, null, null, null, null, null, null, 1],
      ['Aux. Técnico', 3, 0, 3, null, null, null, 'CRI', 1, 'DMS', 4],
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Efetivo');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const lido = XLSX.read(buf, { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(lido.Sheets[lido.SheetNames[0]], { header: 1, raw: true, defval: null });
    const r = lerPlanilhaEfetivo(rows, funcoes);
    expect(r.erro).toBeUndefined();
    expect(r.itens).toHaveLength(2);
    expect(r.itens[1]).toMatchObject({ funcaoId: '2', totalEfetivo: 3, destino: 'CRI', origem: 'DMS' });
    expect(r.cabecalho).toEqual({ data: '2026-10-01', obra: 'AAZ' });
  });
});
