// Linha do tempo (Gantt) da casca mobile: escala de datas, posição das barras, cabeçalho, feriados, caminho crítico e
// janela de linhas desenhadas (modules/mobile/full/cronograma/linhaDoTempoPure).
import { describe, it, expect } from 'vitest';
import { dateToOffset, offsetToISO } from '../modules/cronograma/cronogramaDateUtils';
import {
  ZOOMS_DA_LINHA, ZOOM_PADRAO, pxPorDiaDoZoom, ALTURA_LINHA, ALTURA_CABECALHO, larguraDoRotulo, caminhoCritico,
  idsEmConflito, escalaDaLinhaDoTempo, xDoOffset, geometriaDaBarra, geometriaDaBase, comparacaoComBase,
  textoDaVariacao, cabecalhoDaEscala, feriadosNaJanela, xDeHoje, janelaDeLinhas, rolagemParaOffset,
  offsetInicialDaRolagem,
} from '../modules/mobile/full/cronograma/linhaDoTempoPure';

const off = (iso) => dateToOffset(iso);
const tarefa = (id, inicioISO, dur, extra = {}) => ({
  id, parentId: null, nivel: 0, isGroup: false, etapa: id, inicio: off(inicioISO), dur, avanco: 0, status: 'ongoing', dep: [], ...extra,
});
// 02/03/2026 é segunda-feira: 5 dias úteis vão até sexta (término exclusivo = sábado 07/03).
const A = tarefa('A', '2026-03-02', 5);
const B = tarefa('B', '2026-03-09', 10, { dep: [{ id: 'A', tipo: 'TI', lag: 0 }] });
const C = tarefa('C', '2026-03-23', 5, { dep: [{ id: 'B', tipo: 'TI', lag: 0 }] });
const D = tarefa('D', '2026-03-02', 2);
const etapas = [A, B, C, D];

describe('escalas', () => {
  it('três escalas, mês como padrão, com os px por dia do Gantt do desktop', () => {
    expect(ZOOMS_DA_LINHA.map(z => z.id)).toEqual(['dia', 'semana', 'mes']);
    expect(ZOOM_PADRAO).toBe('mes');
    expect(pxPorDiaDoZoom('dia')).toBe(16);
    expect(pxPorDiaDoZoom('semana')).toBe(7);
    expect(pxPorDiaDoZoom('mes')).toBe(1.8);
  });
  it('escala desconhecida cai no padrão', () => {
    expect(pxPorDiaDoZoom('trimestre')).toBe(1.8);
  });
  it('alvo de toque de 44px e cabeçalho de duas faixas', () => {
    expect(ALTURA_LINHA).toBe(44);
    expect(ALTURA_CABECALHO).toBe(44);
  });
  it('coluna de rótulos: um terço da tela, com piso e teto', () => {
    expect(larguraDoRotulo(375)).toBe(135);
    expect(larguraDoRotulo(300)).toBe(112);
    expect(larguraDoRotulo(1000)).toBe(230);
    expect(larguraDoRotulo(0)).toBe(132);
  });
});

describe('caminho crítico', () => {
  it('parte da folha que termina por último e volta pela predecessora que a conduz', () => {
    expect([...caminhoCritico(etapas)].sort()).toEqual(['A', 'B', 'C']);
  });
  it('com mais de uma predecessora segue a que termina mais tarde', () => {
    const E = tarefa('E', '2026-04-06', 3, { dep: ['C', 'D'] });
    expect([...caminhoCritico([...etapas, E])].sort()).toEqual(['A', 'B', 'C', 'E']);
  });
  it('grupo nunca entra e sem tarefas devolve vazio', () => {
    const G = { id: 'G', isGroup: true, inicio: off('2026-03-02'), dur: 50, dep: [] };
    expect(caminhoCritico([G, A]).has('G')).toBe(false);
    expect(caminhoCritico([]).size).toBe(0);
  });
  it('ciclo de dependência não trava', () => {
    const X = tarefa('X', '2026-03-02', 3, { dep: ['Y'] });
    const Y = tarefa('Y', '2026-03-02', 3, { dep: ['X'] });
    expect(caminhoCritico([X, Y]).size).toBeGreaterThan(0);
  });
});

