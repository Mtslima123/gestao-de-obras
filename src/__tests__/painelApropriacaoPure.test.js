import { describe, it, expect } from 'vitest';
import {
  estadoQuinzena, filtrarPainel, mesForaDoPeriodo, mesesDoPainel, montarPainel, periodoDaObra, resumoPainel,
} from '../modules/maoDeObra/efetivo/painelApropriacaoPure';
import { mesDeAbs, rotuloObra } from '../modules/maoDeObra/efetivo/efetivoStore';

const OUT26 = mesDeAbs(2026 * 12 + 9); // Out/26

const obra = (id, extra = {}) => ({ id, nome: `Obra ${id}`, sigla: id, status: 'em_andamento', inicio: '2026-01-10', previsto: '2027-12-31', dataFimObra: null, ...extra });
const linha = (obraId, quinzena, status, extra = {}) => ({
  obra_id: obraId, ano: 2026, mes: 10, quinzena, status, lancada_em: status === 'LANCADA' ? '2026-10-15T12:00:00Z' : null, lancada_por: status === 'LANCADA' ? 'Matheus' : null, ...extra,
});
const por = (rows, id) => rows.find((r) => r.obraId === id);

describe('estadoQuinzena', () => {
  it('lançada, rascunho e pendente', () => {
    expect(estadoQuinzena({ status: 'LANCADA' }, false)).toBe('lancada');
    expect(estadoQuinzena({ status: 'RASCUNHO' }, false)).toBe('rascunho');
    expect(estadoQuinzena(undefined, false)).toBe('pendente');
  });

  it('sem linha e com o mês fora do período = fora; linha salva sempre aparece', () => {
    expect(estadoQuinzena(undefined, true)).toBe('fora');
    expect(estadoQuinzena({ status: 'LANCADA' }, true)).toBe('lancada');
  });
});

describe('periodoDaObra / mesForaDoPeriodo', () => {
  it('a configuração do Efetivo vale mais que o cadastro da obra', () => {
    const p = periodoDaObra(obra('A', { inicio: '2026-01-10', dataFimObra: '2027-06-30' }), { inicio_obra: '2026-03-01', termino_obra: '2026-12-31' });
    expect(p).toEqual({ inicio: '2026-03-01', termino: '2026-12-31' });
  });

  it('sem configuração, usa o cadastro (término: dataFimObra e, na falta, previsto)', () => {
    expect(periodoDaObra(obra('A', { dataFimObra: '2027-06-30' }), undefined)).toEqual({ inicio: '2026-01-10', termino: '2027-06-30' });
    expect(periodoDaObra(obra('A'), undefined).termino).toBe('2027-12-31');
  });

  it('período desconhecido não é fora', () => {
    expect(periodoDaObra({ id: 'X' }, undefined)).toEqual({ inicio: null, termino: null });
    expect(mesForaDoPeriodo({ inicio: null, termino: null }, OUT26)).toBe(false);
    expect(mesForaDoPeriodo({ inicio: '2026-01-10', termino: null }, OUT26)).toBe(false);
  });

  it('antes do mês de início e depois do mês de término é fora; início e término contam inclusive', () => {
    const p = { inicio: '2026-10-20', termino: '2026-10-25' };
    expect(mesForaDoPeriodo(p, OUT26)).toBe(false); // mesmo mês do início e do término
    expect(mesForaDoPeriodo(p, mesDeAbs(2026 * 12 + 8))).toBe(true);  // Set/26
    expect(mesForaDoPeriodo(p, mesDeAbs(2026 * 12 + 10))).toBe(true); // Nov/26
  });
});

