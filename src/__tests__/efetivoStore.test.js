import { describe, it, expect } from 'vitest';
import { mesesEntre, previstoNoMes, orcado, ativos, trabCanteiro, efetivoDoMes, status, mesesRestantes, mediaRestante } from '../modules/maoDeObra/efetivo/regras';
import { mesesDaObra, mesDeAbs, efetivoMes, consumidoAte, saldoAcumulado, ativosQ } from '../modules/maoDeObra/efetivo/efetivoStore';

const item = (funcaoId, campos) => ({ apropriacaoId: 'x', funcaoId, totalEfetivo: null, trabAdm: null, inssSeguro: null, ferias: null, emprestManut: null, destino: null, recebidoOutraObra: null, origem: null, ...campos });
const apr = (mes, quinzena, status, itens) => ({ id: `${mes}-${quinzena}`, obraId: 'O1', ano: 2026, mes, quinzena, dataReferencia: '', status, lancadaEm: null, lancadaPor: null, itens });

// Obra Set/26 a Dez/26, uma função (id "1") com 5 pessoas/mês de Set a Nov.
const estado = (apropriacoes) => ({
  obra: { id: 'O1', codigo: 'AAZ', inicio: '2026-09-16', termino: '2026-12-31', previstoTrancado: true },
  funcoes: [{ id: '1', nome: 'Carpinteiro', grupoId: 'OFICIAL', classificacao: null, ativo: true }],
  classificacoes: [],
  previsto: [{ obraId: 'O1', funcaoId: '1', qtdMes: 5, inicio: '2026-09-01', termino: '2026-11-30' }],
  apropriacoes,
});

describe('regras.ts (fonte da verdade, copiada do handoff)', () => {
  it('meses entre datas = meses-calendário, inclusive (15/03 a 10/05 = 3)', () => {
    expect(mesesEntre('2026-03-15', '2026-05-10')).toBe(3);
    expect(mesesEntre('2026-05-01', '2027-10-31')).toBe(18);
  });

  it('previsto no mês só dentro do intervalo; orçado = qtd × meses', () => {
    const p = { obraId: 'O1', funcaoId: '1', qtdMes: 8, inicio: '2026-05-01', termino: '2027-06-30' };
    expect(previstoNoMes(p, 2026, 4)).toBe(0);
    expect(previstoNoMes(p, 2026, 5)).toBe(8);
    expect(previstoNoMes(p, 2027, 7)).toBe(0);
    expect(orcado(p)).toBe(112);
  });

  it('trab. canteiro e ativos', () => {
    const i = item('1', { totalEfetivo: 10, trabAdm: 2, inssSeguro: 1, ferias: 1, emprestManut: 1, recebidoOutraObra: 3 });
    expect(trabCanteiro(i)).toBe(5);
    expect(ativos(i)).toBe(2 + 5 + 3);
    expect(ativos(item('1', {}))).toBeNull();
  });

  it('efetivo do mês = 2ª quinzena se existir, senão a 1ª (nunca média)', () => {
    expect(efetivoDoMes(6, 8)).toBe(8);
    expect(efetivoDoMes(6, null)).toBe(6);
    expect(efetivoDoMes(null, null)).toBeNull();
  });

  it('status e média restante', () => {
    expect(status(5, 5)).toBe('ok');
    expect(status(5, 6)).toBe('acima');
    expect(status(0, 1)).toBe('sem');
    expect(status(5, null)).toBe('pend');
    expect(mesesRestantes('2026-10-01', '2027-10-31')).toBe(12);
    expect(mediaRestante(24, 12)).toBe(2);
    expect(mediaRestante(24, 0)).toBeNull();
  });
});

describe('efetivoStore', () => {
  it('meses da obra do início ao término; sem datas = []', () => {
    expect(mesesDaObra(estado([]).obra).map((m) => m.label)).toEqual(['Set/26', 'Out/26', 'Nov/26', 'Dez/26']);
    expect(mesesDaObra({ inicio: '2026-09-16', termino: null })).toEqual([]);
    expect(mesesDaObra({ inicio: null, termino: '2026-12-31' })).toEqual([]);
    expect(mesesDaObra({ inicio: '2026-12-01', termino: '2026-09-30' })).toEqual([]);
  });

  it('efetivo do mês ignora quinzena em RASCUNHO (alinhado à view do banco)', () => {
    const s = estado([
      apr(10, 1, 'LANCADA', [item('1', { totalEfetivo: 4 })]),
      apr(10, 2, 'RASCUNHO', [item('1', { totalEfetivo: 9 })]),
    ]);
    const out = mesDeAbs(2026 * 12 + 9);
    expect(efetivoMes(s, '1', out)).toBe(4);
    expect(ativosQ(s, '1', out, 2)).toBeNull();
    expect(ativosQ(s, '1', out, 2, true)).toBe(9); // a aba Apropriação enxerga o rascunho
  });

  it('com as duas lançadas vale a 2ª', () => {
    const s = estado([
      apr(10, 1, 'LANCADA', [item('1', { totalEfetivo: 4 })]),
      apr(10, 2, 'LANCADA', [item('1', { totalEfetivo: 6 })]),
    ]);
    expect(efetivoMes(s, '1', mesDeAbs(2026 * 12 + 9))).toBe(6);
  });

  it('consumido soma o efetivo de cada mês até o selecionado; saldo acumulado = Σ(previsto − efetivo)', () => {
    const s = estado([
      apr(9, 1, 'LANCADA', [item('1', { totalEfetivo: 3 })]),
      apr(10, 1, 'LANCADA', [item('1', { totalEfetivo: 4 })]),
      apr(10, 2, 'LANCADA', [item('1', { totalEfetivo: 7 })]),
      apr(11, 1, 'LANCADA', [item('1', { totalEfetivo: 5 })]),
    ]);
    const out = mesDeAbs(2026 * 12 + 9);
    expect(consumidoAte(s, '1', out)).toBe(3 + 7);
    expect(saldoAcumulado(s, '1', out)).toBe((5 - 3) + (5 - 7));
    expect(saldoAcumulado(s, '1', mesDeAbs(2026 * 12 + 8))).toBe(2);
  });

  it('sem apropriação lançada o saldo acumulado é nulo e o consumido é 0', () => {
    const s = estado([apr(9, 1, 'RASCUNHO', [item('1', { totalEfetivo: 3 })])]);
    const set = mesDeAbs(2026 * 12 + 8);
    expect(consumidoAte(s, '1', set)).toBe(0);
    expect(saldoAcumulado(s, '1', set)).toBeNull();
  });
});