describe('conflitos de precedência', () => {
  it('sucessora que começa antes do fim da predecessora marca as duas', () => {
    const cedo = tarefa('B', '2026-03-04', 3, { dep: [{ id: 'A', tipo: 'TI', lag: 0 }] });
    expect([...idsEmConflito([A, cedo])].sort()).toEqual(['A', 'B']);
  });
  it('cronograma sem violação não marca nada', () => {
    expect(idsEmConflito(etapas).size).toBe(0);
  });
  it('conflito com OK dado deixa de avisar', () => {
    const cedo = tarefa('B', '2026-03-04', 3, { dep: [{ id: 'A', tipo: 'TI', lag: 0 }], conflitosOk: [{ pred: 'A', tipo: 'TI', lag: 0 }] });
    expect(idsEmConflito([A, cedo]).size).toBe(0);
  });
});

describe('escala da linha do tempo', () => {
  it('começa no dia 1 do mês da primeira tarefa e dá folga depois do último término', () => {
    const e = escalaDaLinhaDoTempo({ etapas, zoomId: 'mes' });
    expect(offsetToISO(e.inicioOffset)).toBe('2026-03-01');
    expect(e.pxPorDia).toBe(1.8);
    // C termina na sexta 27/03 (exclusivo = sábado 28/03): 27 dias desde o dia 1, mais 30 de folga.
    expect(e.fimDasTarefas).toBe(off('2026-03-28'));
    expect(e.totalDias).toBe(off('2026-03-28') - off('2026-03-01') + 30);
    expect(e.larguraTotal).toBe(Math.round(e.totalDias * 1.8));
  });
  it('preenche a largura visível quando as tarefas ocupam pouco', () => {
    const curta = escalaDaLinhaDoTempo({ etapas: [D], zoomId: 'dia', larguraGrafico: 2000 });
    expect(curta.totalDias).toBe(Math.ceil(2000 / 16));
  });
  it('linha de base mais antiga puxa o início, e a mais tardia estica o fim', () => {
    const base = [tarefa('A', '2026-01-12', 5), tarefa('C', '2026-06-01', 5)];
    const e = escalaDaLinhaDoTempo({ etapas, baselineEtapas: base });
    expect(offsetToISO(e.inicioOffset)).toBe('2026-01-01');
    expect(e.fimDasTarefas).toBe(off('2026-06-06'));
  });
  it('grupo que termina depois das folhas estica o fim', () => {
    const e = escalaDaLinhaDoTempo({ etapas, groupVals: { G: { inicio: off('2026-03-02'), dur: 200 } } });
    expect(e.fimDasTarefas).toBe(off('2026-03-02') + 200);
  });
  it('sem tarefas não quebra: janela mínima de 30 dias', () => {
    const e = escalaDaLinhaDoTempo({ etapas: [] });
    expect(e.totalDias).toBeGreaterThanOrEqual(30);
    expect(Number.isFinite(e.inicioOffset)).toBe(true);
  });
  it('xDoOffset nunca fica negativo', () => {
    const e = escalaDaLinhaDoTempo({ etapas });
    expect(xDoOffset(e, e.inicioOffset - 50)).toBe(0);
    expect(xDoOffset(e, e.inicioOffset + 10)).toBeCloseTo(18);
  });
});

describe('barras', () => {
  const e = escalaDaLinhaDoTempo({ etapas, zoomId: 'semana' });
  it('tarefa: x do início (com 3px de respiro) e comprimento até o término por dias úteis', () => {
    const g = geometriaDaBarra(A, e);
    expect(g.tipo).toBe('tarefa');
    expect(g.x).toBe((off('2026-03-02') - off('2026-03-01')) * 7 + 3);
    // 5 dias úteis a partir de segunda: término exclusivo no sábado, 5 dias de calendário.
    expect(g.w).toBe(5 * 7 - 6);
  });
  it('tarefa que atravessa o fim de semana ocupa os dias de calendário', () => {
    // 10 dias úteis de segunda 09/03: termina na sexta 20/03 (exclusivo = sábado 21/03), 12 dias de calendário.
    expect(geometriaDaBarra(B, e).w).toBe(12 * 7 - 6);
  });
  it('barra muito curta tem largura mínima de 10px', () => {
    const mes = escalaDaLinhaDoTempo({ etapas, zoomId: 'mes' });
    expect(geometriaDaBarra(D, mes).w).toBe(10);
  });
  it('grupo usa o envelope dos filhos', () => {
    const G = { id: 'G', isGroup: true, inicio: 0, dur: 0 };
    const g = geometriaDaBarra(G, e, { G: { inicio: off('2026-03-09'), dur: 14 } });
    expect(g.tipo).toBe('grupo');
    expect(g.x).toBe((off('2026-03-09') - off('2026-03-01')) * 7 + 3);
    expect(g.w).toBe(14 * 7 - 6);
  });
  it('marco vira ponto, sem largura, e o grupo nunca vira marco', () => {
    const m = tarefa('M', '2026-03-16', 0, { milestone: true });
    expect(geometriaDaBarra(m, e)).toEqual({ tipo: 'marco', x: (off('2026-03-16') - off('2026-03-01')) * 7, w: 0 });
    const gm = { id: 'G', isGroup: true, milestone: true, inicio: off('2026-03-02'), dur: 7 };
    expect(geometriaDaBarra(gm, e).tipo).toBe('grupo');
  });
  it('linha de base: barra fina na mesma escala; marco e dado vazio não têm', () => {
    const base = geometriaDaBase(tarefa('A', '2026-03-09', 5), e);
    expect(base.x).toBe((off('2026-03-09') - off('2026-03-01')) * 7 + 3);
    expect(base.w).toBe(5 * 7 - 6);
    expect(geometriaDaBase(tarefa('M', '2026-03-09', 0, { milestone: true }), e)).toBeNull();
    expect(geometriaDaBase(null, e)).toBeNull();
  });
});

