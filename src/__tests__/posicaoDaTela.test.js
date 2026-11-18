// Testes da parte pura de usePosicaoDaTela: guardar/ler a posição por obra e saber quando a rolagem
// guardada já é alcançável. O hook em si (efeito de layout, DOM) é conferido no navegador.
import { describe, it, expect } from 'vitest';
import { lerPosicao, gravarPosicao, alcancaPosicao } from '../modules/cronograma/usePosicaoDaTela';

describe('lerPosicao', () => {
  it('devolve a posição guardada da mesma obra', () => {
    const memoria = { lista: { obraId: 'O1', top: 500, left: 40 } };
    expect(lerPosicao(memoria, 'lista', 'O1')).toEqual({ obraId: 'O1', top: 500, left: 40 });
  });

  it('ignora a posição de outra obra (trocar de obra começa do início)', () => {
    expect(lerPosicao({ lista: { obraId: 'O1', top: 500 } }, 'lista', 'O2')).toBeNull();
  });

  it('sem memória, sem chave ou sem obra devolve null', () => {
    expect(lerPosicao(undefined, 'lista', 'O1')).toBeNull();
    expect(lerPosicao({}, 'lista', 'O1')).toBeNull();
    expect(lerPosicao({ lista: { obraId: 'O1', top: 1 } }, 'lista', '')).toBeNull();
    expect(lerPosicao({ lista: { obraId: undefined, top: 1 } }, 'lista', undefined)).toBeNull();
  });
});

describe('gravarPosicao', () => {
  it('junta as partes: a página entra ao clicar na aba, a rolagem interna ao sair da tela', () => {
    const memoria = {};
    gravarPosicao(memoria, 'lista', 'O1', { pageY: 190 });
    gravarPosicao(memoria, 'lista', 'O1', { top: 800, left: 0, extra: { selectedId: 'T5' } });
    expect(memoria.lista).toEqual({ obraId: 'O1', pageY: 190, top: 800, left: 0, extra: { selectedId: 'T5' } });
  });

  it('gravar de novo atualiza só o que veio, mantendo o resto', () => {
    const memoria = { gantt: { obraId: 'O1', pageY: 100, top: 10, left: 20 } };
    gravarPosicao(memoria, 'gantt', 'O1', { top: 300 });
    expect(memoria.gantt).toEqual({ obraId: 'O1', pageY: 100, top: 300, left: 20 });
  });

  it('obra diferente da guardada descarta o antigo, sem misturar', () => {
    const memoria = { lista: { obraId: 'O1', pageY: 190, top: 800, extra: { selectedId: 'T5' } } };
    gravarPosicao(memoria, 'lista', 'O2', { top: 5 });
    expect(memoria.lista).toEqual({ obraId: 'O2', top: 5 });
  });

  it('as abas não se misturam', () => {
    const memoria = {};
    gravarPosicao(memoria, 'lista', 'O1', { top: 800 });
    gravarPosicao(memoria, 'medicao', 'O1', { top: 120 });
    expect(memoria.lista.top).toBe(800);
    expect(memoria.medicao.top).toBe(120);
  });

  it('sem memória, sem chave ou sem obra não faz nada (e não lança erro)', () => {
    expect(() => gravarPosicao(null, 'lista', 'O1', { top: 1 })).not.toThrow();
    const memoria = {};
    gravarPosicao(memoria, 'lista', '', { top: 1 });
    gravarPosicao(memoria, '', 'O1', { top: 1 });
    expect(memoria).toEqual({});
  });
});

describe('alcancaPosicao', () => {
  const caixa = (o) => ({ scrollHeight: 2000, clientHeight: 500, scrollWidth: 1800, clientWidth: 1200, ...o });

  it('alcança quando o conteúdo já é grande o bastante', () => {
    expect(alcancaPosicao(caixa(), { top: 1500, left: 600 })).toBe(true);
  });

  it('não alcança enquanto o conteúdo ainda é curto (dados carregando)', () => {
    expect(alcancaPosicao(caixa({ scrollHeight: 600 }), { top: 800, left: 0 })).toBe(false);
  });

  it('não alcança se faltar largura para a rolagem lateral', () => {
    expect(alcancaPosicao(caixa({ scrollWidth: 1200 }), { top: 0, left: 300 })).toBe(false);
  });

  it('tolera 1 px de diferença (arredondamento do navegador)', () => {
    expect(alcancaPosicao(caixa({ scrollHeight: 1500 }), { top: 1001, left: 0 })).toBe(true);
  });

  it('posição zero sempre é alcançável', () => {
    expect(alcancaPosicao(caixa({ scrollHeight: 500, scrollWidth: 1200 }), { top: 0, left: 0 })).toBe(true);
    expect(alcancaPosicao(caixa(), {})).toBe(true);
  });
});
