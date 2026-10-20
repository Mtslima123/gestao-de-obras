// Desfazer/refazer devolve a seleção da Lista para as células da ação. Estas funções decidem se a
// seleção guardada junto da ação serve para a mudança (senão cai no foco por tarefa de sempre).
import { describe, it, expect } from 'vitest';
import { tarefasAlteradas, idsDaSelecao, selecaoTocaMudanca } from '../modules/cronograma/alvoFormatacaoPure';

const t = (id, extra = {}) => ({ id, etapa: `Tarefa ${id}`, dur: 5, ...extra });

describe('tarefasAlteradas', () => {
  it('lista só as tarefas cujo conteúdo mudou (inclusive formatação)', () => {
    const antes = [t('A'), t('B'), t('C')];
    const depois = [t('A'), t('B', { fmt: { etapa: { bold: true } } }), t('C', { dur: 7 })];
    expect([...tarefasAlteradas(antes, depois)].sort()).toEqual(['B', 'C']);
  });

  it('tarefa incluída ou removida também conta', () => {
    expect([...tarefasAlteradas([t('A')], [t('A'), t('N')])]).toEqual(['N']);
    expect([...tarefasAlteradas([t('A'), t('X')], [t('A')])]).toEqual(['X']);
  });

  it('snapshots iguais: nada mudou', () => {
    expect(tarefasAlteradas([t('A')], [t('A')]).size).toBe(0);
  });
});

describe('idsDaSelecao / selecaoTocaMudanca', () => {
  const celula = (taskId, colId = 'etapa') => ({ taskId, colId });
  const sel = {
    selectedCell: celula('E'), selAnchor: celula('E'), selectedId: 'A',
    multiSel: [], multiSelCells: [celula('A'), celula('C'), celula('E')],
  };

  it('junta célula ativa, âncora, linha ativa, linhas soltas e células soltas', () => {
    expect([...idsDaSelecao(sel)].sort()).toEqual(['A', 'C', 'E']);
    expect([...idsDaSelecao({ selectedCell: celula('X'), multiSel: ['Y', 'Z'] })].sort()).toEqual(['X', 'Y', 'Z']);
    expect(idsDaSelecao(null).size).toBe(0);
  });

  it('serve quando alguma tarefa da seleção foi alterada pela ação', () => {
    expect(selecaoTocaMudanca(sel, new Set(['C']))).toBe(true);
  });

  it('não serve quando a ação mexeu em outras tarefas (cai no foco por tarefa)', () => {
    expect(selecaoTocaMudanca(sel, new Set(['Z']))).toBe(false);
  });

  it('sem seleção, sem célula ativa ou sem mudança: não serve', () => {
    expect(selecaoTocaMudanca(null, new Set(['A']))).toBe(false);
    expect(selecaoTocaMudanca({ multiSel: ['A'] }, new Set(['A']))).toBe(false);
    expect(selecaoTocaMudanca(sel, new Set())).toBe(false);
  });
});
