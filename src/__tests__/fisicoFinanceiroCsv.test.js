// BUG-015: CSV pt-BR do Excel era lido pelo modo do .xlsx e o SheetJS adivinhava número pelas
// regras en-US: "57508397,12" virava 5750839712, "30,00%" virava 3000 e o código "001" virava 1.
// O app gravava isso sem nenhum erro. Estes testes usam a biblioteca xlsx de verdade.
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  ehArquivoCsv, lerPlanilhaFechamento, parseFechamentoSheet, getLinhaTotal, getDisciplinas, FAIXA_PERCENTUAL,
} from '../modules/fisicoFinanceiro/fisicoFinanceiroPure';

const CABECALHO = 'Código da Tarefa;Nome;Valor Orçamento Base;Valor Orçamento Atualizado;Previsto Linha de Base (%);Executado Físico (%);Gasto (%);Gasto (R$)';
const csvComMilhar = [
  CABECALHO,
  '001;Total da obra;50.000.000,00;57.508.397,12;30,00%;22,80%;22,80%;13.111.909,00',
  '001.01;Estrutura;10.000.000,00;12.345.678,90;45,00%;40,10%;35,55%;-4.389.012,34',
  '001.02;Fundação;5.000.000,00;5.500.000,00;12,50%;0,01%;100,00%;1.234,56',
].join('\r\n');
const csvSemMilhar = [
  CABECALHO,
  '001;Total da obra;50000000,00;57508397,12;30,00%;22,80%;22,80%;13111909,00',
  '001.01;Estrutura;10000000,00;12345678,90;45,00%;40,10%;35,55%;4389012,34',
].join('\r\n');

const comBom = (s) => new Uint8Array([0xEF, 0xBB, 0xBF, ...new TextEncoder().encode(s)]);
const ansi = (s) => new Uint8Array(Buffer.from(s, 'latin1')); // cp1252: o que o Excel pt-BR grava em "CSV (separado por vírgulas)"

const importar = (bytes, nome) => {
  const { aoa } = lerPlanilhaFechamento(XLSX, bytes, { nome });
  return parseFechamentoSheet(aoa);
};

describe('ehArquivoCsv', () => {
  it('reconhece .csv e .txt (qualquer caixa) e o tipo MIME', () => {
    expect(ehArquivoCsv('fechamento.csv')).toBe(true);
    expect(ehArquivoCsv('FECHAMENTO.CSV')).toBe(true);
    expect(ehArquivoCsv('dados.txt')).toBe(true);
    expect(ehArquivoCsv('sem-extensao', 'text/csv')).toBe(true);
  });
  it('não confunde com xlsx, xls e htm', () => {
    expect(ehArquivoCsv('a.xlsx')).toBe(false);
    expect(ehArquivoCsv('a.xls')).toBe(false);
    expect(ehArquivoCsv('a.htm')).toBe(false);
    expect(ehArquivoCsv('', '')).toBe(false);
    expect(ehArquivoCsv(undefined, undefined)).toBe(false);
  });
});

describe.each([
  ['UTF-8 com BOM', comBom],
  ['ANSI (cp1252)', ansi],
])('CSV pt-BR em %s', (_nome, codificar) => {
  it('lê valores, percentuais e códigos como o Excel mostra (com separador de milhar)', () => {
    const r = importar(codificar(csvComMilhar), 'fechamento.csv');
    expect(r.erros).toEqual([]);
    const total = getLinhaTotal(r.itens);
    expect(total.codigo).toBe('001');                       // com zero à esquerda, antes virava 1
    expect(total.valorOrcamentoBase).toBe(50000000);
    expect(total.valorOrcamentoAtualizado).toBeCloseTo(57508397.12, 2); // antes: 5750839712
    expect(total.previstoLinhaBase).toBeCloseTo(30, 5);     // antes: 3000
    expect(total.executadoFisico).toBeCloseTo(22.8, 5);     // antes: 2280
    expect(total.gastoPct).toBeCloseTo(22.8, 5);
    expect(total.gastoReal).toBeCloseTo(13111909, 2);
  });

  it('lê sem separador de milhar e com valor negativo', () => {
    const r = importar(codificar(csvSemMilhar), 'fechamento.csv');
    expect(r.erros).toEqual([]);
    expect(getLinhaTotal(r.itens).valorOrcamentoAtualizado).toBeCloseTo(57508397.12, 2);
    const [estrutura] = getDisciplinas(r.itens);
    expect(estrutura.codigo).toBe('001.01');
    expect(estrutura.gastoReal).toBeCloseTo(4389012.34, 2);

    const comNegativo = importar(codificar(csvComMilhar), 'fechamento.csv');
    expect(getDisciplinas(comNegativo.itens)[0].gastoReal).toBeCloseTo(-4389012.34, 2);
  });

  it('mantém acento no nome e lê o cabeçalho com acento', () => {
    const r = importar(codificar(csvComMilhar), 'fechamento.csv');
    expect(getDisciplinas(r.itens).map(d => d.nome)).toEqual(['Estrutura', 'Fundação']);
  });

  it('percentual pequeno e zero à esquerda nas disciplinas', () => {
    const r = importar(codificar(csvComMilhar), 'fechamento.csv');
    const fundacao = getDisciplinas(r.itens).find(d => d.codigo === '001.02');
    expect(fundacao.executadoFisico).toBeCloseTo(0.01, 5);
    expect(fundacao.gastoPct).toBeCloseTo(100, 5);
    expect(fundacao.gastoReal).toBeCloseTo(1234.56, 2);
  });
});