describe('montarPainel', () => {
  it('uma linha por obra, com cada quinzena no seu estado', () => {
    const rows = montarPainel({
      obras: [obra('A'), obra('B'), obra('C')],
      linhas: [linha('A', 1, 'LANCADA'), linha('A', 2, 'LANCADA'), linha('B', 1, 'LANCADA'), linha('B', 2, 'RASCUNHO')],
      mes: OUT26,
    });
    expect(rows).toHaveLength(3);
    expect(por(rows, 'A').q1.estado).toBe('lancada');
    expect(por(rows, 'A').q2.estado).toBe('lancada');
    expect(por(rows, 'B').q2.estado).toBe('rascunho');
    expect(por(rows, 'C').q1.estado).toBe('pendente'); // obra sem nenhuma linha
    expect(por(rows, 'C').q2.estado).toBe('pendente');
  });

  it('só é completa com as duas lançadas; o resto é pendente', () => {
    const rows = montarPainel({
      obras: [obra('A'), obra('B'), obra('C')],
      linhas: [linha('A', 1, 'LANCADA'), linha('A', 2, 'LANCADA'), linha('B', 1, 'LANCADA'), linha('C', 1, 'RASCUNHO'), linha('C', 2, 'RASCUNHO')],
      mes: OUT26,
    });
    expect(por(rows, 'A').situacao).toBe('completa');
    expect(por(rows, 'B').situacao).toBe('pendente');
    expect(por(rows, 'C').situacao).toBe('pendente');
  });

  it('a 2ª pode estar lançada com a 1ª pendente (o banco não impõe a ordem)', () => {
    const [r] = montarPainel({ obras: [obra('A')], linhas: [linha('A', 2, 'LANCADA')], mes: OUT26 });
    expect(r.q1.estado).toBe('pendente');
    expect(r.q2.estado).toBe('lancada');
    expect(r.situacao).toBe('pendente');
  });

  it('guarda quem lançou e quando, só da quinzena lançada', () => {
    const [r] = montarPainel({ obras: [obra('A')], linhas: [linha('A', 1, 'LANCADA'), linha('A', 2, 'RASCUNHO')], mes: OUT26 });
    expect(r.q1).toEqual({ estado: 'lancada', lancadaEm: '2026-10-15T12:00:00Z', lancadaPor: 'Matheus' });
    expect(r.q2).toEqual({ estado: 'rascunho', lancadaEm: null, lancadaPor: null });
  });

  it('ignora linha de outro mês, de outro ano e de obra que não está na lista', () => {
    const rows = montarPainel({
      obras: [obra('A')],
      linhas: [linha('A', 1, 'LANCADA', { mes: 9 }), linha('A', 2, 'LANCADA', { ano: 2025 }), linha('Z', 1, 'LANCADA')],
      mes: OUT26,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].q1.estado).toBe('pendente');
    expect(rows[0].q2.estado).toBe('pendente');
  });

  it('mês fora do período: sem linha = fora nas duas; com alguma linha salva, vale o que está salvo', () => {
    const futura = obra('F', { inicio: '2027-01-01', previsto: '2027-12-31' });
    const comDado = obra('G', { inicio: '2027-01-01', previsto: '2027-12-31' });
    const rows = montarPainel({ obras: [futura, comDado], linhas: [linha('G', 1, 'LANCADA')], mes: OUT26 });
    expect(por(rows, 'F').situacao).toBe('fora');
    expect(por(rows, 'F').q1.estado).toBe('fora');
    expect(por(rows, 'F').q2.estado).toBe('fora');
    expect(por(rows, 'G').q1.estado).toBe('lancada');
    expect(por(rows, 'G').q2.estado).toBe('pendente'); // não vira "fora" só porque o mês está fora do cadastro
  });

  it('usa a configuração do Efetivo para o período', () => {
    const rows = montarPainel({
      obras: [obra('A')], linhas: [], mes: OUT26,
      configs: [{ obra_id: 'A', inicio_obra: '2026-11-01', termino_obra: '2027-02-28' }],
    });
    expect(rows[0].situacao).toBe('fora');
  });

  it('ordena: pendentes, depois completas, depois fora; por nome dentro de cada uma', () => {
    const rows = montarPainel({
      obras: [obra('A', { nome: 'Zeta' }), obra('B', { nome: 'Alfa' }), obra('C', { nome: 'Beta' }), obra('D', { nome: 'Gama', inicio: '2027-01-01' })],
      linhas: [linha('A', 1, 'LANCADA'), linha('A', 2, 'LANCADA'), linha('B', 1, 'LANCADA'), linha('B', 2, 'LANCADA')],
      mes: OUT26,
    });
    expect(rows.map((r) => r.obraId)).toEqual(['C', 'B', 'A', 'D']);
  });

  it('marca a obra concluída e usa o rótulo "SIGLA · Nome"', () => {
    const [r] = montarPainel({ obras: [obra('A', { sigla: 'AAZ', nome: 'Edifício Aurora', status: 'concluida' })], mes: OUT26 });
    expect(r.concluida).toBe(true);
    expect(r.rotulo).toBe('AAZ · Edifício Aurora');
  });

  it('entradas vazias não quebram', () => {
    expect(montarPainel({ mes: OUT26 })).toEqual([]);
    expect(montarPainel({ obras: [obra('A')], linhas: undefined, configs: undefined, mes: OUT26 })).toHaveLength(1);
  });
});

