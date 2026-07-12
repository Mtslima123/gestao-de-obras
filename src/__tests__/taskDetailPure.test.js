// Testes unitários da lógica pura das features de Anexos/Histórico da tarefa.
// Roda em node (sem browser/Supabase). Executar: npm test
import { describe, it, expect } from 'vitest';
import { validateFile, computeDiffEvents } from '../modules/cronograma/taskDetailPure';

const MB = 1024 * 1024;
const author = { id: 'u1', nome: 'Ana Souza', email: 'ana@soter.com.br' };

describe('validateFile', () => {
  it('rejeita quando não há arquivo', () => {
    expect(() => validateFile(null)).toThrow(/Nenhum arquivo/);
  });
  it('rejeita arquivo acima de 15 MB', () => {
    expect(() => validateFile({ name: 'grande.pdf', size: 16 * MB })).toThrow(/muito grande/i);
  });
  it('rejeita extensão não permitida', () => {
    expect(() => validateFile({ name: 'virus.exe', size: 100 })).toThrow(/Tipo não aceito/i);
  });
  it('aceita PDF/PNG/XLSX/CSV dentro do limite', () => {
    for (const name of ['doc.pdf', 'foto.PNG', 'planilha.xlsx', 'dados.csv']) {
      expect(() => validateFile({ name, size: 100 })).not.toThrow();
    }
  });
});

describe('computeDiffEvents', () => {
  it('retorna vazio quando não há estado anterior (evita evento na hidratação)', () => {
    expect(computeDiffEvents([], [{ id: 'A', avanco: 0 }], author)).toEqual([]);
  });

  it('registra criação de tarefa nova', () => {
    const prev = [{ id: 'A', etapa: 'Fundação' }];
    const next = [{ id: 'A', etapa: 'Fundação' }, { id: 'B', etapa: 'Alvenaria' }];
    const evs = computeDiffEvents(prev, next, author);
    const created = evs.find(e => e.taskId === 'B' && e.event.type === 'created');
    expect(created).toBeTruthy();
    expect(created.event.text).toBe('Alvenaria');
    expect(created.event.authorName).toBe('Ana Souza');
  });

  it('registra mudança de status', () => {
    const prev = [{ id: 'A', status: 'upcoming' }];
    const next = [{ id: 'A', status: 'late' }];
    const evs = computeDiffEvents(prev, next, author);
    expect(evs).toHaveLength(1);
    expect(evs[0].event).toMatchObject({ type: 'status', from: 'Futura', to: 'Atrasada' });
  });

  it('registra progresso e, ao cruzar 100%, um status "Concluída" do Sistema', () => {
    const prev = [{ id: 'A', avanco: 85 }];
    const next = [{ id: 'A', avanco: 100 }];
    const evs = computeDiffEvents(prev, next, author);
    const prog = evs.find(e => e.event.type === 'progress');
    const done = evs.find(e => e.event.type === 'status');
    expect(prog.event).toMatchObject({ from: 85, to: 100, authorName: 'Ana Souza' });
    expect(done.event).toMatchObject({ to: 'Concluída', authorId: 'sistema', authorName: 'Sistema' });
  });

  it('não gera status do Sistema se o progresso mudou mas não chegou a 100%', () => {
    const evs = computeDiffEvents([{ id: 'A', avanco: 10 }], [{ id: 'A', avanco: 50 }], author);
    expect(evs.filter(e => e.event.type === 'status')).toHaveLength(0);
  });

  it('ignora grupos (valores calculados, evita ruído)', () => {
    const prev = [{ id: 'G', isGroup: true, avanco: 0 }];
    const next = [{ id: 'G', isGroup: true, avanco: 50 }];
    expect(computeDiffEvents(prev, next, author)).toEqual([]);
  });

  it('registra inclusão e remoção de dependência', () => {
    const prev = [{ id: 'A', dep: ['X'] }];
    const next = [{ id: 'A', dep: ['Y'] }];
    const evs = computeDiffEvents(prev, next, author);
    const add = evs.find(e => e.event.type === 'dependency' && e.event.field === 'add');
    const rem = evs.find(e => e.event.type === 'dependency' && e.event.field === 'remove');
    expect(add.event.text).toBe('Y');
    expect(rem.event.text).toBe('X');
  });

  it('registra mudança de responsável', () => {
    const evs = computeDiffEvents(
      [{ id: 'A', responsavel: 'João' }],
      [{ id: 'A', responsavel: 'Maria' }],
      author,
    );
    expect(evs[0].event).toMatchObject({ type: 'resource', from: 'João', to: 'Maria' });
  });

  it('usa "Sistema" quando não há autor', () => {
    const evs = computeDiffEvents([{ id: 'A', status: 'upcoming' }], [{ id: 'A', status: 'done' }], null);
    expect(evs[0].event.authorName).toBe('Sistema');
  });
});
