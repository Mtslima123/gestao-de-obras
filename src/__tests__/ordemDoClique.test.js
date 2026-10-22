// Ctrl+F2 vincula as linhas marcadas na ORDEM DO CLIQUE (a primeira vira predecessora da seguinte).
// A linha clicada sem Ctrl fica fora da multiSel, e no primeiro Ctrl+clique ela entra na frente.
import { describe, it, expect } from 'vitest';
import { alternarLinhaMarcada } from '../modules/cronograma/alvoFormatacaoPure';

describe('alternarLinhaMarcada', () => {
  it('clica na 98, depois Ctrl+clica na 97: a ordem é 98, 97 (a 98 vira predecessora da 97)', () => {
    expect(alternarLinhaMarcada([], ['98'], '97')).toEqual(['98', '97']);
  });

  it('clica na 97, depois Ctrl+clica na 98: a ordem é 97, 98', () => {
    expect(alternarLinhaMarcada([], ['97'], '98')).toEqual(['97', '98']);
  });

  it('sem seleção anterior: a lista nasce só com a clicada', () => {
    expect(alternarLinhaMarcada([], [], '97')).toEqual(['97']);
  });

  it('os Ctrl+cliques seguintes acrescentam no fim, na ordem do clique (mesmo fora da ordem da tela)', () => {
    let m = alternarLinhaMarcada([], ['C'], 'A');
    m = alternarLinhaMarcada(m, ['ignorada'], 'B');
    expect(m).toEqual(['C', 'A', 'B']);
  });

  it('a semente (seleção de antes) só vale com a lista vazia: não é reinserida depois', () => {
    const m = alternarLinhaMarcada(['X', 'Y'], ['Z'], 'W');
    expect(m).toEqual(['X', 'Y', 'W']);
  });

  it('Ctrl+clique numa linha já marcada tira ela, mantendo a ordem das outras', () => {
    expect(alternarLinhaMarcada(['C', 'A', 'B'], [], 'A')).toEqual(['C', 'B']);
  });

  it('Ctrl+clique na linha da seleção de antes tira ela da semente', () => {
    expect(alternarLinhaMarcada([], ['A', 'B', 'C'], 'B')).toEqual(['A', 'C']);
  });

  it('seleção de antes em intervalo (várias linhas) entra na ordem da tela, a clicada por último', () => {
    expect(alternarLinhaMarcada([], ['R1', 'R2', 'R3'], 'R9')).toEqual(['R1', 'R2', 'R3', 'R9']);
  });

  it('não altera os arrays recebidos', () => {
    const marcadas = ['A'];
    const anterior = ['B'];
    alternarLinhaMarcada(marcadas, anterior, 'C');
    alternarLinhaMarcada([], anterior, 'C');
    expect(marcadas).toEqual(['A']);
    expect(anterior).toEqual(['B']);
  });
});
