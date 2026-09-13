// Testes unitários da lógica pura da Medição Mensal.
// Roda em node (sem browser/Supabase). Executar: npm test
import { describe, it, expect } from 'vitest';
import {
  buildItensMedicao, listarTarefasForaDoMes, computeArvoreMedicao, computeTotaisMedicao,
  gruposParaNivel, buildSnapshotFechamento, hidratarSnapshot, computeDisciplinaInfo,
  computeArvoreForaDoMes, computeResumo, validarAbertura, validarFechamento,
} from '../modules/cronograma/medicaoMensalPure';
import { dateToOffset } from '../modules/cronograma/cronogramaDateUtils';

// Hierarquia: 1 ESTRUTURA > 1.1 TERREO > (folhas Forma, Concreto); 2 ESTACAS > folha pav1.
// A folha "FUTURA" não tem fatia no mês de referência — é o caso "fora do mês".
// dd/mm/aaaa
const DATA_BR = /^\d{2}\/\d{2}\/\d{4}$/;

const MES = '2026-07';
const etapas = [
  { id: 'G1', etapa: 'ESTRUTURA', isGroup: true,  nivel: 0, parentId: null, inicio: 850, dur: 30, avanco: 50 },
  { id: 'G2', etapa: 'TERREO',    isGroup: true,  nivel: 1, parentId: 'G1', inicio: 850, dur: 20, avanco: 50 },
  { id: 'A',  etapa: 'Forma',     isGroup: false, nivel: 2, parentId: 'G2', inicio: 850, dur: 10, avanco: 100, custo: 1000 },
  { id: 'B',  etapa: 'Concreto',  isGroup: false, nivel: 2, parentId: 'G2', inicio: 860, dur: 10, avanco: 0,   custo: 1000 },
  { id: 'G3', etapa: 'ESTACAS',   isGroup: true,  nivel: 0, parentId: null, inicio: 855, dur: 5,  avanco: 0 },
  { id: 'C',  etapa: 'pav1',      isGroup: false, nivel: 1, parentId: 'G3', inicio: 855, dur: 5,  avanco: 0,   custo: 500 },
  // custoRealizado (não custo) é o que alimenta o "valor cheio" fora do mês desde a
  // mudança do peso do Avanço Físico para Custo Orçado (valor vinculado + custo real).
  { id: 'F',  etapa: 'FUTURA',    isGroup: false, nivel: 1, parentId: 'G3', inicio: 1200, dur: 5, avanco: 40,  custo: 800, custoRealizado: 800 },
];
const wbsMap = { G1: '1', G2: '1.1', A: '1.1.1', B: '1.1.2', G3: '2', C: '2.1', F: '2.2' };
// Só A, B e C têm fatia no mês; F fica de fora de propósito.
const monthlyDist = {
  A: { [MES]: 1000 },
  B: { [MES]: 1000 },
  C: { [MES]: 500 },
  F: { '2027-01': 800 },
};
const disciplinaInfo = computeDisciplinaInfo(etapas, wbsMap);
const opts = { monthlyDist, wbsMap, disciplinaInfo };

describe('buildItensMedicao', () => {
  it('traz só as folhas com fatia no mês (grupos ficam fora)', () => {
    const itens = buildItensMedicao(etapas, MES, opts);
    expect(itens.map(i => i.id)).toEqual(['A', 'B', 'C']);
    expect(itens.every(i => !i.foraDoMes)).toBe(true);
  });

  it('formata as datas como dd/mm/aaaa e mantém os offsets crus', () => {
    const [a] = buildItensMedicao(etapas, MES, opts);
    expect(a.dataInicio).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(a.dataTermino).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(a.inicioOff).toBe(850);
    expect(typeof a.terminoOff).toBe('number');
  });

  it('usa a fatia do mês como valor do item', () => {
    const itens = buildItensMedicao(etapas, MES, opts);
    expect(itens.find(i => i.id === 'C').valor).toBe(500);
  });

  it('idsExtras traz o item fora do mês com o valor cheio da tarefa', () => {
    const itens = buildItensMedicao(etapas, MES, { ...opts, idsExtras: new Set(['F']) });
    const f = itens.find(i => i.id === 'F');
    expect(f).toBeDefined();
    expect(f.foraDoMes).toBe(true);
    expect(f.valor).toBe(800); // custo cheio, não fatia
  });

  it('valorVinculadoMap soma com o custo real no item fora do mês (Custo Orçado)', () => {
    const itens = buildItensMedicao(etapas, MES, {
      ...opts, idsExtras: new Set(['F']), valorVinculadoMap: { F: 2500 },
    });
    expect(itens.find(i => i.id === 'F').valor).toBe(2500 + 800); // valor vinculado + custo real de F
  });
});

