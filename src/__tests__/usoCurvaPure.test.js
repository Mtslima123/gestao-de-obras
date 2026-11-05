// Uso da Tarefa e Curva Física na casca mobile (modules/mobile/full/cronograma/usoCurvaPure): estrutura recolhível,
// formatação, totais, linhas da distribuição e séries da Curva, com os mesmos cálculos do desktop.
import { describe, it, expect } from 'vitest';
import { dateToOffset } from '../modules/cronograma/cronogramaDateUtils';
import { computeMonthlyDist, getMonthRange } from '../modules/cronograma/scheduleEngine';
import { computeCustoOrcadoMap } from '../modules/cronograma/ganttUtils';
import {
  idsComFilhos, etapasVisiveis, colapsadosAteNivel, OPCOES_DE_ESTRUTURA, textoBRL, textoValor, textoPct, textoDif, larguraDaColuna,
  alturaDaMatriz, totaisDoUso, linhasDoUso, mesesDaDistribuicao, resumoDaTarefaNoUso, montarCurva, propsDosGraficos,
  linhasDoResumo, producaoDoMes, tituloComNome, resumoDaComparacao, tomDoValor, mesVizinho, linhasDaDistribuicao, rodapeDaDistribuicao, fundoDaDistribuicao, textoPctDoMes,
} from '../modules/mobile/full/cronograma/usoCurvaPure';

const off = (iso) => dateToOffset(iso);
const grupo = (id, parentId, nivel, etapa, extra = {}) => ({ id, parentId, nivel, isGroup: true, etapa, inicio: 0, dur: 5, avanco: 0, collapsed: false, dep: [], ...extra });
const tarefa = (id, parentId, nivel, etapa, inicioISO, dur, extra = {}) => ({
  id, parentId, nivel, isGroup: false, etapa, inicio: off(inicioISO), dur, avanco: 0, status: 'ongoing', dep: [], ...extra,
});

// G1 (Estrutura) > G2 (Fundação) > A, B ; G1 > C ; G3 (Acabamento) > D
// Os grupos trazem o envelope dos filhos, como no app (updateParentBounds): getMonthRange também olha os grupos.
const etapas = [
  grupo('G1', null, 0, 'Estrutura', { inicio: off('2026-03-02'), dur: 54 }),
  grupo('G2', 'G1', 1, 'Fundação', { inicio: off('2026-03-02'), dur: 40 }),
  tarefa('A', 'G2', 2, 'Escavação', '2026-03-02', 10),
  tarefa('B', 'G2', 2, 'Estacas', '2026-03-30', 10, { showInDist: true }),
  tarefa('C', 'G1', 1, 'Alvenaria', '2026-04-13', 10),
  grupo('G3', null, 0, 'Acabamento', { inicio: off('2026-04-20'), dur: 5 }),
  tarefa('D', 'G3', 1, 'Pintura', '2026-04-20', 5),
];
const vinculos = { A: 100000, B: 120000, C: 80000, D: 20000 };
const custoMap = computeCustoOrcadoMap(etapas, vinculos);
const monthlyDist = computeMonthlyDist(etapas, custoMap);
const months = getMonthRange(etapas);
const somaDist = (d) => Object.values(d).reduce((s, v) => s + v, 0);