describe('.xlsx de verdade continua lido como antes', () => {
  it('percentual vem como fração do Excel (0.228) e sai em pontos percentuais', () => {
    const aoa = [
      CABECALHO.split(';'),
      ['001', 'Total da obra', 50000000, 57508397.12, 0.3, 0.228, 0.228, 13111909],
      ['001.01', 'Estrutura', 10000000, 12345678.9, 0.45, 0.401, 0.3555, 4389012.34],
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Físico Financeiro');
    const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));

    const r = importar(bytes, 'fechamento.xlsx');
    expect(r.erros).toEqual([]);
    const total = getLinhaTotal(r.itens);
    expect(total.executadoFisico).toBeCloseTo(22.8, 5);
    expect(total.previstoLinhaBase).toBeCloseTo(30, 5);
    expect(total.valorOrcamentoAtualizado).toBeCloseTo(57508397.12, 2);
  });
});

describe('trava de faixa dos percentuais (rede de proteção, qualquer formato)', () => {
  it('CSV lido pelo modo errado (o bug) agora é BLOQUEADO em vez de gravado', () => {
    // Reproduz a leitura antiga: XLSX.read sem raw e sheet_to_json raw:true.
    const wb = XLSX.read(ansi(csvComMilhar), { type: 'array' });
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
    const r = parseFechamentoSheet(aoa);
    expect(r.erros.length).toBeGreaterThan(0);
    expect(r.erros.join(' ')).toMatch(/fora do esperado/);
    expect(r.erros.join(' ')).toMatch(/Nada foi importado/);
  });

  it('bloqueia percentual da linha de total acima de 200 e abaixo de 0', () => {
    const base = [
      CABECALHO.split(';'),
      ['001', 'Total', '1,00', '1,00', '30,00%', '22,80%', '22,80%', '1,00'],
    ];
    expect(parseFechamentoSheet(base).erros).toEqual([]);

    const alto = JSON.parse(JSON.stringify(base)); alto[1][6] = '2280,00%';
    expect(parseFechamentoSheet(alto).erros.join(' ')).toMatch(/Gasto %.*2280/);

    const negativo = JSON.parse(JSON.stringify(base)); negativo[1][5] = '-5,00%';
    expect(parseFechamentoSheet(negativo).erros.join(' ')).toMatch(/Executado Físico %/);
  });

  it('aceita estouro de gasto até o limite e os extremos da faixa', () => {
    const linha = (gasto) => [CABECALHO.split(';'), ['001', 'Total', '1,00', '1,00', '0,00%', '100,00%', gasto, '1,00']];
    expect(parseFechamentoSheet(linha('120,00%')).erros).toEqual([]);
    expect(parseFechamentoSheet(linha('200,00%')).erros).toEqual([]);
    expect(parseFechamentoSheet(linha('200,01%')).erros.length).toBe(1);
    expect(FAIXA_PERCENTUAL).toEqual({ min: 0, max: 200 });
  });

  it('percentual fora da faixa numa disciplina só avisa, não bloqueia', () => {
    const aoa = [
      CABECALHO.split(';'),
      ['001', 'Total', '1,00', '1,00', '30,00%', '22,80%', '22,80%', '1,00'],
      ['001.01', 'Estrutura', '1,00', '1,00', '30,00%', '22,80%', '350,00%', '1,00'],
    ];
    const r = parseFechamentoSheet(aoa);
    expect(r.erros).toEqual([]);
    expect(r.avisos.join(' ')).toMatch(/Disciplina 001\.01.*350/);
  });
});
