import { describe, it, expect } from 'vitest';
import { letraDaColuna, comprimirLinhas, montarSomasDosGrupos } from '../modules/cronograma/excelSomaGrupos';
import { aplicarEstiloLinha, XLSX_GROUP_ROW_STYLE } from '../modules/cronograma/cronogramaShared';

// Árvore do print do usuário (Lista de Tarefas, primeira linha de dados = linha 5 da planilha):
//  5 Resumo (grupo)
//  6   SERVIÇOS INICIAIS (grupo)         7-9 três tarefas
// 10   INFRAESTRUTURA (grupo)
// 11     FUNDAÇÃO (grupo)                12-14 três tarefas
// 15       Estacas (grupo)               16 Perfil metálico
// 17       Contenção (grupo)             18 Contenção
// 19       Fundação Blocos (grupo)       20-22 três tarefas
// 23       Cisterna (grupo)              24-25 duas tarefas
const g = (id, parentId) => ({ id, parentId, isGroup: true });
const t = (id, parentId) => ({ id, parentId, isGroup: false });
const arvore = [
  g('resumo', null),
  g('servicos', 'resumo'), t('limpeza', 'servicos'), t('tapume', 'servicos'), t('barracao', 'servicos'),
  g('infra', 'resumo'),
  g('fundacao', 'infra'), t('locacao', 'fundacao'), t('escavacao', 'fundacao'), t('rebaixamento', 'fundacao'),
  g('estacas', 'fundacao'), t('perfil', 'estacas'),
  g('contencao', 'fundacao'), t('contencao1', 'contencao'),
  g('blocos', 'fundacao'), t('b1', 'blocos'), t('b2', 'blocos'), t('b3', 'blocos'),
  g('cisterna', 'fundacao'), t('lajeFundo', 'cisterna'), t('lajeTeto', 'cisterna'),
];
const J = 9; // coluna J (0 = A)
const linhaDe = (id, lista = arvore) => lista.findIndex((e) => e.id === id);

describe('letraDaColuna', () => {
  it('A a Z e depois AA, AB...', () => {
    expect(letraDaColuna(0)).toBe('A');
    expect(letraDaColuna(9)).toBe('J');
    expect(letraDaColuna(25)).toBe('Z');
    expect(letraDaColuna(26)).toBe('AA');
    expect(letraDaColuna(27)).toBe('AB');
    expect(letraDaColuna(51)).toBe('AZ');
    expect(letraDaColuna(52)).toBe('BA');
  });
});

describe('comprimirLinhas', () => {
  it('linhas seguidas viram intervalo, as soltas ficam sozinhas', () => {
    expect(comprimirLinhas([12, 13, 14, 15, 17, 19, 23], 'J')).toBe('J12:J15,J17,J19,J23');
  });
  it('uma linha só e duas seguidas', () => {
    expect(comprimirLinhas([7], 'J')).toBe('J7');
    expect(comprimirLinhas([7, 8], 'J')).toBe('J7:J8');
  });
  it('ordena e ignora repetidas', () => {
    expect(comprimirLinhas([14, 12, 13, 13], 'K')).toBe('K12:K14');
  });
});

describe('montarSomasDosGrupos (árvore do print)', () => {
  const r = montarSomasDosGrupos({ exportadas: arvore, todas: arvore, colunas: [J], primeiraLinhaExcel: 5 });
  const f = (id) => r.porLinha.get(linhaDe(id))?.[J];

  it('grupo só com tarefas soma o intervalo dos filhos', () => {
    expect(f('servicos')).toBe('SUM(J7:J9)');
    expect(f('cisterna')).toBe('SUM(J24:J25)');
    expect(f('blocos')).toBe('SUM(J20:J22)');
  });
  it('a FUNDAÇÃO soma as 3 tarefas E os 4 subgrupos, não só J12:J14', () => {
    expect(f('fundacao')).toBe('SUM(J12:J15,J17,J19,J23)');
  });
  it('grupo de grupos soma só os filhos diretos (cada um já soma os seus)', () => {
    expect(f('infra')).toBe('SUM(J11)');
    expect(f('resumo')).toBe('SUM(J6,J10)');
  });
  it('tarefa comum não ganha fórmula', () => {
    expect(r.porLinha.has(linhaDe('limpeza'))).toBe(false);
    expect(r.porLinha.size).toBe(arvore.filter((e) => e.isGroup).length);
  });
  it('o Total soma as tarefas de topo', () => {
    expect(r.total).toEqual({ [J]: 'SUM(J5)' });
    expect(r.linhasDoTotal).toEqual([5]);
  });
});

