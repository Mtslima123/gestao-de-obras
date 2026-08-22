// Testes de reprogramarRestante — fraciona uma tarefa parcialmente executada em
// duas: o pedaço já feito (100%, fica onde estava) e o restante (empurrado pro
// dia 1 do mês seguinte ao término do fragmento já executado, com data fixa).
// Funções puras, rodam em node.
import { describe, it, expect, beforeEach } from 'vitest';
import { setWorkCal, dateToOffset, taskEnd } from '../modules/cronograma/cronogramaDateUtils';
import { reprogramarRestante } from '../modules/cronograma/scheduleEngine';
import { computeValorVinculadoMap } from '../modules/cronograma/ganttUtils';

beforeEach(() => {
  setWorkCal({ dias: [], sabadoUtil: false });
});

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
    expect(fechado.custoRealizado).toBe(150);
    expect(restante.custoRealizado).toBe(150);
    expect(fechado.dur).toBe(10);
    expect(restante.dur).toBe(10);
    expect(fechado.inicio).toBe(0); // mesma posição da tarefa original
    expect(fechado.status).toBe('done');
    expect(restante.status).toBe('upcoming');
    expect(fechado.valorVinculadoFixo).toBeNull();
    expect(restante.valorVinculadoFixo).toBeNull();
  });

  it('restante fica com restrição mso pro dia 1 do mês seguinte ao término do executado', () => {
    const out = reprogramarRestante('T1', [baseTarefa()]);
    const restante = out.find(e => e.parentId === 'T1' && e.avanco === 0);
    // inicio:0 (01/03/2024) + fechadoDur:10 dias úteis -> workEnd(0,10) = offset 14 = 15/03/2024.
    // Mês seguinte a março/2024 = abril/2024.
    expect(restante.restricaoTipo).toBe('mso');
    expect(restante.restricaoData).toBe('2024-04-01');
    expect(restante.inicio).toBe(dateToOffset('2024-04-01'));
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
    const restante  = out.find(e => e.parentId === 'T1' && e.avanco === 0);
    const sucessora = out.find(e => e.id === 'S');
    expect(sucessora.inicio).toBe(taskEnd(grupo));
    // o grupo se estende pelo menos até o início do restante (empurrado pro mês seguinte)
    expect(taskEnd(grupo)).toBeGreaterThanOrEqual(restante.inicio);
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

  it('divide o valor vinculado de orçamento proporcionalmente ao avanço', () => {
    const vinculos = [{ etapa_id: 'T1', orcamento_item_id: 'item1' }];
    const orcamentoItensMap = { item1: 1000 };

    const out = reprogramarRestante('T1', [baseTarefa()]);
    const fechado  = out.find(e => e.parentId === 'T1' && e.avanco === 100);
    const restante = out.find(e => e.parentId === 'T1' && e.avanco === 0);

    const map = computeValorVinculadoMap(out, vinculos, orcamentoItensMap);
    expect(map[fechado.id]).toBeCloseTo(500);
    expect(map[restante.id]).toBeCloseTo(500);
    expect(map['T1']).toBeCloseTo(1000); // grupo (bubble-up) preserva o total

    // Simula o que commit() faz ao ver o fragmento fechado em avanco:100: trava
    // o valor calculado nesta mesma passada. O restante, que segue "aberto",
    // continua recebendo exatamente sua parcela.
    const travado = out.map(e => (e.id === fechado.id ? { ...e, valorVinculadoFixo: map[fechado.id] } : e));
    const map2 = computeValorVinculadoMap(travado, vinculos, orcamentoItensMap);
    expect(map2[fechado.id]).toBe(map[fechado.id]);
    expect(map2[restante.id]).toBeCloseTo(500);
    expect(map2['T1']).toBeCloseTo(1000);
  });
});
