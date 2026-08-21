// Testes unitários da lógica pura da Medição Mensal.
// Roda em node (sem browser/Supabase). Executar: npm test
import { describe, it, expect } from 'vitest';
import {
  buildItensMedicao, listarTarefasForaDoMes, computeArvoreMedicao, computeTotaisMedicao,
  gruposParaNivel, buildSnapshotFechamento, computeDisciplinaInfo,
} from '../modules/cronograma/medicaoMensalPure';

// Hierarquia: 1 ESTRUTURA > 1.1 TERREO > (folhas Forma, Concreto); 2 ESTACAS > folha pav1.
// A folha "FUTURA" não tem fatia no mês de referência — é o caso "fora do mês".
const MES = '2026-07';
const etapas = [
  { id: 'G1', etapa: 'ESTRUTURA', isGroup: true,  nivel: 0, parentId: null, inicio: 850, dur: 30, avanco: 50 },
  { id: 'G2', etapa: 'TERREO',    isGroup: true,  nivel: 1, parentId: 'G1', inicio: 850, dur: 20, avanco: 50 },
  { id: 'A',  etapa: 'Forma',     isGroup: false, nivel: 2, parentId: 'G2', inicio: 850, dur: 10, avanco: 100, custo: 1000 },
  { id: 'B',  etapa: 'Concreto',  isGroup: false, nivel: 2, parentId: 'G2', inicio: 860, dur: 10, avanco: 0,   custo: 1000 },
  { id: 'G3', etapa: 'ESTACAS',   isGroup: true,  nivel: 0, parentId: null, inicio: 855, dur: 5,  avanco: 0 },
  { id: 'C',  etapa: 'pav1',      isGroup: false, nivel: 1, parentId: 'G3', inicio: 855, dur: 5,  avanco: 0,   custo: 500 },
  { id: 'F',  etapa: 'FUTURA',    isGroup: false, nivel: 1, parentId: 'G3', inicio: 1200, dur: 5, avanco: 40,  custo: 800 },
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

  it('valorVinculadoMap tem precedência sobre custo no item fora do mês', () => {
    const itens = buildItensMedicao(etapas, MES, {
      ...opts, idsExtras: new Set(['F']), valorVinculadoMap: { F: 2500 },
    });
    expect(itens.find(i => i.id === 'F').valor).toBe(2500);
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

  it('valorVinculadoMap tem precedência sobre custo', () => {
    const [f] = listarTarefasForaDoMes(etapas, MES, { ...opts, valorVinculadoMap: { F: 2500 } });
    expect(f.valor).toBe(2500);
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
    expect(Object.keys(snap.itens[0]).sort()).toEqual(
      ['descricao', 'foraDoMes', 'id', 'pavimento', 'percExecutado', 'percMedido', 'valor', 'wbs']
    );
  });
});