describe('comparação com a linha de base', () => {
  it('término depois da base: positivo, em dias de calendário', () => {
    const base = tarefa('A', '2026-03-02', 5); // termina sex 06/03
    const atual = tarefa('A', '2026-03-09', 5); // termina sex 13/03
    const c = comparacaoComBase(atual, base);
    expect(c.inicioISO).toBe('2026-03-02');
    expect(c.fimISO).toBe('2026-03-06');
    expect(c.variacaoDias).toBe(7);
  });
  it('adiantada fica negativa e igual fica zero', () => {
    const base = tarefa('A', '2026-03-09', 5);
    expect(comparacaoComBase(tarefa('A', '2026-03-02', 5), base).variacaoDias).toBe(-7);
    expect(comparacaoComBase(tarefa('A', '2026-03-09', 5), base).variacaoDias).toBe(0);
  });
  it('grupo compara pelo envelope dos filhos', () => {
    const base = { id: 'G', isGroup: true, inicio: off('2026-03-02'), dur: 10 };
    const G = { id: 'G', isGroup: true, inicio: 0, dur: 0 };
    const c = comparacaoComBase(G, base, { G: { inicio: off('2026-03-02'), dur: 13 } });
    expect(c.variacaoDias).toBe(3);
  });
  it('sem base devolve null', () => {
    expect(comparacaoComBase(A, null)).toBeNull();
  });
  it('texto da variação em português', () => {
    expect(textoDaVariacao(0)).toBe('no prazo da base');
    expect(textoDaVariacao(1)).toBe('1 dia depois da base');
    expect(textoDaVariacao(7)).toBe('7 dias depois da base');
    expect(textoDaVariacao(-2)).toBe('2 dias antes da base');
  });
});

describe('cabeçalho e grade', () => {
  it('mês: ano em cima, mês embaixo, e a grade nos inícios de mês (trimestre forte)', () => {
    const e = escalaDaLinhaDoTempo({ etapas, zoomId: 'mes' });
    const c = cabecalhoDaEscala(e);
    expect(c.superior[0].rotulo).toBe('2026');
    expect(c.inferior[0]).toMatchObject({ rotulo: 'Mar', x: 0 });
    expect(c.inferior[0].w).toBeCloseTo(31 * 1.8);
    expect(c.grade[0]).toEqual({ x: 0, forte: false });
    // As faixas cobrem a janela inteira, sem buraco.
    const ult = c.inferior[c.inferior.length - 1];
    expect(Math.round(ult.x + ult.w)).toBe(e.larguraTotal);
  });
  it('semana: mês em cima com ano, dia da segunda embaixo, semana de 1 dia sem rótulo', () => {
    const e = escalaDaLinhaDoTempo({ etapas, zoomId: 'semana' });
    const c = cabecalhoDaEscala(e);
    expect(c.superior[0].rotulo).toBe('Mar/26');
    // 01/03/2026 é domingo: a primeira "semana" tem 1 dia (7px), pequena demais para rótulo.
    expect(c.inferior[0].rotulo).toBe('');
    expect(c.inferior[1].rotulo).toBe('2');
    expect(c.inferior[2].rotulo).toBe('9');
    // A primeira linha da grade cai no início de mês (forte).
    expect(c.grade[0].forte).toBe(true);
  });
  it('dia: um rótulo por dia, fim de semana marcado, dia 1 forte', () => {
    const e = escalaDaLinhaDoTempo({ etapas, zoomId: 'dia' });
    const c = cabecalhoDaEscala(e);
    expect(c.inferior).toHaveLength(e.totalDias);
    expect(c.inferior[0]).toMatchObject({ rotulo: '1', fimDeSemana: true, w: 16 });
    expect(c.inferior[1]).toMatchObject({ rotulo: '2', fimDeSemana: false });
    expect(c.grade[0].forte).toBe(true);
    expect(c.grade[1].forte).toBe(false);
  });
});