describe('listarTarefasForaDoMes', () => {
  it('traz só as folhas sem fatia no mês, excluindo grupos', () => {
    const candidatas = listarTarefasForaDoMes(etapas, MES, opts);
    expect(candidatas.map(c => c.id)).toEqual(['F']);
  });

  it('traz os campos de exibição da candidata', () => {
    const [f] = listarTarefasForaDoMes(etapas, MES, opts);
    expect(f).toMatchObject({ id: 'F', wbs: '2.2', descricao: 'FUTURA', pavimento: '—', valor: 800 });
  });

  it('valorVinculadoMap soma com o custo real (Custo Orçado)', () => {
    const [f] = listarTarefasForaDoMes(etapas, MES, { ...opts, valorVinculadoMap: { F: 2500 } });
    expect(f.valor).toBe(2500 + 800); // valor vinculado + custo real de F
  });

  it('exclui tarefa cuja fatia é toda no PASSADO (já devia ter sido medida, não é "adiantada")', () => {
    const etapasComPassada = [
      ...etapas,
      { id: 'P', etapa: 'PASSADA', isGroup: false, nivel: 0, parentId: null, inicio: 1, dur: 5, avanco: 100, custo: 900 },
    ];
    const distComPassada = { ...monthlyDist, P: { '2026-01': 900 } }; // antes de MES ('2026-07')
    const candidatas = listarTarefasForaDoMes(etapasComPassada, MES, { ...opts, monthlyDist: distComPassada });
    expect(candidatas.map(c => c.id)).toEqual(['F']); // só a futura, não a passada
  });
});

describe('validarAbertura', () => {
  const wbsAbertura = { P: '9', Q: '9.1', R: '9.2', G: '9.3' };
  // dur: 0 faz taskEnd = inicio (sem caminhar por dias úteis) — isola o teste do
  // calendário de trabalho (feriados/fim de semana), que é estado de módulo mutável.
  const etapasAbertura = [
    { id: 'P', etapa: 'Atrasada',       isGroup: false, nivel: 0, parentId: null, inicio: dateToOffset('2026-05-15'), dur: 0, avanco: 40 },
    { id: 'Q', etapa: 'AtrasadaMas100', isGroup: false, nivel: 0, parentId: null, inicio: dateToOffset('2026-05-15'), dur: 0, avanco: 100 },
    { id: 'R', etapa: 'DesteMes',       isGroup: false, nivel: 0, parentId: null, inicio: dateToOffset('2026-07-15'), dur: 0, avanco: 30 },
    { id: 'G', etapa: 'GrupoAtrasado',  isGroup: true,  nivel: 0, parentId: null, inicio: dateToOffset('2026-05-15'), dur: 0, avanco: 20 },
  ];

  it('bloqueia e lista só a folha com término num mês anterior e avanço < 100', () => {
    const { ok, pendentes } = validarAbertura(etapasAbertura, MES, wbsAbertura);
    expect(ok).toBe(false);
    expect(pendentes.map(p => p.id)).toEqual(['P']);
    expect(pendentes[0]).toMatchObject({ wbs: '9', descricao: 'Atrasada', avanco: 40, terminoMes: '2026-05' });
  });

  it('não bloqueia com avanço 100, término do próprio mês/futuro, ou grupo', () => {
    const { ok, pendentes } = validarAbertura(etapasAbertura.filter(e => e.id !== 'P'), MES, wbsAbertura);
    expect(ok).toBe(true);
    expect(pendentes).toEqual([]);
  });

  it('bloqueia tarefa que começou num mês anterior e segue em 0%, mesmo com término no mês atual/futuro', () => {
    // dur: 30 (dias úteis) garante término bem depois do início — cai em julho (MES) ou
    // depois, então quem pega esta tarefa é só a branch nova (início zerado), não a de término.
    const etapasZeradas = [
      { id: 'Z', etapa: 'NuncaComecou', isGroup: false, nivel: 0, parentId: null, inicio: dateToOffset('2026-06-10'), dur: 30, avanco: 0 },
    ];
    const { ok, pendentes } = validarAbertura(etapasZeradas, MES, { Z: '9.4' });
    expect(ok).toBe(false);
    expect(pendentes.map(p => p.id)).toEqual(['Z']);
    expect(pendentes[0]).toMatchObject({ motivo: 'zerada', inicioMes: '2026-06', avanco: 0 });
  });

  it('não bloqueia tarefa em 0% que começa no próprio mês sendo aberto (ou depois)', () => {
    const etapasZeradas = [
      { id: 'Z2', etapa: 'ComecaEsteMes', isGroup: false, nivel: 0, parentId: null, inicio: dateToOffset('2026-07-20'), dur: 0, avanco: 0 },
    ];
    const { ok, pendentes } = validarAbertura(etapasZeradas, MES, { Z2: '9.5' });
    expect(ok).toBe(true);
    expect(pendentes).toEqual([]);
  });
});