describe('montarSomasDosGrupos (casos de borda)', () => {
  it('várias colunas: uma fórmula por coluna, com a letra certa', () => {
    const r = montarSomasDosGrupos({ exportadas: arvore, todas: arvore, colunas: [9, 10, 27], primeiraLinhaExcel: 5 });
    expect(r.porLinha.get(linhaDe('servicos'))).toEqual({ 9: 'SUM(J7:J9)', 10: 'SUM(K7:K9)', 27: 'SUM(AB7:AB9)' });
    expect(r.total).toEqual({ 9: 'SUM(J5)', 10: 'SUM(K5)', 27: 'SUM(AB5)' });
  });
  it('sem coluna de valor visível não há fórmula nenhuma', () => {
    const r = montarSomasDosGrupos({ exportadas: arvore, todas: arvore, colunas: [], primeiraLinhaExcel: 5 });
    expect(r.porLinha.size).toBe(0);
    expect(r.total).toBeNull();
    expect(r.linhasDoTotal).toEqual([]);
  });
  it('a primeira linha muda os números das linhas', () => {
    const r = montarSomasDosGrupos({ exportadas: arvore, todas: arvore, colunas: [J], primeiraLinhaExcel: 2 });
    expect(r.porLinha.get(linhaDe('servicos'))[J]).toBe('SUM(J4:J6)');
  });
  it('grupo sem filhos (vazio) mantém o número fixo', () => {
    const lista = [g('a', null), g('vazio', 'a')];
    const r = montarSomasDosGrupos({ exportadas: lista, todas: lista, colunas: [J], primeiraLinhaExcel: 5 });
    expect(r.porLinha.has(1)).toBe(false);
    expect(r.porLinha.get(0)[J]).toBe('SUM(J6)'); // o grupo "a" soma o subgrupo vazio (que vale 0)
  });
  it('grupo com filho fora da exportação (filtro ou recolhido) mantém o número fixo', () => {
    // sem a tarefa "tapume": a soma do Excel não bateria com a tela
    const exportadas = arvore.filter((e) => e.id !== 'tapume');
    const r = montarSomasDosGrupos({ exportadas, todas: arvore, colunas: [J], primeiraLinhaExcel: 5 });
    expect(r.porLinha.has(linhaDe('servicos', exportadas))).toBe(false);
    // os outros grupos, que estão completos, continuam com fórmula (e as linhas deslocam 1)
    expect(r.porLinha.get(linhaDe('cisterna', exportadas))[J]).toBe('SUM(J23:J24)');
  });
  it('subgrupos recolhidos: eles ficam fixos e o pai deles soma os subgrupos normalmente', () => {
    // só os netos da FUNDAÇÃO ficam de fora; as 3 tarefas e os 4 subgrupos dela continuam na planilha
    const exportadas = arvore.filter((e) => !['perfil', 'contencao1', 'b1', 'b2', 'b3', 'lajeFundo', 'lajeTeto'].includes(e.id));
    const r = montarSomasDosGrupos({ exportadas, todas: arvore, colunas: [J], primeiraLinhaExcel: 5 });
    ['estacas', 'contencao', 'blocos', 'cisterna'].forEach((id) => expect(r.porLinha.has(linhaDe(id, exportadas))).toBe(false));
    expect(r.porLinha.get(linhaDe('fundacao', exportadas))[J]).toBe('SUM(J12:J18)');
    expect(r.total).toBeNull(); // faltam tarefas na planilha
  });
  it('exportação incompleta: Total fica fixo', () => {
    const exportadas = arvore.filter((e) => e.id !== 'limpeza');
    expect(montarSomasDosGrupos({ exportadas, todas: arvore, colunas: [J], primeiraLinhaExcel: 5 }).total).toBeNull();
  });
  it('várias tarefas de topo (sem o grupo Resumo): o Total soma todas', () => {
    const lista = [t('x', null), g('grp', null), t('y', 'grp'), t('z', null)];
    const r = montarSomasDosGrupos({ exportadas: lista, todas: lista, colunas: [J], primeiraLinhaExcel: 5 });
    expect(r.total).toEqual({ [J]: 'SUM(J5:J6,J8)' });
    expect(r.linhasDoTotal).toEqual([5, 6, 8]);
    expect(r.porLinha.get(1)[J]).toBe('SUM(J7)');
  });
  it('lista vazia não quebra', () => {
    const r = montarSomasDosGrupos({ exportadas: [], todas: [], colunas: [J], primeiraLinhaExcel: 5 });
    expect(r.porLinha.size).toBe(0);
    expect(r.total).toBeNull();
  });
});

