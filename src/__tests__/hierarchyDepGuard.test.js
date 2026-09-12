// Tarefa que era folha (com Predecessora/Sucessora real) e ganha filhos, virando grupo:
// autoScheduleFromDeps nunca reagenda um grupo pelo próprio `dep` (pula de propósito), então
// esse vínculo antigo fica morto — só serve pra acusar um "conflito" fantasma no Gantt/Lista
// que a tela nem mostra mais (dep/succ de grupo já vêm em branco em toda a Lista). Estes
// testes cobrem a limpeza desse dep exatamente na transição folha→grupo, e as duas guardas
// que impedem esse dado morto de continuar sendo lido/escrito como se fosse válido.
//
// Importante: nada aqui apaga `dep` de uma tarefa que JÁ era grupo antes da chamada — existe
// uma tela (Fluxo Executivo) que liga tarefas-resumo entre si de propósito, gravando no mesmo
// campo. Apagar isso incondicionalmente destruiria vínculo real de usuário (confirmado: 4 das
// 5 tarefas-grupo com dep encontradas em produção eram vínculo legítimo do Fluxo Executivo).
import { describe, it, expect, beforeEach } from 'vitest';
import { setWorkCal, dateToOffset } from '../modules/cronograma/cronogramaDateUtils';
import { recomputeHierarchy, indentTasks, applyFieldToEtapa } from '../modules/cronograma/scheduleEngine';
import { gmConflicts } from '../modules/cronograma/cronogramaShared';

beforeEach(() => setWorkCal({ dias: [], sabadoUtil: false }));

const baseTarefa = (over = {}) => ({
  id: 'T1', displayId: 1, etapa: 'Tarefa', nivel: 0, parentId: null,
  isGroup: false, collapsed: false,
  inicio: dateToOffset('2026-01-05'), dur: 5, avanco: 0, status: 'upcoming', dep: [],
  milestone: false, responsavel: '', customCols: {}, custo: 0, custoRealizado: 0,
  restricaoTipo: 'asap', restricaoData: '', fator_peso: 1, valorVinculadoFixo: null,
  modo: 'auto', showInDist: false, pavimento: '',
  ...over,
});

describe('recomputeHierarchy — dep morre só na transição folha→grupo', () => {
  it('folha com dep que ganha filho na mesma chamada sai isGroup:true, dep:[]', () => {
    const pai = baseTarefa({ id: 'A', dep: [{ id: 'X', tipo: 'TI', lag: 0 }] });
    const filho = baseTarefa({ id: 'B', parentId: 'A', inicio: dateToOffset('2026-01-12') });
    const out = recomputeHierarchy([pai, filho]);
    const a = out.find(e => e.id === 'A');
    expect(a.isGroup).toBe(true);
    expect(a.dep).toEqual([]);
  });

  it('tarefa que JÁ era grupo com dep não-vazio mantém o dep intacto (protege vínculo do Fluxo Executivo)', () => {
    const pai = baseTarefa({ id: 'A', isGroup: true, dep: [{ id: 'X', tipo: 'TI', lag: 0 }] });
    const filho = baseTarefa({ id: 'B', parentId: 'A', inicio: dateToOffset('2026-01-12') });
    const out = recomputeHierarchy([pai, filho]);
    const a = out.find(e => e.id === 'A');
    expect(a.isGroup).toBe(true);
    expect(a.dep).toEqual([{ id: 'X', tipo: 'TI', lag: 0 }]);
  });

  it('folha sem filhos (continua folha) preserva o dep normalmente', () => {
    const t = baseTarefa({ dep: [{ id: 'X', tipo: 'TI', lag: 0 }] });
    const out = recomputeHierarchy([t]);
    expect(out[0].isGroup).toBe(false);
    expect(out[0].dep).toEqual([{ id: 'X', tipo: 'TI', lag: 0 }]);
  });
});

describe('indentTasks — Recuar transforma a tarefa acima em grupo e zera o dep dela', () => {
  it('A (folha com dep real) vira grupo ao receber B como subtarefa', () => {
    const a = baseTarefa({ id: 'A', dep: [{ id: 'X', tipo: 'TI', lag: 0 }] });
    const b = baseTarefa({ id: 'B', inicio: dateToOffset('2026-01-12') });
    const out = indentTasks([a, b], ['B']);
    const novoA = out.find(e => e.id === 'A');
    expect(novoA.isGroup).toBe(true);
    expect(novoA.dep).toEqual([]);
    expect(out.find(e => e.id === 'B').parentId).toBe('A');
  });
});

describe('applyFieldToEtapa — Predecessora de um grupo não é editável (no-op)', () => {
  it('devolve a tarefa sem alterar dep quando isGroup, qualquer que seja o rawValue', () => {
    const grupo = baseTarefa({ isGroup: true, dep: [{ id: 'X', tipo: 'TI', lag: 0 }] });
    const out = applyFieldToEtapa(grupo, 'dep', '2', [grupo, baseTarefa({ id: 'X' })]);
    expect(out.dep).toEqual([{ id: 'X', tipo: 'TI', lag: 0 }]); // inalterado
    const outVazio = applyFieldToEtapa(grupo, 'dep', '', [grupo]);
    expect(outVazio.dep).toEqual([{ id: 'X', tipo: 'TI', lag: 0 }]); // também não limpa
  });

  it('numa folha, continua funcionando normalmente (regressão)', () => {
    const folha = baseTarefa({ dep: [] });
    const pred = baseTarefa({ id: 'X' });
    const out = applyFieldToEtapa(folha, 'dep', '1', [pred, folha]);
    expect(out.dep).toEqual([{ id: 'X', tipo: 'TI', lag: 0 }]);
  });
});

describe('gmConflicts — ignora dep órfão de um grupo, mas não some com quem depende do grupo', () => {
  it('grupo com dep apontando pra um predecessor cujas datas colidem de verdade: sem conflito', () => {
    const pred = baseTarefa({ id: 'P', inicio: dateToOffset('2026-01-05'), dur: 10 });
    const grupo = baseTarefa({
      id: 'G', isGroup: true, inicio: dateToOffset('2026-01-06'), dur: 5,
      dep: [{ id: 'P', tipo: 'TI', lag: 0 }], // órfão: começa antes do fim de P
    });
    expect(gmConflicts([pred, grupo])).toEqual([]);
  });

  it('folha que depende de um grupo como predecessor, com violação real: conflito continua', () => {
    const grupo = baseTarefa({ id: 'G', isGroup: true, inicio: dateToOffset('2026-01-05'), dur: 10 });
    const folha = baseTarefa({
      id: 'F', inicio: dateToOffset('2026-01-06'), dur: 5, // começa antes do fim do grupo
      dep: [{ id: 'G', tipo: 'TI', lag: 0 }],
    });
    const conflitos = gmConflicts([grupo, folha]);
    expect(conflitos).toEqual([{ pred: 'G', succ: 'F', tipo: 'TI', lag: 0 }]);
  });
});