describe('estrutura recolhível', () => {
  it('quem tem filhos', () => {
    expect([...idsComFilhos(etapas)].sort()).toEqual(['G1', 'G2', 'G3']);
  });
  it('nada recolhido devolve as mesmas linhas', () => {
    expect(etapasVisiveis(etapas, new Set())).toBe(etapas);
  });
  it('recolher um grupo esconde os descendentes em qualquer profundidade', () => {
    expect(etapasVisiveis(etapas, new Set(['G1'])).map(e => e.id)).toEqual(['G1', 'G3', 'D']);
    expect(etapasVisiveis(etapas, new Set(['G2'])).map(e => e.id)).toEqual(['G1', 'G2', 'C', 'G3', 'D']);
  });
  it('pai em ciclo não trava', () => {
    const ciclo = [grupo('X', 'Y', 0, 'x'), grupo('Y', 'X', 0, 'y'), tarefa('Z', 'X', 1, 'z', '2026-03-02', 1)];
    expect(etapasVisiveis(ciclo, new Set(['Q'])).length).toBe(3);
    expect(() => etapasVisiveis(ciclo, new Set(['Y']))).not.toThrow();
  });
  it('nível: 0 expande tudo, 1 recolhe tudo, 2 recolhe do nível 1 para baixo', () => {
    expect(colapsadosAteNivel(etapas, 0).size).toBe(0);
    expect([...colapsadosAteNivel(etapas, 1)].sort()).toEqual(['G1', 'G2', 'G3']);
    expect([...colapsadosAteNivel(etapas, 2)].sort()).toEqual(['G2']);
  });
  it('opções do seletor sem valor repetido', () => {
    const valores = OPCOES_DE_ESTRUTURA.map(o => o.valor);
    expect(new Set(valores).size).toBe(valores.length);
    expect(OPCOES_DE_ESTRUTURA[0].rotulo).toBe('Expandir tudo');
    expect(OPCOES_DE_ESTRUTURA[1].rotulo).toBe('Recolher tudo');
  });
});

describe('formatação', () => {
  it('R$: abaixo de 1 vira traço, o resto em reais com centavos', () => {
    expect(textoBRL(0)).toBe('—');
    expect(textoBRL(0.4)).toBe('—');
    expect(textoBRL(undefined)).toBe('—');
    expect(textoBRL(1234.5).replace(/\s/g, ' ')).toBe('R$ 1.234,50');
  });
  it('valor de célula sem o R$: abaixo de 1 vira traço', () => {
    expect(textoValor(0)).toBe('—');
    expect(textoValor(0.99)).toBe('—');
    expect(textoValor(1234.5)).toBe('1.234,50');
    expect(textoValor(95294.123)).toBe('95.294,12');
  });
  it('percentual com vírgula; zero e ausente viram traço', () => {
    expect(textoPct(12.5)).toBe('12,50%');
    expect(textoPct(0)).toBe('—');
    expect(textoPct(0, { zeroVazio: false })).toBe('0,00%');
    expect(textoPct(null)).toBe('—');
    expect(textoPct(100)).toBe('100,00%');
  });
  it('diferença com sinal', () => {
    expect(textoDif(1.2)).toBe('+1,20%');
    expect(textoDif(-0.8)).toBe('-0,80%');
    expect(textoDif(0)).toBe('—');
    expect(textoDif(null)).toBe('—');
  });
  it('largura da coluna pelo maior texto, com piso', () => {
    expect(larguraDaColuna(['—', '5'])).toBe(72);
    const l = larguraDaColuna(['R$ 1.234.567,89', 'R$ 1,00']);
    expect(l).toBeGreaterThan(110);
    expect(larguraDaColuna([])).toBe(72);
  });
  it('altura da matriz curta e limitada', () => {
    expect(alturaDaMatriz({ linhas: 3, alturaLinha: 40 })).toBe(36 + 120 + 2);
    expect(alturaDaMatriz({ linhas: 100, maxima: 360 })).toBe(360);
    expect(alturaDaMatriz({ linhas: 2, rodape: 1, alturaLinha: 40 })).toBe(36 + 80 + 40 + 2);
  });
  it('célula de % por mês: até 0,5% fica vazia', () => {
    expect(textoPctDoMes(0.5)).toBe('—');
    expect(textoPctDoMes(0.51)).toBe('0,51%');
    expect(textoPctDoMes(100)).toBe('100,00%');
  });
});

