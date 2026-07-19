// Testes do calendário de trabalho (dias úteis) — funções puras, rodam em node.
// GM_REF = 1º de março de 2024 (SEXTA-feira). Logo os offsets:
//   off0=Sex, off1=Sáb, off2=Dom, off3=Seg, off4=Ter, off5=Qua, off6=Qui, off7=Sex...
import { describe, it, expect, beforeEach } from 'vitest';
import { setWorkCal, workEnd, workStart, workDur, taskEnd } from '../modules/cronograma/cronogramaDateUtils';
import { autoScheduleFromDeps } from '../modules/cronograma/scheduleEngine';

beforeEach(() => setWorkCal({ dias: [], sabadoUtil: false }));

describe('workEnd (sábado e domingo não trabalhados)', () => {
  it('1 dia útil a partir de sexta (off0) termina (exclusivo) em off1', () => {
    expect(workEnd(0, 1)).toBe(1);
  });
  it('2 dias úteis a partir de sexta pulam sáb/dom: Sex + Seg -> fim em off4', () => {
    expect(workEnd(0, 2)).toBe(4);
  });
  it('5 dias úteis a partir de sexta: Sex,Seg,Ter,Qua,Qui -> fim em off7', () => {
    expect(workEnd(0, 5)).toBe(7);
  });
});

describe('workStart é o reverso exato de workEnd (início em dia útil)', () => {
  it('round-trip a partir de sexta (off0)', () => {
    for (const dur of [1, 2, 3, 5, 10, 22]) {
      expect(workStart(workEnd(0, dur), dur)).toBe(0);
    }
  });
  it('round-trip a partir de segunda (off3)', () => {
    for (const dur of [1, 2, 4, 7, 15]) {
      expect(workStart(workEnd(3, dur), dur)).toBe(3);
    }
  });
});

describe('feriados e sábado configurável', () => {
  it('feriado na segunda (off3 = 2024-03-04) empurra o término em 1 dia', () => {
    setWorkCal({ dias: [{ data: '2024-03-04', descricao: 'Teste' }], sabadoUtil: false });
    expect(workEnd(0, 2)).toBe(5); // Sex(0) + Ter(4), pois Seg(3) virou feriado
  });
  it('workStart continua sendo o reverso mesmo com feriado', () => {
    setWorkCal({ dias: [{ data: '2024-03-04', descricao: 'Teste' }], sabadoUtil: false });
    expect(workStart(workEnd(0, 3), 3)).toBe(0);
  });
  it('com sábado útil, 2 dias a partir de sexta = Sex + Sáb -> fim em off2', () => {
    setWorkCal({ dias: [], sabadoUtil: true });
    expect(workEnd(0, 2)).toBe(2);
  });
  it('workDur conta só dias úteis no intervalo [0, 7)', () => {
    expect(workDur(0, 7)).toBe(5); // Sex,Sáb,Dom,Seg,Ter,Qua,Qui -> 5 úteis
  });
});

describe('taskEnd: grupo = envelope, folha = dias úteis', () => {
  it('grupo usa inicio+dur (envelope)', () => {
    expect(taskEnd({ isGroup: true, inicio: 0, dur: 5 })).toBe(5);
  });
  it('folha usa workEnd', () => {
    expect(taskEnd({ isGroup: false, inicio: 0, dur: 5 })).toBe(7);
  });
});

describe('autoScheduleFromDeps com dependência TT (término-término) em dias úteis', () => {
  it('o sucessor TT termina junto do predecessor (mesmo término em dias úteis)', () => {
    const etapas = [
      { id: 'A', inicio: 0, dur: 5, dep: [], restricaoTipo: 'asap' },
      { id: 'B', inicio: 0, dur: 2, dep: [{ id: 'A', tipo: 'TT', lag: 0 }], restricaoTipo: 'asap' },
    ];
    const out = autoScheduleFromDeps(etapas);
    const A = out.find(e => e.id === 'A');
    const B = out.find(e => e.id === 'B');
    // A termina em workEnd(0,5)=7; B deve iniciar em workStart(7,2)=5 e terminar em 7.
    expect(B.inicio).toBe(5);
    expect(workEnd(B.inicio, B.dur)).toBe(taskEnd(A));
  });
});