describe('rotuloObra', () => {
  it('sigla e nome; só o nome quando a sigla falta ou repete o código', () => {
    expect(rotuloObra({ id: 'OB-1', sigla: 'AAZ', nome: 'Aurora' })).toBe('AAZ · Aurora');
    expect(rotuloObra({ id: 'OB-1', sigla: 'OB-1', nome: 'Aurora' })).toBe('Aurora');
    expect(rotuloObra({ id: 'OB-1', nome: 'Aurora' })).toBe('Aurora');
    expect(rotuloObra({ id: 'OB-1' })).toBe('OB-1');
  });
});

describe('resumoPainel e filtrarPainel', () => {
  const rows = montarPainel({
    obras: [
      obra('A', { nome: 'Edifício Aurora' }), obra('B', { nome: 'Residencial São João' }), obra('C', { nome: 'Torre Céu' }),
      obra('D', { nome: 'Antigo', status: 'concluida' }), obra('E', { nome: 'Futura', inicio: '2027-01-01' }),
    ],
    linhas: [linha('A', 1, 'LANCADA'), linha('A', 2, 'LANCADA'), linha('D', 1, 'LANCADA'), linha('D', 2, 'LANCADA')],
    mes: OUT26,
  });

  it('conta completas, pendentes e fora', () => {
    expect(resumoPainel(rows)).toEqual({ total: 5, completas: 2, pendentes: 2, fora: 1 });
    expect(resumoPainel([])).toEqual({ total: 0, completas: 0, pendentes: 0, fora: 0 });
  });

  it('esconde as concluídas por padrão e mostra quando pedido', () => {
    expect(filtrarPainel(rows).map((r) => r.obraId)).not.toContain('D');
    expect(filtrarPainel(rows, { mostrarConcluidas: true }).map((r) => r.obraId)).toContain('D');
  });

  it('filtra por situação', () => {
    expect(filtrarPainel(rows, { situacao: 'pendentes' }).map((r) => r.obraId).sort()).toEqual(['B', 'C']);
    expect(filtrarPainel(rows, { situacao: 'completas' }).map((r) => r.obraId)).toEqual(['A']);
    expect(filtrarPainel(rows, { situacao: 'completas', mostrarConcluidas: true }).map((r) => r.obraId).sort()).toEqual(['A', 'D']);
  });

  it('busca pelo nome sem diferenciar acento nem caixa', () => {
    expect(filtrarPainel(rows, { busca: 'sao joao' }).map((r) => r.obraId)).toEqual(['B']);
    expect(filtrarPainel(rows, { busca: 'CEU' }).map((r) => r.obraId)).toEqual(['C']);
    expect(filtrarPainel(rows, { busca: 'inexistente' })).toEqual([]);
    expect(filtrarPainel(rows, { busca: '   ' }).length).toBe(4); // espaços não filtram
  });
});

describe('mesesDoPainel', () => {
  const atual = 2026 * 12 + 9; // Out/26
  const labels = (ms) => ms.map((m) => m.label);

  it('do mês atual para trás até o início da obra mais antiga', () => {
    const ms = mesesDoPainel({ obras: [obra('A', { inicio: '2026-07-20' }), obra('B', { inicio: '2026-09-01' })], mesAtualAbs: atual });
    expect(labels(ms)).toEqual(['Out/26', 'Set/26', 'Ago/26', 'Jul/26']);
  });

  it('sem início conhecido, só o mês atual', () => {
    expect(labels(mesesDoPainel({ obras: [{ id: 'X' }], mesAtualAbs: atual }))).toEqual(['Out/26']);
    expect(labels(mesesDoPainel({ mesAtualAbs: atual }))).toEqual(['Out/26']);
  });

  it('obra que começa no futuro não cria mês futuro', () => {
    expect(labels(mesesDoPainel({ obras: [obra('A', { inicio: '2027-03-01' })], mesAtualAbs: atual }))).toEqual(['Out/26']);
  });

  it('usa o início da configuração do Efetivo quando existe', () => {
    const ms = mesesDoPainel({ obras: [obra('A', { inicio: '2026-01-10' })], configs: [{ obra_id: 'A', inicio_obra: '2026-09-01', termino_obra: null }], mesAtualAbs: atual });
    expect(labels(ms)).toEqual(['Out/26', 'Set/26']);
  });

  it('limita a lista (data de início absurda não gera centenas de meses)', () => {
    expect(mesesDoPainel({ obras: [obra('A', { inicio: '1900-01-01' })], mesAtualAbs: atual })).toHaveLength(120);
  });

  it('ignora início inválido', () => {
    expect(labels(mesesDoPainel({ obras: [obra('A', { inicio: 'lixo' })], mesAtualAbs: atual }))).toEqual(['Out/26']);
  });
});
