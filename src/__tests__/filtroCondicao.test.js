// Filtros por condição do cabeçalho da Lista (igual a, diferente de, maior que, contém, entre...).
import { describe, it, expect } from 'vitest';
import {
  parseNumeroBR, passaCondicoes, condicoesValidas, alvoDaCondicao, tipoTemCondicoes, OPERADORES_FILTRO,
} from '../modules/cronograma/filtroCondicaoPure';

const num = (raw, label) => ({ tipo: 'number', raw, label: label ?? String(raw) });
const cond = (op, valor, valor2) => ({ op, valor, valor2 });
const passa = (filtro, linha) => passaCondicoes(filtro, linha);

describe('parseNumeroBR', () => {
  it.each([
    ['50', 50], ['50%', 50], ['12d', 12], ['1.234,56', 1234.56], ['R$ 1.000', 1000],
    ['0,5', 0.5], ['0.5', 0.5], ['0.250', 0.25], ['1.000', 1000], ['-3,2', -3.2], [7, 7],
  ])('%j vira %j', (entrada, esperado) => expect(parseNumeroBR(entrada)).toBe(esperado));
  it.each(['', '  ', 'abc', '1,2,3x', null, undefined, NaN])('%j não é número', (v) => expect(parseNumeroBR(v)).toBeNull());
});

describe('filtro de número', () => {
  const linhas = [0, 25, 50, 100].map(v => num(v));
  const quais = (filtro) => linhas.filter(l => passa(filtro, l)).map(l => l.raw);

  it('igual a / diferente de', () => {
    expect(quais({ condicoes: [cond('igual', '50')] })).toEqual([50]);
    expect(quais({ condicoes: [cond('diferente', '50')] })).toEqual([0, 25, 100]);
  });
  it('maior, maior ou igual, menor, menor ou igual', () => {
    expect(quais({ condicoes: [cond('maior', '25')] })).toEqual([50, 100]);
    expect(quais({ condicoes: [cond('maiorIgual', '25')] })).toEqual([25, 50, 100]);
    expect(quais({ condicoes: [cond('menor', '50')] })).toEqual([0, 25]);
    expect(quais({ condicoes: [cond('menorIgual', '50')] })).toEqual([0, 25, 50]);
  });
  it('entre vale nas duas pontas e aceita os limites invertidos', () => {
    expect(quais({ condicoes: [cond('entre', '25', '50')] })).toEqual([25, 50]);
    expect(quais({ condicoes: [cond('entre', '50', '25')] })).toEqual([25, 50]);
  });
  it('duas condições: E restringe, OU soma', () => {
    const duas = [cond('maior', '10'), cond('menor', '100')];
    expect(quais({ condicoes: duas, juncao: 'E' })).toEqual([25, 50]);
    expect(quais({ condicoes: [cond('igual', '0'), cond('igual', '100')], juncao: 'OU' })).toEqual([0, 100]);
  });
  it('valor com vírgula, % e R$ funciona', () => {
    expect(passa({ condicoes: [cond('maior', '1.000,50')] }, num(1500.75))).toBe(true);
    expect(passa({ condicoes: [cond('igual', '50%')] }, num(50))).toBe(true);
  });
  it('igual compara com duas casas (o que a tela mostra), sem ruído de ponto flutuante', () => {
    expect(passa({ condicoes: [cond('igual', '0,3')] }, num(0.1 + 0.2))).toBe(true);
  });
  it('em branco só passa em "diferente de"', () => {
    const branco = num(null, '');
    expect(passa({ condicoes: [cond('maior', '0')] }, branco)).toBe(false);
    expect(passa({ condicoes: [cond('igual', '0')] }, branco)).toBe(false);
    expect(passa({ condicoes: [cond('diferente', '0')] }, branco)).toBe(true);
  });
});

