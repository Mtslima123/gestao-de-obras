import { describe, it, expect } from 'vitest';
import { projectStartOffset, todayOffset } from '../modules/cronograma/cronogramaDateUtils';
import { createTask, createSubtask, createGroup } from '../modules/cronograma/scheduleEngine';

// Tarefa nova nasce no início do projeto (menor início entre as tarefas), padrão
// MS Project — antes nascia na data de hoje, qualquer que fosse o cronograma.
describe('projectStartOffset', () => {
  it('retorna o menor início entre as tarefas', () => {
    expect(projectStartOffset([{ inicio: 120 }, { inicio: 95 }, { inicio: 300 }])).toBe(95);
  });

  it('sem tarefas, cai em hoje', () => {
    expect(projectStartOffset([])).toBe(todayOffset());
    expect(projectStartOffset(undefined)).toBe(todayOffset());
  });

  it('createTask/createSubtask/createGroup usam o início do projeto', () => {
    const etapas = [
      { id: 'TSK-001', displayId: 1, etapa: 'A', nivel: 0, parentId: null, inicio: 50, dur: 5 },
      { id: 'TSK-002', displayId: 2, etapa: 'B', nivel: 0, parentId: null, inicio: 80, dur: 5 },
    ];
    const nova = (arr) => arr.find(e => !etapas.some(x => x.id === e.id));
    expect(nova(createTask('TSK-002', etapas, [])).inicio).toBe(50);
    expect(nova(createSubtask('TSK-002', etapas, [])).inicio).toBe(50);
    expect(nova(createGroup('TSK-002', etapas, [])).inicio).toBe(50);
  });
});