describe('Uso da Tarefa', () => {
  it('as distribuições batem com o custo de cada tarefa', () => {
    expect(somaDist(monthlyDist.A)).toBeCloseTo(100000);
    expect(somaDist(monthlyDist.B)).toBeCloseTo(120000);
  });
  it('totais por mês, total geral e % acumulado terminando em 100%', () => {
    const t = totaisDoUso(months, monthlyDist);
    expect(t.geral).toBeCloseTo(320000);
    expect(months.reduce((s, m) => s + t.porMes[m.key], 0)).toBeCloseTo(320000);
    expect(t.acumuladoPct[t.acumuladoPct.length - 1]).toBeCloseTo(1);
    expect(t.acumuladoPct[0]).toBeGreaterThan(0);
  });
  it('sem tarefas o total é zero e o acumulado também', () => {
    const t = totaisDoUso([{ key: '2026-03', label: 'Mar/26' }], {});
    expect(t.geral).toBe(0);
    expect(t.acumuladoPct).toEqual([0]);
  });
  it('grupo soma os filhos e traz total', () => {
    const l = linhasDoUso({ etapas, months, monthlyDist });
    const g2 = l.find(x => x.e.id === 'G2');
    expect(g2.total).toBeCloseTo(220000);
    expect(g2.temFilhos).toBe(true);
    expect(g2.aberto).toBe(true);
    const g1 = l.find(x => x.e.id === 'G1');
    expect(g1.total).toBeCloseTo(300000);
    expect(l.find(x => x.e.id === 'A').nivel).toBe(2);
    expect(l.find(x => x.e.id === 'A').temFilhos).toBe(false);
  });
  it('recolhido esconde os filhos e marca o grupo fechado', () => {
    const l = linhasDoUso({ etapas, colapsados: new Set(['G1']), months, monthlyDist });
    expect(l.map(x => x.e.id)).toEqual(['G1', 'G3', 'D']);
    expect(l[0].aberto).toBe(false);
  });
  it('meses da tarefa: só os com valor, % do total e acumulado até 100%', () => {
    const d = monthlyDist.B;
    const lista = mesesDaDistribuicao(months, d, somaDist(d));
    expect(lista.length).toBeGreaterThanOrEqual(2);
    expect(lista.reduce((s, x) => s + x.pct, 0)).toBeCloseTo(100);
    expect(lista[lista.length - 1].acumPct).toBeCloseTo(100);
    expect(lista[0].rotulo).toBe('Mar/26');
  });
  it('mês abaixo de R$ 1 não entra na lista', () => {
    expect(mesesDaDistribuicao(months, { '2026-03': 0.5, '2026-04': 10 }, 10.5).map(x => x.key)).toEqual(['2026-04']);
  });
  it('resumo da tarefa: datas inclusivas e avanço', () => {
    const r = resumoDaTarefaNoUso({ ...A_(), avanco: 40 });
    expect(r.inicioISO).toBe('2026-03-02');
    expect(r.fimISO).toBe('2026-03-13');
    expect(r.dur).toBe(10);
    expect(r.avanco).toBe(40);
  });
});
function A_() { return etapas.find(e => e.id === 'A'); }

describe('Curva Física: montagem', () => {
  const base = { months, monthlyDist, valorVinculadoMap: vinculos, hojeKey: '2026-04' };
  it('sem linha de base nem reprogramação cai no plano ao vivo', () => {
    const c = montarCurva({ ...base, selMonKey: '2026-03' });
    expect(c.temDados).toBe(true);
    expect(c.temLB).toBe(false);
    expect(c.temRep).toBe(false);
    expect(c.total).toBeCloseTo(320000);
    expect(c.selIdx).toBe(0);
    expect(c.todayIdx).toBe(1);
    // Sem reprogramação, a série Reprogramado é o próprio plano ao vivo.
    expect(c.series.repA).toEqual(c.series.rrA);
    expect(c.series.rrA[c.series.rrA.length - 1]).toBeCloseTo(100);
  });
  it('mês de referência desconhecido usa o último; hoje fora da obra vira -1', () => {
    const c = montarCurva({ ...base, selMonKey: '2099-01', hojeKey: '2099-01' });
    expect(c.selIdx).toBe(months.length - 1);
    expect(c.todayIdx).toBe(-1);
  });
  it('obra sem custo não tem dados para a curva', () => {
    const vazio = montarCurva({ months, monthlyDist: {}, selMonKey: '' });
    expect(vazio.temDados).toBe(false);
    expect(montarCurva({ months: [], monthlyDist: {}, selMonKey: '' }).temDados).toBe(false);
  });
  it('linha de base escolhida entra, e a Reprogramação também, com nome', () => {
    const atrasada = etapas.map(e => (e.isGroup ? e : { ...e, inicio: e.inicio + 28 }));
    const baselines = [{ id: 'BL1', nome: 'LB 1', criadaEm: '2026-01-01', etapas: atrasada }];
    const reprogramacoes = [{ id: 'RP1', nome: 'Rep. fev', criadaEm: '2026-02-01', etapas: atrasada }];
    const c = montarCurva({ ...base, selMonKey: '2026-03', baselines, blVisivelId: 'BL1', reprogramacoes, repVisivelId: 'RP1' });
    expect(c.temLB).toBe(true);
    expect(c.temRep).toBe(true);
    expect(c.lbNome).toBe('LB 1');
    expect(c.repNome).toBe('Rep. fev');
    // A base está 4 semanas atrás do plano: o acumulado dela fica abaixo do real no começo.
    expect(c.series.blA[0]).toBeLessThan(c.series.rrA[0]);
    expect(c.series.difBL[0]).toBeGreaterThan(0);
  });
  it('id de linha de base que não existe mais é ignorado', () => {
    const c = montarCurva({ ...base, selMonKey: '2026-03', baselines: [], blVisivelId: 'sumiu' });
    expect(c.temLB).toBe(false);
  });
});