describe('feriados e hoje', () => {
  const e = escalaDaLinhaDoTempo({ etapas, zoomId: 'semana' });
  it('só os feriados dentro da janela, na posição certa, com largura de ao menos 2px', () => {
    const cfg = { dias: [{ data: '2026-03-16', descricao: 'Feriado local' }, { data: '2030-01-01', descricao: 'Longe' }, { data: '2020-01-01' }], sabadoUtil: false };
    const f = feriadosNaJanela(cfg, e);
    expect(f).toHaveLength(1);
    expect(f[0]).toEqual({ x: (off('2026-03-16') - off('2026-03-01')) * 7, w: 7, descricao: 'Feriado local' });
    expect(feriadosNaJanela(cfg, escalaDaLinhaDoTempo({ etapas, zoomId: 'mes' }))[0].w).toBe(2);
  });
  it('sem configuração não há feriado', () => {
    expect(feriadosNaJanela(undefined, e)).toEqual([]);
    expect(feriadosNaJanela({ dias: [] }, e)).toEqual([]);
  });
  it('linha de hoje: posição dentro da janela e null fora dela', () => {
    expect(xDeHoje(e, off('2026-03-10'))).toBe(9 * 7);
    expect(xDeHoje(e, e.inicioOffset - 1)).toBeNull();
    expect(xDeHoje(e, e.inicioOffset + e.totalDias + 1)).toBeNull();
  });
});

describe('janela de linhas e rolagem', () => {
  it('desenha só o que está visível mais a folga', () => {
    const j = janelaDeLinhas({ rolagemY: 4400, alturaVisivel: 440, total: 1000, folga: 6 });
    expect(j).toEqual({ de: 100 - 6, ate: 110 + 6 });
  });
  it('no começo e no fim respeita os limites', () => {
    expect(janelaDeLinhas({ rolagemY: 0, alturaVisivel: 440, total: 1000 }).de).toBe(0);
    expect(janelaDeLinhas({ rolagemY: 43500, alturaVisivel: 440, total: 1000 }).ate).toBe(1000);
  });
  it('lista pequena cabe inteira; vazia não desenha nada; rolagem negativa (rebote do iOS) vale 0', () => {
    expect(janelaDeLinhas({ rolagemY: 0, alturaVisivel: 600, total: 5 })).toEqual({ de: 0, ate: 5 });
    expect(janelaDeLinhas({ rolagemY: 0, alturaVisivel: 600, total: 0 })).toEqual({ de: 0, ate: 0 });
    expect(janelaDeLinhas({ rolagemY: -30, alturaVisivel: 440, total: 100 }).de).toBe(0);
  });
  it('rolagem horizontal leva a data a uma fração da área do gráfico, sem passar de 0', () => {
    const e = escalaDaLinhaDoTempo({ etapas, zoomId: 'semana' });
    expect(rolagemParaOffset(e, off('2026-03-23'), 240, 0.3)).toBe(Math.round(22 * 7 - 72));
    expect(rolagemParaOffset(e, e.inicioOffset, 240)).toBe(0);
  });
  it('abre em hoje quando hoje está dentro do cronograma; senão no começo da primeira tarefa', () => {
    const e = escalaDaLinhaDoTempo({ etapas });
    expect(offsetInicialDaRolagem(e, etapas, off('2026-03-12'))).toBe(off('2026-03-12'));
    expect(offsetInicialDaRolagem(e, etapas, off('2025-12-01'))).toBe(off('2026-03-02'));
    expect(offsetInicialDaRolagem(e, etapas, off('2027-01-01'))).toBe(off('2026-03-02'));
  });
});
