// Tarefa 100% concluída fica com as datas travadas: nem a própria duração, nem uma
// predecessora que mudou de data, nem o arraste no Gantt devem mexer no início dela.
// Só volta a ser reagendada se o % concluída voltar pra 0 — mesmo padrão de guarda já
// usado para `modo === 'manual'` (schedulePass/propagateDrag em scheduleEngine.js).
import { describe, it, expect, beforeEach } from 'vitest';
import { setWorkCal, taskEnd } from '../modules/cronograma/cronogramaDateUtils';
import { autoScheduleFromDeps, applyFieldToEtapa, commitFieldChange, propagateDrag } from '../modules/cronograma/scheduleEngine';

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

describe('tarefa 100% concluída: datas travadas', () => {
  it('sucessora 100% não é movida quando a predecessora muda de duração', () => {
    const etapas = [
      baseTarefa({ id: 'P', dur: 5, avanco: 0, inicio: 0 }),
      baseTarefa({ id: 'S', avanco: 100, inicio: 5, dep: [{ id: 'P', tipo: 'TI', lag: 0 }] }),
    ];
    // Sem a guarda, aumentar a duração de P empurraria o início de S pra frente.
    const out = commitFieldChange(etapas, 'P', 'duracaoDias', '20');
    expect(out.find(e => e.id === 'S').inicio).toBe(5);
  });

  it('sucessora 100% não é movida por arraste da barra no Gantt (propagateDrag)', () => {
    const etapas = [
      baseTarefa({ id: 'P', dur: 5, avanco: 0, inicio: 0 }),
      baseTarefa({ id: 'S', avanco: 100, inicio: 5, dep: [{ id: 'P', tipo: 'TI', lag: 0 }] }),
    ];
    const out = propagateDrag(etapas, { P: 3 }); // arrasta o fim de P +3 dias úteis
    expect(out.find(e => e.id === 'S').inicio).toBe(5);
  });

  it('volta a ser reagendada normalmente assim que o % concluída volta pra 0', () => {
    const etapas = [
      baseTarefa({ id: 'P', dur: 5, avanco: 0, inicio: 0 }),
      baseTarefa({ id: 'S', avanco: 100, inicio: 5, dep: [{ id: 'P', tipo: 'TI', lag: 0 }] }),
    ];
    const travado = commitFieldChange(etapas, 'P', 'duracaoDias', '20');
    expect(travado.find(e => e.id === 'S').inicio).toBe(5); // continua travada

    // Edição manual da célula AVANÇO (mesmo caminho da Lista) zera o % concluída.
    const zerado = travado.map(e => (e.id === 'S' ? applyFieldToEtapa(e, 'avanco', '0', travado) : e));
    const reagendado = autoScheduleFromDeps(zerado);
    const p = reagendado.find(e => e.id === 'P');
    const s = reagendado.find(e => e.id === 'S');
    expect(s.inicio).toBe(taskEnd(p)); // agora sim segue a predecessora
  });

  it('tarefa 100% continua funcionando normalmente como predecessora de outra (só ela mesma para de se mover)', () => {
    const etapas = [
      baseTarefa({ id: 'P', dur: 5, avanco: 100, inicio: 0 }),
      baseTarefa({ id: 'S', avanco: 0, dep: [{ id: 'P', tipo: 'TI', lag: 0 }] }),
    ];
    const out = autoScheduleFromDeps(etapas);
    const p = out.find(e => e.id === 'P');
    const s = out.find(e => e.id === 'S');
    expect(s.inicio).toBe(taskEnd(p));
  });
});