describe('validarFechamento', () => {
  it('bloqueia item com % medido acima do % executado e marca atravessaMes quando início/término caem em meses diferentes', () => {
    const itens = [{
      id: 'BL2', wbs: '1.2', descricao: 'BL2', percMedido: 100, percExecutado: 46,
      inicioOff: dateToOffset('2026-09-25'), terminoOff: dateToOffset('2026-10-09'), // término (offset exclusivo -1) cai em outubro
    }];
    const { ok, violacoes } = validarFechamento(itens);
    expect(ok).toBe(false);
    expect(violacoes).toHaveLength(1);
    expect(violacoes[0]).toMatchObject({ id: 'BL2', atravessaMes: true });
  });

  it('bloqueia mas NÃO marca atravessaMes quando a tarefa fica dentro de um único mês', () => {
    const itens = [{
      id: 'BL1', wbs: '1.1', descricao: 'BL1', percMedido: 80, percExecutado: 50,
      inicioOff: dateToOffset('2026-09-11'), terminoOff: dateToOffset('2026-09-24'),
    }];
    const { ok, violacoes } = validarFechamento(itens);
    expect(ok).toBe(false);
    expect(violacoes[0]).toMatchObject({ id: 'BL1', atravessaMes: false });
  });

  it('não bloqueia quando % medido está dentro do % executado', () => {
    const itens = [{
      id: 'OK', wbs: '1.3', descricao: 'OK', percMedido: 50, percExecutado: 50,
      inicioOff: dateToOffset('2026-09-11'), terminoOff: dateToOffset('2026-09-24'),
    }];
    const { ok, violacoes } = validarFechamento(itens);
    expect(ok).toBe(true);
    expect(violacoes).toEqual([]);
  });
});

