// Testes de teclaNativaNoCampo: "digitar direto" numa célula de DATA da Lista não pode cancelar
// a tecla nem semear o caractere por script. O input de data nativo ignora o valor semeado
// ("0" não é data válida) e o preventDefault cancelava o keypress, então o 1º dígito se perdia:
// o dia ficava com um dígito só (sem pular pro mês) e a digitação seguinte caía de novo no dia
// (01/02 virava 10/02). Para dígito em coluna de data a tecla vai nativa pro campo já focado.
import { describe, it, expect } from 'vitest';
import { teclaNativaNoCampo, resolveColType } from '../modules/cronograma/cronogramaShared';

const colsCustom = [
  { id: 'cc_data',  type: 'date' },
  { id: 'cc_texto', type: 'text' },
  { id: 'cc_valor', type: 'currency' },
];
const tipo = (colId) => resolveColType(colId, colsCustom);

describe('teclaNativaNoCampo', () => {
  it('as colunas de data da Lista são tipo date (protege contra renomear o tipo e reintroduzir o bug)', () => {
    expect(tipo('inicio')).toBe('date');
    expect(tipo('fim')).toBe('date');
    expect(tipo('restricao')).toBe('date');
    expect(tipo('cc_data')).toBe('date');
  });

  it('dígito em coluna de data vai nativo pro campo (Início, Término, Restrição e personalizada)', () => {
    for (const col of ['inicio', 'fim', 'restricao', 'cc_data']) {
      for (const d of '0123456789') expect(teclaNativaNoCampo(tipo(col), d)).toBe(true);
    }
  });

  it('letra, símbolo, espaço e separador em coluna de data seguem o caminho de sempre', () => {
    for (const t of ['a', 'Z', '/', '-', '.', ' ', '+', '!']) {
      expect(teclaNativaNoCampo('date', t)).toBe(false);
    }
  });

  it('dígito em coluna de texto ou número continua semeado (só data é tratada à parte)', () => {
    for (const col of ['etapa', 'responsavel', 'duracao', 'avanco', 'cc_texto', 'cc_valor']) {
      expect(teclaNativaNoCampo(tipo(col), '5')).toBe(false);
    }
  });

  it('tecla ausente ou com mais de um caractere (Enter, ArrowDown, F2) não conta', () => {
    expect(teclaNativaNoCampo('date', undefined)).toBe(false);
    expect(teclaNativaNoCampo('date', null)).toBe(false);
    expect(teclaNativaNoCampo('date', '')).toBe(false);
    expect(teclaNativaNoCampo('date', 'Enter')).toBe(false);
    expect(teclaNativaNoCampo('date', '12')).toBe(false);
  });
});
