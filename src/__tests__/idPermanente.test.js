// ID PERMANENTE das tarefas (displayId): é o número da coluna "ID" e o que se digita em
// Predecessora/Sucessora. Antes era a posição da linha, então inserir linhas (ex.: as duas folhas
// do "Reprogramar restante") mudava o número e o texto de todas as tarefas de baixo.
import { describe, it, expect, beforeEach } from 'vitest';
import { setWorkCal, dateToOffset } from '../modules/cronograma/cronogramaDateUtils';
import {
  applyFieldToEtapa, commitFieldChange, computeIdMap, formatDepList, migrateEtapas, nextDisplayId, parseDep, reprogramarRestante, computeSuccessors,
} from '../modules/cronograma/scheduleEngine';

beforeEach(() => setWorkCal({ dias: [], sabadoUtil: false }));

const t = (id, displayId, extra = {}) => ({
  id, displayId, etapa: `Tarefa ${id}`, nivel: 0, parentId: null, isGroup: false, collapsed: false,
  inicio: dateToOffset('2026-09-01'), dur: 5, avanco: 0, status: 'upcoming', dep: [],
  milestone: false, responsavel: '', customCols: {}, custo: 0, custoRealizado: 0,
  restricaoTipo: 'asap', restricaoData: '', fator_peso: 1, valorVinculadoFixo: null, modo: 'auto', showInDist: false, pavimento: '',
  ...extra,
});

describe('computeIdMap', () => {
  it('mapeia o id interno para o displayId, na ordem que for (não depende da posição)', () => {
    const etapas = [t('B', 20), t('A', 7), t('C', 99)];
    expect(computeIdMap(etapas)).toEqual({ B: 20, A: 7, C: 99 });
  });

  it('inserir uma linha no meio não muda o ID das outras', () => {
    const antes = [t('A', 1), t('B', 2), t('C', 3)];
    const depois = [antes[0], t('NOVA', nextDisplayId(antes)), antes[1], antes[2]];
    const mapa = computeIdMap(depois);
    expect(mapa.A).toBe(1);
    expect(mapa.B).toBe(2);
    expect(mapa.C).toBe(3);
    expect(mapa.NOVA).toBe(4); // número novo, no fim da sequência
  });

  it('sem displayId cai no id interno (nunca em undefined)', () => {
    expect(computeIdMap([{ id: 'X' }])).toEqual({ X: 'X' });
  });
});

describe('parseDep — resolve pelo ID permanente', () => {
  const etapas = [t('A', 10), t('B', 20), t('C', 30)];

  it('o número digitado é o ID, não a posição na lista', () => {
    expect(parseDep('30', etapas)).toEqual([{ id: 'C', tipo: 'TI', lag: 0 }]);
    expect(parseDep('1', etapas)).toEqual([]); // não existe tarefa com ID 1 (era a "1ª linha")
  });

  it('tipo e lag continuam funcionando, com vários separados por ; ou ,', () => {
    expect(parseDep('10; 20TT+3d, 30II-1', etapas)).toEqual([
      { id: 'A', tipo: 'TI', lag: 0 },
      { id: 'B', tipo: 'TT', lag: 3 },
      { id: 'C', tipo: 'II', lag: -1 },
    ]);
    expect(parseDep('20 +3 dias', etapas)).toEqual([{ id: 'B', tipo: 'TI', lag: 3 }]);
  });

  it('acha a tarefa mesmo que ela esteja numa lista maior (grupo recolhido/filtro não atrapalham)', () => {
    // A Lista passa TODAS as etapas: a predecessora escondida continua digitável.
    const todas = [t('G', 1, { isGroup: true }), t('A', 2, { parentId: 'G', nivel: 1 }), t('B', 3)];
    expect(parseDep('2', todas)).toEqual([{ id: 'A', tipo: 'TI', lag: 0 }]);
  });

  it('texto inválido ou ID inexistente é ignorado', () => {
    expect(parseDep('abc; 999; TSK-001', etapas)).toEqual([]);
    expect(parseDep('', etapas)).toEqual([]);
  });
});

describe('formatDepList — mostra o ID permanente', () => {
  it('é o inverso do parseDep', () => {
    const etapas = [t('A', 10), t('B', 20), t('C', 30)];
    const dep = parseDep('10; 20TT+3d; 30IT-2d', etapas);
    expect(formatDepList(dep, etapas)).toBe('10; 20TT+3d; 30IT-2d');
  });
});