describe('computeArvoreMedicao', () => {
  const itens = buildItensMedicao(etapas, MES, opts);
  const base = itens.reduce((s, i) => s + i.valor, 0); // 2500

  it('monta a hierarquia real, na ordem do cronograma', () => {
    const linhas = computeArvoreMedicao(itens, etapas, base);
    expect(linhas.map(l => `${l.tipo}:${l.descricao}`)).toEqual([
      'grupo:ESTRUTURA', 'grupo:TERREO', 'item:Forma', 'item:Concreto',
      'grupo:ESTACAS', 'item:pav1',
    ]);
  });

  it('preserva o nível de cada linha (base da indentação)', () => {
    const linhas = computeArvoreMedicao(itens, etapas, base);
    expect(linhas.map(l => l.nivel)).toEqual([0, 1, 2, 2, 0, 1]);
  });

  it('omite grupo sem nenhuma folha medível dentro', () => {
    const soC = itens.filter(i => i.id === 'C');
    const linhas = computeArvoreMedicao(soC, etapas, base);
    expect(linhas.map(l => l.descricao)).toEqual(['ESTACAS', 'pav1']);
  });

  it('agrega no grupo por média ponderada de valor', () => {
    const linhas = computeArvoreMedicao(itens, etapas, base);
    const terreo = linhas.find(l => l.descricao === 'TERREO');
    expect(terreo.valor).toBe(2000);
    expect(terreo.exec).toBe(50); // (1000*100 + 1000*0) / 2000
  });

  it('grupo recolhido esconde toda a descendência, em qualquer profundidade', () => {
    const linhas = computeArvoreMedicao(itens, etapas, base, new Set(['G1']));
    expect(linhas.map(l => l.descricao)).toEqual(['ESTRUTURA', 'ESTACAS', 'pav1']);
    expect(linhas.find(l => l.descricao === 'ESTRUTURA').colapsado).toBe(true);
  });

  it('devolve vazio sem itens', () => {
    expect(computeArvoreMedicao([], etapas, 0)).toEqual([]);
  });

  it('peso do grupo ignora o item fora do mês, mas o valor bruto o inclui', () => {
    // F (800, fora do mês) fica sob ESTACAS, junto de C (500, previsto).
    const comExtra = buildItensMedicao(etapas, MES, { ...opts, idsExtras: new Set(['F']) });
    const linhas = computeArvoreMedicao(comExtra, etapas, base);
    const estacas = linhas.find(l => l.descricao === 'ESTACAS');
    expect(estacas.valorPrevisto).toBe(500);                    // só o do mês
    expect(estacas.valor).toBe(1300);                           // 500 + 800
    expect(estacas.peso).toBeCloseTo((500 / base) * 100, 5);    // peso sem o extra
  });

  it('valor medido do grupo é igual à soma do líquido dos filhos', () => {
    const linhas = computeArvoreMedicao(itens, etapas, base);
    const terreo = linhas.find(l => l.descricao === 'TERREO');
    const filhos = itens.filter(i => ['A', 'B'].includes(i.id));
    const somaFilhos = filhos.reduce((s, i) => s + (i.valor * i.percMedido) / 100, 0);
    expect((terreo.valor * terreo.med) / 100).toBeCloseTo(somaFilhos, 5);
  });
});

describe('gruposParaNivel', () => {
  const itens = buildItensMedicao(etapas, MES, opts);
  const linhas = computeArvoreMedicao(itens, etapas, 2500);

  it('nível 0 expande tudo', () => {
    expect(gruposParaNivel(linhas, 0).size).toBe(0);
  });
  it('nível 1 recolhe a partir da raiz', () => {
    expect([...gruposParaNivel(linhas, 1)].sort()).toEqual(['G1', 'G2', 'G3']);
  });
  it('nível 2 mantém a raiz aberta', () => {
    expect([...gruposParaNivel(linhas, 2)]).toEqual(['G2']);
  });
});

describe('computeTotaisMedicao', () => {
  it('itens fora do mês somam ao realizado, não ao previsto', () => {
    const doMes = buildItensMedicao(etapas, MES, opts);
    const base = doMes.reduce((s, i) => s + i.valor, 0); // 2500 = previsto do mês

    const semExtra = computeTotaisMedicao(doMes, base);
    expect(semExtra.exec).toBeCloseTo(40, 5); // (1000*100)/2500

    // Com o item fora do mês: mesmo denominador, numerador maior.
    const comExtra = buildItensMedicao(etapas, MES, { ...opts, idsExtras: new Set(['F']) });
    const totais = computeTotaisMedicao(comExtra, base);
    expect(totais.exec).toBeCloseTo(40 + (800 * 40) / 2500, 5);
    expect(totais.exec).toBeGreaterThan(semExtra.exec);
    expect(totais.qtd).toBe(4);
  });

  it('deixa o percentual passar de 100 quando se produziu além do previsto', () => {
    const itens = [
      { id: 'X', valor: 1000, percExecutado: 100, percMedido: 100, foraDoMes: false },
      { id: 'Y', valor: 500, percExecutado: 100, percMedido: 100, foraDoMes: true },
    ];
    expect(computeTotaisMedicao(itens, 1000).exec).toBeCloseTo(150, 5);
  });

  // O peso é participação no PREVISTO, então o item fora do mês não pode entrar nele —
  // era o que fazia o total mostrar 129,6% em vez de 100%.
  it('peso do total fica em 100% mesmo com itens fora do mês', () => {
    const itens = [
      { id: 'X', valor: 1000, percExecutado: 100, percMedido: 100, foraDoMes: false },
      { id: 'Y', valor: 500, percExecutado: 100, percMedido: 100, foraDoMes: true },
    ];
    const t = computeTotaisMedicao(itens, 1000);
    expect(t.peso).toBeCloseTo(100, 5);
    expect(t.valorPrevisto).toBe(1000); // sem o extra
    expect(t.valor).toBe(1500);         // com o extra (base da coluna "a medir")
  });

  it('valorAMedir soma o líquido de todos, inclusive os extras', () => {
    const itens = [
      { id: 'X', valor: 1000, percExecutado: 100, percMedido: 50, foraDoMes: false },
      { id: 'Y', valor: 500, percExecutado: 100, percMedido: 100, foraDoMes: true },
    ];
    expect(computeTotaisMedicao(itens, 1000).valorAMedir).toBeCloseTo(1000, 5);
  });
});

