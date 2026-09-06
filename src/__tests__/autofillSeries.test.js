// Testes de computeAutofillSeries — alça de preenchimento estilo Excel da Lista.
// Função pura, roda em node.
import { describe, it, expect } from 'vitest';
import { computeAutofillSeries } from '../modules/cronograma/autofillSeries';

describe('computeAutofillSeries', () => {
  it('1 célula com número no fim: incrementa 1 por linha preservando o prefixo', () => {
    expect(computeAutofillSeries(['Teto tipo 1'], 3)).toEqual(['Teto tipo 2', 'Teto tipo 3', 'Teto tipo 4']);
  });

  it('1 célula sem número: repete o mesmo texto', () => {
    expect(computeAutofillSeries(['Alvenaria'], 3)).toEqual(['Alvenaria', 'Alvenaria', 'Alvenaria']);
  });

  it('1 célula número puro (sem prefixo): repete o mesmo valor', () => {
    expect(computeAutofillSeries(['5'], 3)).toEqual(['5', '5', '5']);
  });

  it('2 células, passo 1: continua a sequência', () => {
    expect(computeAutofillSeries(['tipo 1', 'tipo 2'], 5)).toEqual(['tipo 3', 'tipo 4', 'tipo 5', 'tipo 6', 'tipo 7']);
  });

  it('2 células, passo diferente de 1: mantém o passo', () => {
    expect(computeAutofillSeries(['item 5', 'item 10'], 3)).toEqual(['item 15', 'item 20', 'item 25']);
  });

  it('preserva zero-padding do último valor', () => {
    expect(computeAutofillSeries(['item 08', 'item 09'], 2)).toEqual(['item 10', 'item 11']);
  });

  it('prefixos inconsistentes: cicla o bloco original', () => {
    expect(computeAutofillSeries(['Segunda', 'Terça'], 3)).toEqual(['Segunda', 'Terça', 'Segunda']);
  });

  it('targetCount 0 ou origem vazia: retorna vazio', () => {
    expect(computeAutofillSeries(['tipo 1'], 0)).toEqual([]);
    expect(computeAutofillSeries([], 3)).toEqual([]);
  });
});
