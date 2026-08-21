// Rateio mensal de custo (Uso da Tarefa, Curva Física e Medição Mensal).
// A duração é em dias ÚTEIS; a janela do rateio tem que ir até o término real, senão
// as fatias dos últimos meses da tarefa não existem e ela desaparece da Medição.
// Roda em node (sem browser/Supabase). Executar: npm test
import { describe, it, expect, beforeEach } from 'vitest';
import { computeMonthlyDist, getMonthRange } from '../modules/cronograma/scheduleEngine';
import { setWorkCal, dateToOffset, taskEnd } from '../modules/cronograma/cronogramaDateUtils';

// Calendário padrão do projeto: seg-sex, sem sábado útil, sem feriados.
beforeEach(() => setWorkCal({ sabadoUtil: false, holidays: [] }));

const somaFatias = (dist) => Object.values(dist).reduce((s, v) => s + v, 0);

describe('computeMonthlyDist — janela até o término real', () => {
  // Caso da tela: 27/10/2026, 56 dias úteis. Em dias úteis termina em 13/01/2027;
  // em dias corridos (o bug) a janela fechava em 22/12/2026 e Janeiro sumia.
  const tarefa = { id: 'A', isGroup: false, inicio: dateToOffset('2026-10-27'), dur: 56, custo: 100000 };

  it('a tarefa termina em janeiro no calendário de dias úteis', () => {
    // Sanidade do cenário: se isto falhar, o caso de teste perdeu o sentido.
    expect(taskEnd(tarefa)).toBeGreaterThan(dateToOffset('2027-01-01'));
  });

  it('gera fatia no último mês da tarefa (era o mês que desaparecia)', () => {
    const dist = computeMonthlyDist([tarefa])['A'];
    expect(Object.keys(dist).sort()).toEqual(['2026-10', '2026-11', '2026-12', '2027-01']);
    expect(dist['2027-01']).toBeGreaterThan(0);
  });

  it('preserva o custo total da tarefa (invariante)', () => {
    const dist = computeMonthlyDist([tarefa])['A'];
    expect(somaFatias(dist)).toBeCloseTo(100000, 6);
  });

  it('getMonthRange inclui o mês final, senão ele não apareceria no seletor', () => {
    expect(getMonthRange([tarefa]).map(m => m.key)).toContain('2027-01');
  });

  it('as fatias são proporcionais aos dias corridos dentro da janela', () => {
    const dist = computeMonthlyDist([tarefa])['A'];
    // Outubro entra com 5 dias (27 a 31) de uma janela de 78 dias corridos.
    const totalDias = taskEnd(tarefa) - tarefa.inicio;
    expect(dist['2026-10']).toBeCloseTo((100000 * 5) / totalDias, 6);
  });
});

describe('computeMonthlyDist — bordas', () => {
  it('marco (dur 0) mantém uma fatia de um dia', () => {
    const marco = { id: 'M', isGroup: false, inicio: dateToOffset('2026-05-10'), dur: 0, custo: 5000 };
    const dist = computeMonthlyDist([marco])['M'];
    expect(dist['2026-05']).toBeCloseTo(5000, 6);
    expect(somaFatias(dist)).toBeCloseTo(5000, 6);
  });

  it('ignora grupos (só folhas são rateadas)', () => {
    const grupo = { id: 'G', isGroup: true, inicio: dateToOffset('2026-05-01'), dur: 30, custo: 9999 };
    expect(computeMonthlyDist([grupo])['G']).toBeUndefined();
  });

  it('tarefa dentro de um único mês fica toda nele', () => {
    const t = { id: 'B', isGroup: false, inicio: dateToOffset('2026-06-01'), dur: 5, custo: 800 };
    const dist = computeMonthlyDist([t])['B'];
    expect(Object.keys(dist)).toEqual(['2026-06']);
    expect(dist['2026-06']).toBeCloseTo(800, 6);
  });

  it('weightOverride substitui o custo (peso do orçamento)', () => {
    const t = { id: 'C', isGroup: false, inicio: dateToOffset('2026-06-01'), dur: 5, custo: 800 };
    const dist = computeMonthlyDist([t], { C: 2000 })['C'];
    expect(somaFatias(dist)).toBeCloseTo(2000, 6);
  });

  it('sábado útil encurta a janela e realoca as fatias, sem mudar o total', () => {
    const t = { id: 'D', isGroup: false, inicio: dateToOffset('2026-10-27'), dur: 56, custo: 100000 };
    const semSabado = computeMonthlyDist([t])['D'];
    setWorkCal({ sabadoUtil: true, holidays: [] });
    const comSabado = computeMonthlyDist([t])['D'];
    expect(somaFatias(comSabado)).toBeCloseTo(somaFatias(semSabado), 6);
    // Com sábado trabalhado a tarefa acaba mais cedo, então o último mês recebe menos
    // (ou deixa de existir) e os primeiros recebem mais.
    expect(comSabado['2026-10']).toBeGreaterThan(semSabado['2026-10']);
  });
});