describe('buildSnapshotFechamento', () => {
  it('congela totais e os campos de cada item', () => {
    const itens = buildItensMedicao(etapas, MES, opts);
    const totais = computeTotaisMedicao(itens, 2500);
    const snap = buildSnapshotFechamento(itens, totais);
    expect(snap.valorTotalMedido).toBe(totais.valorAMedir);
    expect(snap.percMedido).toBe(totais.med);
    expect(snap.percPrevisto).toBe(100);
    expect(snap.itens).toHaveLength(3);
    // Congela também os campos de exibição, senão a tela de uma medição fechada
    // precisaria voltar ao cronograma para montar a árvore e as datas.
    expect(Object.keys(snap.itens[0]).sort()).toEqual([
      'dataInicio', 'dataTermino', 'descricao', 'duracaoDias', 'foraDoMes', 'id',
      'nivel', 'parentId', 'pavimento', 'percExecutado', 'percMedido', 'valor', 'wbs',
    ]);
  });
});

describe('hidratarSnapshot', () => {
  const itens = buildItensMedicao(etapas, MES, opts);
  const totais = computeTotaisMedicao(itens, 2500);
  const snap = buildSnapshotFechamento(itens, totais);

  it('reconstrói as linhas sem depender do cronograma', () => {
    const linhas = hidratarSnapshot(snap.itens, [], { wbsMap, disciplinaInfo });
    expect(linhas.map(l => l.id)).toEqual(['A', 'B', 'C']);
    expect(linhas[0].descricao).toBe('Forma');
    expect(linhas[0].dataInicio).toMatch(DATA_BR);
  });

  it('mantém os valores congelados mesmo se o cronograma mudar', () => {
    const etapasMudadas = etapas.map(e => (e.id === 'A' ? { ...e, custo: 999999, avanco: 0 } : e));
    const linhas = hidratarSnapshot(snap.itens, etapasMudadas, { wbsMap, disciplinaInfo });
    const a = linhas.find(l => l.id === 'A');
    expect(a.valor).toBe(1000);        // fatia congelada, não o custo novo
    expect(a.percExecutado).toBe(100); // avanço congelado, não o zerado
  });

  it('cai no cronograma só para os campos de exibição de snapshots antigos', () => {
    const antigo = [{ id: 'A', wbs: '1.1.1', descricao: 'Forma', pavimento: '—', valor: 1000, foraDoMes: false, percExecutado: 100, percMedido: 100 }];
    const [linha] = hidratarSnapshot(antigo, etapas, { wbsMap, disciplinaInfo });
    expect(linha.nivel).toBe(2);                                  // veio do cronograma
    expect(linha.dataInicio).toMatch(DATA_BR); // idem
    expect(linha.valor).toBe(1000);                               // financeiro segue do snapshot
  });

  it('devolve vazio sem itens', () => {
    expect(hidratarSnapshot([], etapas)).toEqual([]);
    expect(hidratarSnapshot(null, etapas)).toEqual([]);
  });
});