// Prova de que a fórmula dá o MESMO número que a tela: os valores das 3 colunas são calculados pelas funções reais do
// app (valor vinculado com vínculo em grupo e em folha, fator de peso, valor travado, custo real) e cada fórmula é
// "calculada" aqui por um somador mínimo, para comparar com o valor que a tela mostra no grupo.
describe('a fórmula reproduz os valores que a tela mostra', () => {
  const nova = (id, parentId, isGroup, extra = {}) => ({ id, parentId, isGroup, nivel: 0, fator_peso: 1, valorVinculadoFixo: null, custoRealizado: 0, ...extra });
  const etapas = [
    nova('raiz', null, true),
    nova('A', 'raiz', true),
    nova('a1', 'A', false, { custoRealizado: 100 }), nova('a2', 'A', false), nova('a3', 'A', false, { fator_peso: 2, custoRealizado: 33.33 }),
    nova('A1', 'A', true), nova('a4', 'A1', false, { custoRealizado: 7.1 }), nova('a5', 'A1', false, { valorVinculadoFixo: 300 }),
    nova('B', 'raiz', true), nova('b1', 'B', false), nova('b2', 'B', false, { custoRealizado: 50.35 }),
    nova('c', 'raiz', false, { custoRealizado: 12.5 }),
  ];
  const porId = Object.fromEntries(etapas.map((e) => [e.id, e]));
  const nivelDe = (e) => (e.parentId ? 1 + nivelDe(porId[e.parentId]) : 0);
  etapas.forEach((e) => { e.nivel = nivelDe(e); });

  it('Valor Total, Valor Vinculado e Valor Real de cada grupo e o Total batem com a soma da fórmula', async () => {
    const { computeValorVinculadoMap, computeCustoOrcadoMap } = await import('../modules/cronograma/ganttUtils');
    const vinculos = [{ etapa_id: 'A', orcamento_item_id: 'i1' }, { etapa_id: 'b1', orcamento_item_id: 'i2' }];
    const vv = computeValorVinculadoMap(etapas, vinculos, { i1: 10000.37, i2: 2500.5 });
    const co = computeCustoOrcadoMap(etapas, vv);

    // mesmas regras do getCellVal do exportExcelLista
    const celula = (e, col) => {
      if (col === 0) return co[e.id] || 0;
      if (col === 1) return vv[e.id] || '';
      return e.isGroup ? (co[e.id] || 0) - (vv[e.id] || 0) : (e.custoRealizado || 0);
    };
    const primeira = 5;
    const valoresPorLinha = [0, 1, 2].map((col) => Object.fromEntries(etapas.map((e, i) => [primeira + i, celula(e, col)])));
    const somas = montarSomasDosGrupos({ exportadas: etapas, todas: etapas, colunas: [0, 1, 2], primeiraLinhaExcel: primeira });
    const somar = (formula, col) => formula.replace(/^SUM\(|\)$/g, '').split(',').reduce((s, arg) => {
      const [ini, fim] = arg.split(':').map((x) => Number(x.replace(/[A-Z]+/, '')));
      for (let r = ini; r <= (fim ?? ini); r++) s += Number(valoresPorLinha[col][r]) || 0;
      return s;
    }, 0);

    expect(somas.porLinha.size).toBe(etapas.filter((e) => e.isGroup).length);
    somas.porLinha.forEach((fs, i) => {
      [0, 1, 2].forEach((col) => {
        expect(somar(fs[col], col), `${etapas[i].id} coluna ${col}`).toBeCloseTo(Number(celula(etapas[i], col)) || 0, 6);
      });
    });
    const topo = etapas.filter((e) => e.parentId == null);
    [0, 1, 2].forEach((col) => {
      const esperado = topo.reduce((s, e) => s + (Number(celula(e, col)) || 0), 0);
      expect(somar(somas.total[col], col)).toBeCloseTo(esperado, 6);
    });
    // e o valor do grupo "A" é de fato maior que zero, para o teste não passar com tudo zerado
    expect(co.A).toBeGreaterThan(10000);
  });
});