describe('filtro de texto', () => {
  const t = (label) => ({ tipo: 'text', raw: label, label });
  it('ignora maiúsculas e acentos', () => {
    expect(passa({ condicoes: [cond('igual', 'ALVENARIA')] }, t('Alvenaria'))).toBe(true);
    expect(passa({ condicoes: [cond('contem', 'instalacao')] }, t('Instalação elétrica'))).toBe(true);
  });
  it('começa com, termina com, contém, não contém, diferente de', () => {
    expect(passa({ condicoes: [cond('comeca', 'viaplus')] }, t('Viaplus Cisterna 01'))).toBe(true);
    expect(passa({ condicoes: [cond('comeca', 'cisterna')] }, t('Viaplus Cisterna 01'))).toBe(false);
    expect(passa({ condicoes: [cond('termina', '01')] }, t('Viaplus Cisterna 01'))).toBe(true);
    expect(passa({ condicoes: [cond('naoContem', 'poço')] }, t('Viaplus Poço dos elevadores'))).toBe(false);
    expect(passa({ condicoes: [cond('diferente', 'Subsolo 2')] }, t('Subsolo 1'))).toBe(true);
  });
  it('célula em branco: "não contém" e "diferente de" passam, "contém" não', () => {
    expect(passa({ condicoes: [cond('naoContem', 'x')] }, t(''))).toBe(true);
    expect(passa({ condicoes: [cond('diferente', 'x')] }, t(''))).toBe(true);
    expect(passa({ condicoes: [cond('contem', 'x')] }, t(''))).toBe(false);
  });
});

describe('filtro de data', () => {
  const d = (iso) => ({ tipo: 'date', raw: iso ? new Date(`${iso}T00:00:00`) : null, label: '' });
  it('igual, antes de e depois de, por dia', () => {
    expect(passa({ condicoes: [cond('igual', '2026-10-20')] }, d('2026-10-20'))).toBe(true);
    expect(passa({ condicoes: [cond('igual', '2026-10-20')] }, d('2026-10-21'))).toBe(false);
    expect(passa({ condicoes: [cond('maior', '2026-10-20')] }, d('2026-10-21'))).toBe(true);
    expect(passa({ condicoes: [cond('menor', '2026-10-20')] }, d('2026-10-19'))).toBe(true);
  });
  it('entre datas e data em branco', () => {
    const f = { condicoes: [cond('entre', '2026-10-01', '2026-10-31')] };
    expect(passa(f, d('2026-10-15'))).toBe(true);
    expect(passa(f, d('2026-11-01'))).toBe(false);
    expect(passa(f, d(null))).toBe(false);
    expect(passa({ condicoes: [cond('diferente', '2026-10-15')] }, d(null))).toBe(true);
  });
});

describe('condições incompletas e tipos', () => {
  it('condição sem valor (ou "entre" sem o 2º valor) não restringe e sai das válidas', () => {
    expect(passa({ condicoes: [cond('maior', '')] }, num(1))).toBe(true);
    expect(passa({ condicoes: [cond('entre', '5', '')] }, num(1))).toBe(true);
    expect(condicoesValidas([cond('maior', ''), cond('igual', '3'), cond('', '4')], 'number')).toEqual([cond('igual', '3')]);
  });
  it('alvoDaCondicao devolve null para valor inválido', () => {
    expect(alvoDaCondicao(cond('maior', 'abc'), 'number')).toBeNull();
    expect(alvoDaCondicao(cond('igual', ''), 'text')).toBeNull();
    expect(alvoDaCondicao(cond('igual', '2026-13'), 'date')).toBeNull();
  });
  it('só número, texto e data têm condições', () => {
    expect(['number', 'text', 'date'].every(tipoTemCondicoes)).toBe(true);
    expect(['boolean', 'enum', 'outro'].some(tipoTemCondicoes)).toBe(false);
    expect(OPERADORES_FILTRO.date.find(o => o.id === 'maior').rotulo).toBe('Depois de');
  });
});