describe('computeResumo', () => {
  const monthlyTotals = { '2026-06': 1000, '2026-07': 2000, '2026-08': 1000 }; // valorObra = 4000
  const mesRefKey = '2026-07';

  it('metaProgramada e previstoAcumulado vêm só de monthlyTotals', () => {
    const r = computeResumo({ monthlyTotals, mesRefKey });
    expect(r.valorObra).toBe(4000);
    expect(r.metaProgramada).toBeCloseTo((2000 / 4000) * 100, 5); // só o mês de referência
    expect(r.previstoAcumulado).toBeCloseTo((3000 / 4000) * 100, 5); // jun+jul, 75%
  });

  it('executadoAcumulado soma o previsto (mesma base do Uso da Tarefa) até o mês ANTERIOR, sem valorMedidoMes', () => {
    const r = computeResumo({ monthlyTotals, mesRefKey });
    expect(r.executadoMesPct).toBe(0);
    expect(r.executadoAcumulado).toBeCloseTo((1000 / 4000) * 100, 5); // só jun, mês anterior a jul: 25%
  });

  it('executadoMesPct é o valor medido em R$ como fração da OBRA INTEIRA, não do mês', () => {
    const r = computeResumo({ monthlyTotals, mesRefKey, valorMedidoMes: 1600 });
    expect(r.executadoMesPct).toBeCloseTo((1600 / 4000) * 100, 5); // 40% da obra, não do mês (2000)
  });

  it('executadoAcumulado soma o previsto do mês anterior + executadoMesPct, sem dividir de novo', () => {
    const r = computeResumo({ monthlyTotals, mesRefKey, valorMedidoMes: 1600 });
    expect(r.executadoAcumulado).toBeCloseTo(25 + 40, 5); // 25% (mês anterior) + 40% (executado do mês)
  });

  it('no primeiro mês do cronograma (sem mês anterior), executadoAcumulado é só o executadoMesPct', () => {
    const r = computeResumo({ monthlyTotals, mesRefKey: '2026-06', valorMedidoMes: 1200 });
    expect(r.executadoAcumulado).toBeCloseTo(r.executadoMesPct, 5);
  });

  it('sem valor total da obra, tudo fica zero mesmo com valorMedidoMes preenchido (sem dividir por zero)', () => {
    const r = computeResumo({ monthlyTotals: {}, mesRefKey, valorMedidoMes: 500 });
    expect(r).toEqual({ valorObra: 0, metaProgramada: 0, previstoAcumulado: 0, executadoMesPct: 0, executadoAcumulado: 0 });
  });
});

describe('computeArvoreForaDoMes', () => {
  it('injeta só os grupos ancestrais das candidatas, na ordem do cronograma', () => {
    const candidatas = listarTarefasForaDoMes(etapas, MES, opts); // só F, sob ESTACAS
    const linhas = computeArvoreForaDoMes(candidatas, etapas);
    expect(linhas.map(l => `${l.tipo}:${l.descricao}`)).toEqual(['grupo:ESTACAS', 'item:FUTURA']);
  });

  it('sobe por mais de um nível de grupo', () => {
    const etapasAninhadas = [
      { id: 'P1', etapa: 'TORRE', isGroup: true, nivel: 0, parentId: null },
      { id: 'P2', etapa: 'PAV 2', isGroup: true, nivel: 1, parentId: 'P1' },
      { id: 'L1', etapa: 'Alvenaria', isGroup: false, nivel: 2, parentId: 'P2' },
    ];
    const candidatas = [{ id: 'L1', wbs: '1.1.1', descricao: 'Alvenaria', disciplina: 'TORRE', pavimento: '—', valor: 100 }];
    const linhas = computeArvoreForaDoMes(candidatas, etapasAninhadas);
    expect(linhas.map(l => `${l.tipo}:${l.descricao}:${l.nivel}`)).toEqual([
      'grupo:TORRE:0', 'grupo:PAV 2:1', 'item:Alvenaria:2',
    ]);
  });

  it('omite grupo sem nenhuma candidata dentro', () => {
    const candidatas = listarTarefasForaDoMes(etapas, MES, opts).filter(c => c.id !== 'F');
    expect(computeArvoreForaDoMes(candidatas, etapas)).toEqual([]);
  });

  it('devolve vazio sem candidatas', () => {
    expect(computeArvoreForaDoMes([], etapas)).toEqual([]);
  });
});