// Ida e volta com a biblioteca real: a fórmula tem de sobreviver ao formato numérico e ao estilo de grupo que o
// exportExcelLista aplica depois, e ser gravada com o valor calculado (visualizadores que não recalculam).
describe('planilha gravada com a biblioteca (xlsx-js-style)', () => {
  it('grupo sai com fórmula e valor, formato de moeda e estilo de grupo preservados', async () => {
    const mod = await import('xlsx-js-style');
    const XLSX = mod.utils ? mod : mod.default;
    const HEADER_ROW = 3;
    const lista = [g('grupo', null), t('a', 'grupo'), t('b', 'grupo')];
    const valores = [10, 4, 6];
    // a célula do Total começa em branco (como o Valor Vinculado do exportExcelLista): o valor guardado vem da soma do topo
    const rows = [['Título'], ['Gerado em'], [], ['Etapa', 'Valor Total'], ...lista.map((e, i) => [e.id, valores[i]]), ['Total', '']];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const somas = montarSomasDosGrupos({ exportadas: lista, todas: lista, colunas: [1], primeiraLinhaExcel: HEADER_ROW + 2 });
    const totalRowIdx = HEADER_ROW + 1 + lista.length;
    const aplicar = (r, c, f, valor) => { const addr = XLSX.utils.encode_cell({ r, c }); ws[addr] = { t: 'n', v: valor ?? (Number(ws[addr]?.v) || 0), f }; };
    somas.porLinha.forEach((fs, i) => Object.entries(fs).forEach(([c, f]) => aplicar(HEADER_ROW + 1 + i, Number(c), f)));
    if (somas.total) {
      const somaTopo = (c) => somas.linhasDoTotal.reduce((s, linha) => s + (Number(ws[XLSX.utils.encode_cell({ r: linha - 1, c })]?.v) || 0), 0);
      Object.entries(somas.total).forEach(([c, f]) => aplicar(totalRowIdx, Number(c), f, somaTopo(Number(c))));
    }
    for (let R = HEADER_ROW + 1; R <= totalRowIdx; R++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: 1 });
      if (ws[addr]) ws[addr].z = '#,##0.00';
    }
    aplicarEstiloLinha(XLSX, ws, HEADER_ROW + 1, 2, XLSX_GROUP_ROW_STYLE);
    // o estilo de grupo é aplicado DEPOIS da fórmula e não pode apagá-la
    expect(ws.B5.s.font.bold).toBe(true);
    expect(ws.B5.f).toBe('SUM(B6:B7)');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tarefas');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const lido = XLSX.read(buf, { cellFormula: true, cellNF: true });
    const aba = lido.Sheets.Tarefas;
    expect(aba.B5.f).toBe('SUM(B6:B7)');
    expect(aba.B5.v).toBe(10);
    expect(aba.B5.z).toBe('#,##0.00');
    expect(aba.B6.f).toBeUndefined(); // tarefa comum continua valor fixo
    expect(aba.B6.v).toBe(4);
    expect(aba.B8.f).toBe('SUM(B5)'); // linha Total
    expect(aba.B8.v).toBe(10);
  });
});
