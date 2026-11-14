import { describe, it, expect } from 'vitest';
import { escaparCelula, montarTextoDaGrade, textoExibidoParaPlanilha, mesmoTextoCopiado } from '../modules/cronograma/copiaParaPlanilha';

// Ctrl+C na Lista de Tarefas: o que o Excel recebe. O defeito original: coluna calculada (Valor Total, WBS, Peso...)
// saía vazia, linha de grupo copiava o campo do próprio grupo e nome com aspas ou quebra de linha partia a linha em duas.
describe('escaparCelula', () => {
  it('texto simples fica como está', () => {
    expect(escaparCelula('Estacas')).toBe('Estacas');
    expect(escaparCelula('1.500,50')).toBe('1.500,50');
  });
  it('vazio, null e undefined viram texto vazio', () => {
    expect(escaparCelula('')).toBe('');
    expect(escaparCelula(null)).toBe('');
    expect(escaparCelula(undefined)).toBe('');
  });
  it('número vira texto', () => {
    expect(escaparCelula(0)).toBe('0');
  });
  it('quebra de linha, tabulação e aspas vão entre aspas, com as aspas de dentro dobradas', () => {
    expect(escaparCelula('Bloco\ncom quebra')).toBe('"Bloco\ncom quebra"');
    expect(escaparCelula('a\tb')).toBe('"a\tb"');
    expect(escaparCelula('Porta 2,10" x 90')).toBe('"Porta 2,10"" x 90"');
    expect(escaparCelula('Bloco "B"')).toBe('"Bloco ""B"""');
  });
});

describe('montarTextoDaGrade', () => {
  it('separa colunas por tabulação e linhas por quebra de linha, sem quebra no fim', () => {
    expect(montarTextoDaGrade([['a', 'b'], ['c', 'd']])).toBe('a\tb\nc\td');
  });
  it('uma coluna só de valores sai uma linha por valor (o caso do Valor Total)', () => {
    expect(montarTextoDaGrade([['5.487.920,69'], ['0,00'], ['38.906,68']])).toBe('5.487.920,69\n0,00\n38.906,68');
  });
  it('célula com quebra de linha não vira linha nova: continua uma célula só', () => {
    const texto = montarTextoDaGrade([['x', 'Bloco\ncom quebra'], ['y', 'z']]);
    expect(texto).toBe('x\t"Bloco\ncom quebra"\ny\tz');
  });
  it('grade vazia dá texto vazio', () => {
    expect(montarTextoDaGrade([])).toBe('');
  });
});

