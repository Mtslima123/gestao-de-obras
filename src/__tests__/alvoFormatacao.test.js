// Alvo da formatação da faixa (negrito, cor de fundo, fonte, limpar): células soltas marcadas com
// Ctrl+clique e linhas soltas da calha antes só formatavam a última; agora formatam todas.
import { describe, it, expect } from 'vitest';
import { celulasAlvoFormatacao, alternarCelulaMarcada } from '../modules/cronograma/alvoFormatacaoPure';

const linhas = ['A', 'B', 'C', 'D', 'E'];
const colunas = ['etapa', 'inicio', 'dur'];
const chaves = (lista) => lista.map(c => `${c.taskId}|${c.colId}`);

describe('celulasAlvoFormatacao', () => {
  it('células soltas (Ctrl+clique): todas recebem, não só a última clicada', () => {
    const soltas = [
      { taskId: 'A', colId: 'etapa' }, { taskId: 'C', colId: 'etapa' }, { taskId: 'E', colId: 'etapa' },
    ];
    const r = celulasAlvoFormatacao({
      multiSelCells: soltas, linhas, colunas,
      intervalo: [{ taskId: 'E', colId: 'etapa' }],   // o que a Lista antes usava: só a última
    });
    expect(chaves(r)).toEqual(['A|etapa', 'C|etapa', 'E|etapa']);
  });

  it('células soltas em colunas e linhas diferentes também entram', () => {
    const r = celulasAlvoFormatacao({
      multiSelCells: [{ taskId: 'B', colId: 'inicio' }, { taskId: 'D', colId: 'dur' }], linhas, colunas,
      intervalo: [{ taskId: 'D', colId: 'dur' }],
    });
    expect(chaves(r)).toEqual(['B|inicio', 'D|dur']);
  });

  it('uma célula só marcada com Ctrl+clique vale como seleção comum (usa o intervalo)', () => {
    const r = celulasAlvoFormatacao({
      multiSelCells: [{ taskId: 'B', colId: 'etapa' }], linhas, colunas,
      intervalo: [{ taskId: 'B', colId: 'etapa' }, { taskId: 'C', colId: 'etapa' }],
    });
    expect(chaves(r)).toEqual(['B|etapa', 'C|etapa']);
  });

  it('linhas soltas pela calha: cada linha com todas as colunas visíveis', () => {
    const r = celulasAlvoFormatacao({
      linhasSoltas: ['B', 'D'], linhas, colunas,
      intervalo: [{ taskId: 'D', colId: 'etapa' }, { taskId: 'D', colId: 'inicio' }, { taskId: 'D', colId: 'dur' }],
    });
    expect(chaves(r)).toEqual(['B|etapa', 'B|inicio', 'B|dur', 'D|etapa', 'D|inicio', 'D|dur']);
  });

  it('colunas marcadas no cabeçalho: todas as linhas visíveis dessas colunas (como antes)', () => {
    const r = celulasAlvoFormatacao({ multiSelCols: ['inicio', 'dur'], linhas: ['A', 'B'], colunas, intervalo: [] });
    expect(chaves(r)).toEqual(['A|inicio', 'A|dur', 'B|inicio', 'B|dur']);
  });

  it('colunas têm precedência sobre células soltas e linhas soltas', () => {
    const r = celulasAlvoFormatacao({
      multiSelCols: ['etapa'], multiSelCells: [{ taskId: 'A', colId: 'dur' }, { taskId: 'B', colId: 'dur' }],
      linhasSoltas: ['C', 'D'], linhas: ['A', 'B'], colunas, intervalo: [],
    });
    expect(chaves(r)).toEqual(['A|etapa', 'B|etapa']);
  });

  it('sem seleção múltipla: devolve o intervalo, igual a antes (inclusive célula fora do filtro)', () => {
    const intervalo = [{ taskId: 'X', colId: 'etapa' }, { taskId: 'A', colId: 'inicio' }];
    expect(celulasAlvoFormatacao({ linhas, colunas, intervalo })).toEqual(intervalo);
  });

  it('não formata linha escondida pelo filtro nem coluna-pegada, e não repete célula', () => {
    const r = celulasAlvoFormatacao({
      multiSelCells: [
        { taskId: 'A', colId: 'etapa' }, { taskId: 'A', colId: 'etapa' },
        { taskId: 'Z', colId: 'etapa' },                 // fora do filtro
        { taskId: 'B', colId: '__pegada' },              // coluna ignorada
      ],
      linhas, colunas, intervalo: [], ignorarCols: new Set(['__pegada']),
    });
    expect(chaves(r)).toEqual(['A|etapa']);
  });

  it('entradas vazias não quebram', () => {
    expect(celulasAlvoFormatacao({})).toEqual([]);
  });
});

describe('alternarCelulaMarcada (Ctrl+clique)', () => {
  const A = { taskId: 'A', colId: 'etapa' };
  const C = { taskId: 'C', colId: 'etapa' };
  const E = { taskId: 'E', colId: 'etapa' };

  it('primeiro Ctrl+clique depois de uma seleção comum mantém a célula de antes marcada', () => {
    expect(alternarCelulaMarcada([], [A], C)).toEqual([A, C]);
  });

  it('Ctrl+cliques seguintes só somam; a seleção de antes já está na lista', () => {
    const duas = alternarCelulaMarcada([], [A], C);
    expect(alternarCelulaMarcada(duas, [C], E)).toEqual([A, C, E]);
  });

  it('o intervalo de antes entra inteiro no primeiro Ctrl+clique', () => {
    const intervalo = [{ taskId: 'A', colId: 'etapa' }, { taskId: 'B', colId: 'etapa' }];
    expect(alternarCelulaMarcada([], intervalo, E)).toEqual([...intervalo, E]);
  });

  it('Ctrl+clique numa célula já marcada tira ela da lista', () => {
    expect(alternarCelulaMarcada([A, C, E], [E], C)).toEqual([A, E]);
  });

  it('sem seleção anterior: começa a lista só com a célula clicada', () => {
    expect(alternarCelulaMarcada([], [], C)).toEqual([C]);
  });

  it('o resultado alimenta o alvo da formatação com todas as células (inclusive a primeira)', () => {
    const soltas = alternarCelulaMarcada(alternarCelulaMarcada([], [A], C), [C], E);
    const r = celulasAlvoFormatacao({ multiSelCells: soltas, linhas, colunas, intervalo: [E] });
    expect(chaves(r)).toEqual(['A|etapa', 'C|etapa', 'E|etapa']);
  });
});