describe('Curva Física: o que a tela mostra', () => {
  const baselines = [{ id: 'BL1', nome: 'LB 1', criadaEm: '2026-01-01', etapas }];
  const comLB = montarCurva({ months, monthlyDist, valorVinculadoMap: vinculos, baselines, blVisivelId: 'BL1', selMonKey: '2026-04', hojeKey: '2026-04' });
  const semLB = montarCurva({ months, monthlyDist, valorVinculadoMap: vinculos, selMonKey: '2026-04', hojeKey: '2026-04' });
  const opcoes = { show: { bl: true, rep: true, real: true }, showBarras: true, showLinhas: true };

  it('props dos gráficos: base e reprogramado só quando existem', () => {
    const a = propsDosGraficos(semLB, opcoes);
    expect(a.curva1.baseline).toBeNull();
    expect(a.curva1.reprogramado).toEqual([]);
    expect(a.curva1.replanM).toEqual([]);
    expect(a.curva2.baselineA).toBeNull();
    expect(a.curva1.todayIdx).toBe(1);
    expect(a.curva2.selIdx).toBe(1);
    const b = propsDosGraficos(comLB, opcoes);
    expect(b.curva1.baseline).toEqual(comLB.series.blA);
    expect(b.curva1.show).toBe(opcoes.show);
    expect(b.curva1.showLines).toBe(true);
  });
  it('resumo: linhas da base só com base escolhida', () => {
    expect(linhasDoResumo(semLB).map(l => l.id)).toEqual(['rep-m', 'rep-a', 'rr-m', 'rr-a', 'dif-rep']);
    expect(linhasDoResumo(comLB).map(l => l.id)).toEqual(['lb-m', 'lb-a', 'rep-m', 'rep-a', 'rr-m', 'rr-a', 'dif-lb', 'dif-rep']);
    linhasDoResumo(comLB).forEach(l => expect(l.valores).toHaveLength(months.length));
  });
  it('produção do mês: grupos, valores do mês de referência e sinal da diferença', () => {
    const g = producaoDoMes(comLB);
    expect(g.map(x => x.id)).toEqual(['lb', 'rep', 'real', 'dif']);
    expect(g[0].titulo).toBe('Linha de Base · LB 1');
    expect(g[1].titulo).toBe('Reprogramação (plano atual)');
    expect(g[2].linhas[1].valor).toBe(textoPct(comLB.series.rrA[1]));
    const sem = producaoDoMes(semLB);
    expect(sem.map(x => x.id)).toEqual(['rep', 'real', 'dif']);
    expect(sem[2].linhas).toHaveLength(1);
  });
  it('título do bloco não repete a palavra que o nome já traz', () => {
    expect(tituloComNome('Linha de Base', 'LB 1')).toBe('Linha de Base · LB 1');
    expect(tituloComNome('Linha de Base', 'Linha de base 1')).toBe('Linha de base 1');
    expect(tituloComNome('Reprogramação', 'Reprogramacao out/26')).toBe('Reprogramacao out/26');
    expect(tituloComNome('Reprogramação', 'Fev')).toBe('Reprogramação · Fev');
    expect(tituloComNome('Reprogramação', '')).toBe('Reprogramação');
  });
  it('resumo da comparação numa linha', () => {
    expect(resumoDaComparacao(semLB, 'Abr/26')).toBe('Base: nenhuma · Reprogramação: nenhuma · Mês: Abr/26');
    expect(resumoDaComparacao(comLB)).toBe('Base: LB 1 · Reprogramação: nenhuma');
  });
  it('cor do número: zero apagado, desvio pelo sinal, demais pela linha', () => {
    expect(tomDoValor('marca', 12)).toBe('marca');
    expect(tomDoValor('marca', 0)).toBe('apagado');
    expect(tomDoValor('marca', null)).toBe('apagado');
    expect(tomDoValor('desvio', 1.5)).toBe('positivo');
    expect(tomDoValor('desvio', -0.2)).toBe('negativo');
    expect(tomDoValor('desvio', 0.001)).toBe('apagado');
  });
  it('mês vizinho para os botões, sem sair da lista', () => {
    expect(mesVizinho(months, 0, -1)).toBeNull();
    expect(mesVizinho(months, 0, 1)).toBe(months[1].key);
    expect(mesVizinho(months, months.length - 1, 1)).toBeNull();
  });
});