describe('migrateEtapas — displayId é identidade', () => {
  it('repetido: o segundo recebe um número novo no fim da sequência', () => {
    const out = migrateEtapas([{ id: 'A', displayId: 5 }, { id: 'B', displayId: 5 }, { id: 'C', displayId: 9 }]);
    expect(out.map(e => e.displayId)).toEqual([5, 10, 9]);
    expect(new Set(out.map(e => e.displayId)).size).toBe(3);
  });

  it('sem displayId recebe um novo, e os que já tinham não mudam', () => {
    const out = migrateEtapas([{ id: 'A', displayId: 3 }, { id: 'B' }, { id: 'C', displayId: 8 }]);
    expect(out.map(e => e.displayId)).toEqual([3, 9, 8]);
  });

  it('dados já corretos passam sem alteração', () => {
    const out = migrateEtapas([{ id: 'A', displayId: 1 }, { id: 'B', displayId: 2 }]);
    expect(out.map(e => e.displayId)).toEqual([1, 2]);
  });
});

describe('Reprogramar restante não altera o ID de ninguém (caso Enfiação Puc)', () => {
  const cenario = () => ([
    t('P', 1, { avanco: 100 }),
    t('ORIG', 2, { dur: 10, avanco: 50, dep: [{ id: 'P', tipo: 'TI', lag: 0 }] }),
    t('S', 3, { dep: [{ id: 'ORIG', tipo: 'TI', lag: 0 }] }),
    t('Z', 4),
  ]);

  it('as linhas de baixo mantêm ID e texto de Predecessora; as duas folhas ganham IDs novos no fim', () => {
    const antes = cenario();
    const idsAntes = computeIdMap(antes);
    const out = reprogramarRestante('ORIG', antes);
    const ids = computeIdMap(out);

    // ninguém existente mudou de ID
    antes.forEach(e => expect(ids[e.id]).toBe(idsAntes[e.id]));
    // as duas folhas são novas, com IDs depois do maior que existia
    const folhas = out.filter(e => e.parentId === 'ORIG');
    expect(folhas).toHaveLength(2);
    expect(folhas.map(f => ids[f.id]).sort((a, b) => a - b)).toEqual([5, 6]);
    // inseridas na posição da original, mas sem renumerar quem vem depois
    expect(out.findIndex(e => e.id === 'S')).toBe(4); // a linha mudou (3 -> 4)...
    expect(ids.S).toBe(3);                            // ...mas o ID da tarefa S continua 3
    expect(ids.Z).toBe(4);
  });

  it('a sucessora mostra os IDs das duas folhas na Predecessora, e as folhas mostram a Sucessora', () => {
    const out = reprogramarRestante('ORIG', cenario());
    const ids = computeIdMap(out);
    const s = out.find(e => e.id === 'S');
    expect(formatDepList(s.dep, out, ids)).toBe('5; 6');
    const folhas = out.filter(e => e.parentId === 'ORIG');
    const succ = computeSuccessors(out);
    folhas.forEach(f => expect(succ[f.id].map(id => ids[id])).toEqual([3]));
  });

  it('digitar o ID de uma folha nova na Predecessora de outra tarefa resolve para a folha certa', () => {
    const out = reprogramarRestante('ORIG', cenario());
    const restante = out.find(e => e.parentId === 'ORIG' && e.avanco === 0);
    const idDoRestante = computeIdMap(out)[restante.id];
    expect(parseDep(String(idDoRestante), out)).toEqual([{ id: restante.id, tipo: 'TI', lag: 0 }]);
  });
});

describe('digitar o ID de uma tarefa ESCONDIDA na grade (grupo recolhido ou filtro)', () => {
  // Regressão: a Lista passava a lista visível para resolver o número digitado, e uma
  // predecessora escondida (ex.: folha dentro de grupo recolhido) sumia ao salvar.
  const etapas = [
    t('G', 1, { isGroup: true }),
    t('A', 2, { parentId: 'G', nivel: 1 }), // escondida pelo grupo recolhido
    t('B', 3),
  ];
  const visivel = [etapas[0], etapas[2]];

  it('applyFieldToEtapa ignora a lista visível e resolve em todas as etapas', () => {
    const out = applyFieldToEtapa(etapas[2], 'dep', '2', etapas, visivel);
    expect(out.dep).toEqual([{ id: 'A', tipo: 'TI', lag: 0 }]);
  });

  it('commitFieldChange também (mesmo caminho da célula da Lista)', () => {
    const novas = commitFieldChange(etapas, 'B', 'dep', '2; 1', visivel);
    expect(novas.find(e => e.id === 'B').dep.map(d => d.id).sort()).toEqual(['A', 'G']);
  });
});
