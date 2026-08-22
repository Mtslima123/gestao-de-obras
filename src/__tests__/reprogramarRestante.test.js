// Testes de reprogramarRestante — fraciona uma tarefa parcialmente executada em
// duas: o pedaço já feito (100%, fica onde estava) e o restante (empurrado pro
// dia 1 do mês seguinte a hoje, com data fixa). Funções puras, rodam em node.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setWorkCal, dateToOffset, taskEnd } from '../modules/cronograma/cronogramaDateUtils';
import { reprogramarRestante } from '../modules/cronograma/scheduleEngine';

beforeEach(() => {
  setWorkCal({ dias: [], sabadoUtil: false });
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 21)); // 21/08/2026
});
afterEach(() => vi.useRealTimers());

const baseTarefa = (over = {}) => ({
  id: 'T1', displayId: 1, etapa: 'Alvenaria', nivel: 0, parentId: null,
  isGroup: false, collapsed: false,
  inicio: 0, dur: 20, avanco: 50, status: 'upcoming', dep: [],
  milestone: false, responsavel: '', customCols: {}, custo: 1000, custoRealizado: 300,
  restricaoTipo: 'asap', restricaoData: '', fator_peso: 1, valorVinculadoFixo: null,
  modo: 'auto', showInDist: false, pavimento: '',
  ...over,
});

describe('reprogramarRestante', () => {
  it('vira a tarefa num grupo com 2 folhas, split proporcional ao avanço', () => {
    const out = reprogramarRestante('T1', [baseTarefa()]);
    const grupo = out.find(e => e.id === 'T1');
    expect(grupo.isGroup).toBe(true);

    const filhos = out.filter(e => e.parentId === 'T1');
    expect(filhos).toHaveLength(2);
    const fechado  = filhos.find(f => f.avanco === 100);
    const restante = filhos.find(f => f.avanco === 0);
    expect(fechado).toBeTruthy();
    expect(restante).toBeTruthy();

    expect(fechado.fator_peso).toBe(50);
    expect(restante.fator_peso).toBe(50);
    expect(fechado.custo).toBe(500);
    expect(restante.custo).toBe(500);
    expect(fechado.dur).toBe(10);
    expect(restante.dur).toBe(10);
    expect(fechado.inicio).toBe(0); // mesma posição da tarefa original
    expect(fechado.status).toBe('done');
    expect(restante.status).toBe('upcoming');
    expect(fechado.valorVinculadoFixo).toBeNull();
    expect(restante.valorVinculadoFixo).toBeNull();
  });

  it('restante fica com restrição mso pro dia 1 do mês seguinte a hoje', () => {
    const out = reprogramarRestante('T1', [baseTarefa()]);
    const restante = out.find(e => e.parentId === 'T1' && e.avanco === 0);
    expect(restante.restricaoTipo).toBe('mso');
    expect(restante.restricaoData).toBe('2026-09-01');
    expect(restante.inicio).toBe(dateToOffset('2026-09-01'));
  });

  it('as duas folhas novas herdam as predecessoras da tarefa original', () => {
    const etapas = [
      baseTarefa({ id: 'P', etapa: 'Predecessora', dur: 5, avanco: 100, dep: [] }),
      baseTarefa({ dep: [{ id: 'P', tipo: 'TI', lag: 0 }] }),
    ];
    const out = reprogramarRestante('T1', etapas);
    const filhos = out.filter(e => e.parentId === 'T1');
    filhos.forEach(f => {
      expect(f.dep).toHaveLength(1);
      expect(f.dep[0].id).toBe('P');
    });
  });

  it('sucessora que dependia da tarefa original é empurrada pro fim do grupo (que cobre até o restante)', () => {
    const etapas = [
      baseTarefa(),
      baseTarefa({ id: 'S', etapa: 'Sucessora', avanco: 0, dep: [{ id: 'T1', tipo: 'TI', lag: 0 }] }),
    ];
    const out = reprogramarRestante('T1', etapas);
    const grupo     = out.find(e => e.id === 'T1');
    const sucessora = out.find(e => e.id === 'S');
    expect(sucessora.inicio).toBe(taskEnd(grupo));
    // o grupo se estendeu até bem depois de hoje (restante em setembro/2026)
    expect(taskEnd(grupo)).toBeGreaterThan(dateToOffset('2026-08-21'));
  });

  it('não faz nada quando avanço está fora de [1,99] ou a tarefa já é grupo', () => {
    const etapas0 = [baseTarefa({ avanco: 0 })];
    expect(reprogramarRestante('T1', etapas0)).toBe(etapas0);

    const etapas100 = [baseTarefa({ avanco: 100 })];
    expect(reprogramarRestante('T1', etapas100)).toBe(etapas100);

    const etapasGrupo = [baseTarefa({ isGroup: true })];
    expect(reprogramarRestante('T1', etapasGrupo)).toBe(etapasGrupo);

    expect(reprogramarRestante('NAO_EXISTE', etapas0)).toBe(etapas0);
  });
});