describe('Curva Física: distribuição por tarefa', () => {
  const total = 320000;
  const planned = totaisDoUso(months, monthlyDist).porMes;
  const linhas = linhasDaDistribuicao({ etapas, months, monthlyDist, custoOrcadoMap: custoMap, total, selIdx: 0 });
  it('só grupos de nível 0 e tarefas marcadas na coluna Curva', () => {
    expect(linhas.map(l => l.e.id)).toEqual(['G1', 'B', 'G3']);
  });
  it('valor, peso e % por mês', () => {
    const g1 = linhas[0];
    expect(g1.custo).toBe(300000);
    expect(g1.peso).toBeCloseTo(300000 / 320000 * 100);
    expect(g1.pctMeses.reduce((s, x) => s + x, 0)).toBeCloseTo(100);
    const b = linhas[1];
    expect(b.custo).toBe(120000);
    expect(b.peso).toBeCloseTo(37.5);
    expect(b.pctMeses.reduce((s, x) => s + x, 0)).toBeCloseTo(100);
  });
  it('conclusão até o mês de referência é cumulativa', () => {
    const ate0 = linhasDaDistribuicao({ etapas, months, monthlyDist, custoOrcadoMap: custoMap, total, selIdx: 0 })[1].conc;
    const ateFim = linhasDaDistribuicao({ etapas, months, monthlyDist, custoOrcadoMap: custoMap, total, selIdx: months.length - 1 })[1].conc;
    expect(ate0).toBeGreaterThan(0);
    expect(ate0).toBeLessThan(100);
    expect(ateFim).toBeCloseTo(100);
  });
  it('tarefa sem custo não tem peso nem conclusão', () => {
    const l = linhasDaDistribuicao({ etapas, months, monthlyDist, custoOrcadoMap: {}, total: 0, selIdx: 0 });
    expect(l[1].peso).toBeNull();
    expect(l[1].conc).toBe(0);
    expect(l[1].pctMeses.every(p => p === 0)).toBe(true);
  });
  it('rodapé: 100% no total e conclusão geral até o mês de referência', () => {
    const r = rodapeDaDistribuicao({ months, planned, total, selIdx: months.length - 1 });
    expect(r.custo).toBe(total);
    expect(r.conc).toBeCloseTo(100);
    expect(r.pctMeses.reduce((s, x) => s + x, 0)).toBeCloseTo(100);
    expect(rodapeDaDistribuicao({ months, planned: {}, total: 0, selIdx: 0 }).conc).toBe(0);
  });
  it('fundo da linha pelo nível da EAP', () => {
    expect(fundoDaDistribuicao({ isGroup: true, nivel: 0 })).toBe('var(--dist-nivel-1)');
    expect(fundoDaDistribuicao({ isGroup: true, nivel: 1 })).toBe('var(--dist-nivel-1)');
    expect(fundoDaDistribuicao({ isGroup: true, nivel: 2 })).toBe('var(--dist-nivel-2)');
    expect(fundoDaDistribuicao({ isGroup: true, nivel: 3 })).toBeNull();
    expect(fundoDaDistribuicao({ isGroup: false, nivel: 0 })).toBeNull();
  });
});
