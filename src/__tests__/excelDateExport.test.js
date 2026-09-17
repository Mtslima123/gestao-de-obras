import { describe, it, expect } from 'vitest';
import { offsetToDate, dateToExcelSerial } from '../modules/cronograma/cronogramaDateUtils';

// Regressão: exportar pra Excel entregava o Date object cru pro xlsx-js-style, cuja
// conversão interna (baseada em Date.getTime(), sensível ao fuso do processo) jogava a
// data 1 dia pra trás em qualquer fuso negativo (Brasil, UTC-3) — a tela mostrava a data
// certa, mas o .xlsx baixado vinha com todas as datas um dia antes. dateToExcelSerial
// calcula o serial nós mesmos (aritmética 100% em Date.UTC), sem depender do fuso do
// processo/navegador que roda o export.
describe('dateToExcelSerial', () => {
  it('calcula o serial correto do Excel pra uma data conhecida', () => {
    // 01/09/2024 = serial 45536 no Excel (dias desde 30/12/1899, conferido no LibreOffice).
    expect(dateToExcelSerial(new Date(2024, 8, 1))).toBe(45536);
  });

  it('mantém a diferença de dias entre datas consecutivas (nunca 0 nem negativo)', () => {
    const serial1 = dateToExcelSerial(offsetToDate(0));
    const serial2 = dateToExcelSerial(offsetToDate(1));
    expect(serial2 - serial1).toBe(1);
  });

  it('é insensível ao horário embutido no Date (só a data importa)', () => {
    const meiaNoite = new Date(2024, 8, 1, 0, 0, 0);
    const quaseMeiaNoite = new Date(2024, 8, 1, 23, 59, 59);
    expect(dateToExcelSerial(meiaNoite)).toBe(dateToExcelSerial(quaseMeiaNoite));
  });
});
