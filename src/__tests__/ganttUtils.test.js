// Testes unitários da grade de calendário real usada pelo zoom do Gantt (VER: Dia/Semana/Mês/Trimestre).
// Roda em node (sem browser/Supabase). Executar: npm test
import { describe, it, expect } from 'vitest';
import {
  getISOWeek, buildCalendarMonths, buildCalendarQuarters, buildCalendarYears,
  buildCalendarWeeks, buildCalendarDays,
} from '../modules/cronograma/ganttUtils';

describe('getISOWeek', () => {
  it('1º de janeiro de 2024 pertence à semana 1 de 2024 (segunda-feira)', () => {
    expect(getISOWeek(new Date(2024, 0, 1))).toEqual({ isoYear: 2024, isoWeek: 1 });
  });
  it('31 de dezembro de 2024 pertence à semana 1 de 2025 (terça-feira, vira para o ano seguinte)', () => {
    expect(getISOWeek(new Date(2024, 11, 31))).toEqual({ isoYear: 2025, isoWeek: 1 });
  });
  it('28 de dezembro de 2025 (domingo) ainda pertence à última semana ISO de 2025', () => {
    expect(getISOWeek(new Date(2025, 11, 28)).isoYear).toBe(2025);
  });
});

describe('buildCalendarMonths', () => {
  it('soma dos dias dos meses cobre exatamente totalDays', () => {
    const meses = buildCalendarMonths(new Date(2024, 2, 1), 400);
    expect(meses.reduce((s, m) => s + m.days, 0)).toBe(400);
  });
  it('respeita fevereiro bissexto (2024, 29 dias)', () => {
    const meses = buildCalendarMonths(new Date(2024, 0, 1), 60);
    const fev = meses.find(m => m.month === 1 && m.year === 2024);
    expect(fev.days).toBe(29);
  });
  it('respeita fevereiro não-bissexto (2025, 28 dias)', () => {
    const meses = buildCalendarMonths(new Date(2025, 0, 1), 60);
    const fev = meses.find(m => m.month === 1 && m.year === 2025);
    expect(fev.days).toBe(28);
  });
  it('offsets são contínuos e começam em 0', () => {
    const meses = buildCalendarMonths(new Date(2024, 2, 1), 200);
    expect(meses[0].startOffset).toBe(0);
    for (let i = 1; i < meses.length; i++) {
      expect(meses[i].startOffset).toBe(meses[i - 1].startOffset + meses[i - 1].days);
    }
  });
});

describe('buildCalendarQuarters', () => {
  it('agrupa por trimestre calendário real (Jan-Mar, Abr-Jun, Jul-Set, Out-Dez)', () => {
    const meses = buildCalendarMonths(new Date(2024, 2, 1), 400); // começa em março
    const tris = buildCalendarQuarters(meses);
    const t1 = tris.find(t => t.label === 'T1/2024');
    // T1 2024 (Jan-Mar) só tem março disponível no range (já que o timeline começa em março)
    expect(t1.days).toBe(31);
    const t2 = tris.find(t => t.label === 'T2/2024');
    expect(t2.days).toBe(30 + 31 + 30); // Abr+Mai+Jun
  });
  it('soma dos dias dos trimestres bate com a soma dos meses', () => {
    const meses = buildCalendarMonths(new Date(2024, 2, 1), 400);
    const tris = buildCalendarQuarters(meses);
    expect(tris.reduce((s, t) => s + t.days, 0)).toBe(meses.reduce((s, m) => s + m.days, 0));
  });
});

describe('buildCalendarYears', () => {
  it('soma dos dias dos anos bate com a soma dos meses', () => {
    const meses = buildCalendarMonths(new Date(2024, 2, 1), 400);
    const anos = buildCalendarYears(meses);
    expect(anos.reduce((s, a) => s + a.days, 0)).toBe(meses.reduce((s, m) => s + m.days, 0));
  });
});

describe('buildCalendarWeeks', () => {
  it('soma dos dias das semanas cobre exatamente totalDays', () => {
    const semanas = buildCalendarWeeks(new Date(2024, 2, 1), 100);
    expect(semanas.reduce((s, w) => s + w.days, 0)).toBe(100);
  });
  it('primeira semana pode ser parcial se o início não cair numa segunda-feira', () => {
    // 2024-03-01 é sexta-feira → primeira semana tem só 3 dias (sex/sab/dom)
    const semanas = buildCalendarWeeks(new Date(2024, 2, 1), 100);
    expect(semanas[0].days).toBe(3);
  });
});

describe('buildCalendarDays', () => {
  it('gera um item por dia com número correto do dia do mês', () => {
    const dias = buildCalendarDays(new Date(2024, 2, 1), 32);
    expect(dias).toHaveLength(32);
    expect(dias[0].day).toBe(1);
    expect(dias[30].day).toBe(31); // 31 de março
    expect(dias[31].day).toBe(1); // 1 de abril
    expect(dias[31].isMonthStart).toBe(true);
  });
  it('marca fins de semana corretamente', () => {
    const dias = buildCalendarDays(new Date(2024, 2, 1), 3); // sex, sab, dom
    expect(dias[0].isWeekend).toBe(false);
    expect(dias[1].isWeekend).toBe(true);
    expect(dias[2].isWeekend).toBe(true);
  });
});
