import { describe, it, expect } from 'vitest';
import { parseAnyDateToISO, dateToOffset } from '../modules/cronograma/cronogramaDateUtils';
import { applyFieldToEtapa } from '../modules/cronograma/scheduleEngine';

// Regressão: colar uma data em DD/MM/AAAA (formato que Excel/Google Sheets copiam por
// padrão no Brasil) numa coluna de data da Lista (Início, Fim, Restrição) gravava o
// texto cru, fora do ISO que o resto do app espera — a data colada parecia ignorada.
describe('parseAnyDateToISO', () => {
  it('aceita ISO e mantém só a parte da data', () => {
    expect(parseAnyDateToISO('2024-12-16')).toBe('2024-12-16');
    expect(parseAnyDateToISO('2024-12-16T00:00:00.000Z')).toBe('2024-12-16');
  });

  it('converte DD/MM/AAAA para ISO', () => {
    expect(parseAnyDateToISO('16/12/2024')).toBe('2024-12-16');
    expect(parseAnyDateToISO('1/2/2024')).toBe('2024-02-01');
  });

  it('converte DD/MM/AA (ano com 2 dígitos) para ISO', () => {
    expect(parseAnyDateToISO('16/12/24')).toBe('2024-12-16');
    expect(parseAnyDateToISO('19/05/25')).toBe('2025-05-19');
  });

  it('rejeita data inválida (ex.: 31/02) sem corromper', () => {
    expect(parseAnyDateToISO('31/02/2024')).toBe('');
  });

  it('rejeita texto que não é data', () => {
    expect(parseAnyDateToISO('não é data')).toBe('');
    expect(parseAnyDateToISO('')).toBe('');
    expect(parseAnyDateToISO(null)).toBe('');
  });
});

describe('applyFieldToEtapa — colar data (inicio/fim/restricao)', () => {
  const base = { id: 1, inicio: 100, dur: 5, restricaoTipo: 'asap', restricaoData: '' };

  it('campo inicio: aceita ISO e BR, gravando o mesmo offset', () => {
    const viaISO = applyFieldToEtapa(base, 'inicio', '2024-12-16', [base]);
    const viaBR  = applyFieldToEtapa(base, 'inicio', '16/12/2024', [base]);
    expect(viaISO.inicio).toBe(dateToOffset('2024-12-16'));
    expect(viaBR.inicio).toBe(viaISO.inicio);
  });

  it('campo inicio: colar texto inválido não altera a tarefa', () => {
    const r = applyFieldToEtapa(base, 'inicio', 'lixo', [base]);
    expect(r).toBe(base);
    expect(r.inicio).toBe(100);
  });

  it('campo restricao: BR e ISO gravam o mesmo restricaoData (ISO) e viram snet', () => {
    const viaBR  = applyFieldToEtapa(base, 'restricao', '16/12/2024', [base]);
    const viaISO = applyFieldToEtapa(base, 'restricao', '2024-12-16', [base]);
    expect(viaBR.restricaoData).toBe('2024-12-16');
    expect(viaBR.restricaoTipo).toBe('snet');
    expect(viaISO.restricaoData).toBe('2024-12-16');
  });

  it('campo restricao: colar vazio limpa a restrição (volta a asap)', () => {
    const comRestricao = { ...base, restricaoTipo: 'snet', restricaoData: '2024-12-16' };
    const r = applyFieldToEtapa(comRestricao, 'restricao', '', [comRestricao]);
    expect(r.restricaoTipo).toBe('asap');
    expect(r.restricaoData).toBe('');
  });

  it('campo restricao: colar texto inválido não altera a tarefa', () => {
    const comRestricao = { ...base, restricaoTipo: 'snet', restricaoData: '2024-12-16' };
    const r = applyFieldToEtapa(comRestricao, 'restricao', 'lixo', [comRestricao]);
    expect(r).toBe(comRestricao);
  });
});