describe('textoExibidoParaPlanilha', () => {
  it('colunas de dinheiro saem só com o número em formato brasileiro, sem R$', () => {
    ['custo', 'custoReal', 'custoOrcado', 'saldo', 'valorVinculado'].forEach((col) => {
      expect(textoExibidoParaPlanilha(col, { raw: 5487920.69, label: 'R$ 5.487.920,69' })).toBe('5.487.920,69');
    });
  });
  it('dinheiro zero sai 0,00 (a tela mostra R$ 0,00)', () => {
    expect(textoExibidoParaPlanilha('custoOrcado', { raw: 0, label: 'R$ 0,00' })).toBe('0,00');
  });
  it('dinheiro negativo mantém o sinal', () => {
    expect(textoExibidoParaPlanilha('saldo', { raw: -1500.5, label: '-R$ 1.500,50' })).toBe('-1.500,50');
  });
  it('Valor Vinculado sem vínculo (raw null) sai vazio, como na tela', () => {
    expect(textoExibidoParaPlanilha('valorVinculado', { raw: null, label: '' })).toBe('');
  });
  it('Peso sai com vírgula decimal e %', () => {
    expect(textoExibidoParaPlanilha('peso', { raw: 12.9, label: '12.9%' })).toBe('12,9%');
    expect(textoExibidoParaPlanilha('peso', { raw: 0.1, label: '0.1%' })).toBe('0,1%');
  });
  it('Peso de grupo (sem valor) sai vazio', () => {
    expect(textoExibidoParaPlanilha('peso', { raw: null, label: '' })).toBe('');
  });
  it('duração e avanço saem como número puro, igual à linha de tarefa', () => {
    expect(textoExibidoParaPlanilha('duracao', { raw: 30, label: '30d' })).toBe('30');
    expect(textoExibidoParaPlanilha('avanco', { raw: 50, label: '50%' })).toBe('50');
  });
  it('avanço e duração de grupo com casas decimais saem com vírgula e no máximo 2 casas', () => {
    expect(textoExibidoParaPlanilha('avanco', { raw: 0.3, label: '0.3%' })).toBe('0,3');
    expect(textoExibidoParaPlanilha('avanco', { raw: 33.33333333, label: '33.33333333%' })).toBe('33,33');
    expect(textoExibidoParaPlanilha('duracao', { raw: 12.5, label: '12.5d' })).toBe('12,5');
  });
  it('avanço ou duração sem número saem vazios', () => {
    expect(textoExibidoParaPlanilha('avanco', { raw: null, label: '' })).toBe('');
    expect(textoExibidoParaPlanilha('duracao', { raw: undefined, label: '' })).toBe('');
  });
  it('datas saem em AAAA-MM-DD, o mesmo formato que a tarefa copia (usa o dia local, sem virar o dia anterior)', () => {
    expect(textoExibidoParaPlanilha('inicio', { raw: new Date(2027, 7, 14), label: '14/08/2027' })).toBe('2027-08-14');
    expect(textoExibidoParaPlanilha('fim', { raw: new Date(2027, 0, 1), label: '01/01/2027' })).toBe('2027-01-01');
  });
  it('data inválida cai no rótulo', () => {
    expect(textoExibidoParaPlanilha('inicio', { raw: new Date(NaN), label: 'x' })).toBe('x');
  });
  it('colunas de texto saem pelo rótulo da tela', () => {
    expect(textoExibidoParaPlanilha('wbs', { raw: '1.3.5.2', label: '1.3.5.2' })).toBe('1.3.5.2');
    expect(textoExibidoParaPlanilha('modo', { raw: 'Manual', label: 'Manual' })).toBe('Manual');
    expect(textoExibidoParaPlanilha('status', { raw: 'Atrasada', label: 'Atrasada' })).toBe('Atrasada');
    expect(textoExibidoParaPlanilha('participa', { raw: 'Sim', label: 'Sim' })).toBe('Sim');
    expect(textoExibidoParaPlanilha('fatorPeso', { raw: 0.5, label: '0,5' })).toBe('0,5');
  });
  it('sem rótulo ou sem argumento não quebra', () => {
    expect(textoExibidoParaPlanilha('resp', { raw: null, label: null })).toBe('');
    expect(textoExibidoParaPlanilha('resp')).toBe('');
  });
});

describe('mesmoTextoCopiado', () => {
  it('igual é igual', () => {
    expect(mesmoTextoCopiado('a\tb\nc\td', 'a\tb\nc\td')).toBe(true);
  });
  it('ignora a diferença \\n x \\r\\n que o Windows pode introduzir', () => {
    expect(mesmoTextoCopiado('a\nb', 'a\r\nb')).toBe(true);
    expect(mesmoTextoCopiado('a\r\nb', 'a\nb')).toBe(true);
  });
  it('texto diferente não vale como cópia interna', () => {
    expect(mesmoTextoCopiado('a\nb', 'a\nc')).toBe(false);
  });
  it('sem texto gravado ou sem texto colado nunca vale', () => {
    expect(mesmoTextoCopiado(null, 'a')).toBe(false);
    expect(mesmoTextoCopiado('a', null)).toBe(false);
    expect(mesmoTextoCopiado(undefined, undefined)).toBe(false);
  });
  it('texto vazio gravado e colado vazio é igual (coluna toda sem valor)', () => {
    expect(mesmoTextoCopiado('', '')).toBe(true);
  });
});
