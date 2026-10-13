import { describe, it, expect } from 'vitest';
import { mesesEntre, previstoNoMes, orcado, ativos, trabCanteiro, efetivoDoMes, status, mesesRestantes, mediaRestante } from '../modules/maoDeObra/efetivo/regras';
import { mesesDaObra, mesDeAbs, efetivoMes, consumidoAte, saldoAcumulado, ativosQ, aplicarPatchItem, totalEfetivoTela, mesApropriavel, mesesApropriaveis, mesesParaHabilitar, habilitadosRemoviveis, mesFechado, mesesFechaveis, mesSemDados, lerQtd, funcoesComApropriacao, porOrdemDoCadastro } from '../modules/maoDeObra/efetivo/efetivoStore';

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

describe('aplicarPatchItem (canteiro digitado, total efetivo calculado)', () => {
  it('digitar o canteiro numa linha vazia: ativos = canteiro e o canteiro volta igual', () => {
    const i = aplicarPatchItem(item('1', {}), { canteiro: 4 });
    expect(trabCanteiro(i)).toBe(4);
    expect(ativos(i)).toBe(4);
  });

  it('ativos = ADM + canteiro + recebido; total efetivo da tela = ADM + canteiro + emprest.', () => {
    let i = aplicarPatchItem(item('1', {}), { canteiro: 3 });
    i = aplicarPatchItem(i, { trabAdm: 2 });
    i = aplicarPatchItem(i, { recebidoOutraObra: 1 });
    i = aplicarPatchItem(i, { emprestManut: 4 });
    expect(trabCanteiro(i)).toBe(3);
    expect(ativos(i)).toBe(2 + 3 + 1);
    expect(totalEfetivoTela(i)).toBe(2 + 3 + 4);
  });

  it('mexer em ADM, INSS, férias ou emprest. não muda o canteiro digitado', () => {
    let i = aplicarPatchItem(item('1', {}), { canteiro: 5 });
    for (const patch of [{ trabAdm: 2 }, { inssSeguro: 1 }, { ferias: 3 }, { emprestManut: 1 }, { trabAdm: 0 }, { ferias: null }]) {
      i = aplicarPatchItem(i, patch);
      expect(trabCanteiro(i)).toBe(5);
    }
    expect(i.totalEfetivo).toBe(5 + 0 + 1 + 0 + 1);
  });

  it('INSS e férias ficam fora do total efetivo da tela e dos ativos', () => {
    const i = aplicarPatchItem(aplicarPatchItem(item('1', {}), { canteiro: 2 }), { inssSeguro: 4, ferias: 1 });
    expect(totalEfetivoTela(i)).toBe(2);
    expect(ativos(i)).toBe(2);
  });

  it('limpar tudo volta a linha para vazia (sem valor)', () => {
    let i = aplicarPatchItem(item('1', {}), { canteiro: 2 });
    i = aplicarPatchItem(i, { canteiro: null });
    expect(i.totalEfetivo).toBeNull();
    expect(ativos(i)).toBeNull();
  });

  it('canteiro 0 digitado conta como preenchido', () => {
    const i = aplicarPatchItem(item('1', {}), { canteiro: 0 });
    expect(i.totalEfetivo).toBe(0);
    expect(ativos(i)).toBe(0);
  });

  it('linha antiga (total bruto do banco) mantém o canteiro que a tela já mostrava', () => {
    const antigo = item('1', { totalEfetivo: 10, trabAdm: 2, inssSeguro: 1, ferias: 1, emprestManut: 1, recebidoOutraObra: 3 }); // canteiro 5
    const i = aplicarPatchItem(antigo, { trabAdm: 3 });
    expect(trabCanteiro(i)).toBe(5);
    expect(ativos(i)).toBe(3 + 5 + 3);
  });

  it('só recebido outra obra: total do banco continua vazio', () => {
    const i = aplicarPatchItem(item('1', {}), { recebidoOutraObra: 2 });
    expect(i.totalEfetivo).toBeNull();
    expect(ativos(i)).toBe(2);
  });

  it('destino e origem não mexem nos números', () => {
    const base = item('1', { totalEfetivo: 10, trabAdm: 2 });
    const i = aplicarPatchItem(base, { destino: 'CRI' });
    expect(i.totalEfetivo).toBe(10);
    expect(i.destino).toBe('CRI');
  });
});

describe('totalEfetivoTela', () => {
  it('ADM + canteiro + emprest./manut.; recebido outra obra, INSS e férias não entram', () => {
    const i = item('1', { totalEfetivo: 10, trabAdm: 2, inssSeguro: 1, ferias: 1, emprestManut: 1, recebidoOutraObra: 3 }); // canteiro 5
    expect(totalEfetivoTela(i)).toBe(2 + 5 + 1);
  });

  it('linha sem nenhum valor não tem total', () => {
    expect(totalEfetivoTela(item('1', {}))).toBeNull();
    expect(totalEfetivoTela(undefined)).toBeNull();
  });
});

describe('meses disponíveis para apropriação', () => {
  const OUT = 2026 * 12 + 9; // mês atual: Out/26
  const labels = (ms) => ms.map((m) => m.label);
  const todos = mesesDaObra(estado([]).obra); // Set/26 a Dez/26

  it('sem apropriação e sem habilitação só o mês atual aparece', () => {
    const s = estado([]);
    expect(labels(mesesApropriaveis(s, todos, OUT))).toEqual(['Out/26']);
    expect(labels(mesesParaHabilitar(s, todos, OUT))).toEqual(['Set/26', 'Nov/26', 'Dez/26']);
  });

  it('mês que já tem apropriação (rascunho ou lançada) continua na lista', () => {
    const s = estado([apr(9, 1, 'LANCADA', [item('1', { totalEfetivo: 3 })]), apr(11, 2, 'RASCUNHO', [])]);
    expect(labels(mesesApropriaveis(s, todos, OUT))).toEqual(['Set/26', 'Out/26', 'Nov/26']);
  });

  it('mês habilitado pelo admin entra na lista', () => {
    const s = { ...estado([]), mesesHabilitados: [{ ano: 2026, mes: 12 }] };
    expect(labels(mesesApropriaveis(s, todos, OUT))).toEqual(['Out/26', 'Dez/26']);
    expect(mesApropriavel(s, mesDeAbs(2026 * 12 + 10), OUT)).toBe(false);
  });

  it('estado sem mesesHabilitados (banco ainda sem a migration) não quebra', () => {
    expect(labels(mesesApropriaveis(estado([]), todos, OUT))).toEqual(['Out/26']);
  });

  it('mês atual fora do período da obra não aparece', () => {
    expect(mesesApropriaveis(estado([]), todos, 2027 * 12)).toEqual([]);
  });

  it('só dá para remover habilitado que ainda não tem apropriação', () => {
    const s = { ...estado([apr(11, 1, 'RASCUNHO', [])]), mesesHabilitados: [{ ano: 2026, mes: 11 }, { ano: 2026, mes: 12 }] };
    expect(labels(habilitadosRemoviveis(s, todos))).toEqual(['Dez/26']);
  });
});

describe('meses fechados', () => {
  const OUT = 2026 * 12 + 9;
  const todos = mesesDaObra(estado([]).obra);
  const comApropriacao = estado([apr(11, 2, 'LANCADA', []), apr(9, 1, 'LANCADA', []), apr(9, 2, 'RASCUNHO', [])]);

  it('só dá para fechar mês com apropriação, do mais antigo ao mais novo, sem repetir o mês', () => {
    expect(mesesFechaveis(comApropriacao).map((m) => m.label)).toEqual(['Set/26', 'Nov/26']);
    expect(mesesFechaveis(estado([]))).toEqual([]);
  });

  it('mesFechado olha a lista que o banco devolve', () => {
    const s = { ...comApropriacao, mesesFechados: [{ ano: 2026, mes: 9 }] };
    expect(mesFechado(s, mesDeAbs(2026 * 12 + 8))).toBe(true);
    expect(mesFechado(s, mesDeAbs(2026 * 12 + 10))).toBe(false);
  });

  it('estado sem mesesFechados (banco ainda sem a migration) não quebra e nada fica fechado', () => {
    expect(mesFechado(comApropriacao, mesDeAbs(2026 * 12 + 8))).toBe(false);
  });

  it('mês fechado continua na lista de períodos da Apropriação', () => {
    const s = { ...comApropriacao, mesesFechados: [{ ano: 2026, mes: 9 }] };
    expect(mesesApropriaveis(s, todos, OUT).map((m) => m.label)).toEqual(['Set/26', 'Out/26', 'Nov/26']);
  });
});

describe('excluir mês sem dados', () => {
  const m = (mes) => mesDeAbs(2026 * 12 + mes - 1);

  it('mês só com rascunho vazio pode ser excluído', () => {
    const s = estado([apr(9, 1, 'RASCUNHO', []), apr(9, 2, 'RASCUNHO', [])]);
    expect(mesSemDados(s, m(9))).toBe(true);
  });

  it('qualquer linha preenchida ou quinzena lançada impede a exclusão', () => {
    expect(mesSemDados(estado([apr(9, 1, 'RASCUNHO', [item('1', { totalEfetivo: 2 })])]), m(9))).toBe(false);
    expect(mesSemDados(estado([apr(9, 1, 'RASCUNHO', [item('1', { destino: 'CRI' })])]), m(9))).toBe(false);
    expect(mesSemDados(estado([apr(9, 1, 'LANCADA', [])]), m(9))).toBe(false);
    expect(mesSemDados(estado([apr(9, 1, 'RASCUNHO', []), apr(9, 2, 'RASCUNHO', [item('1', { ferias: 1 })])]), m(9))).toBe(false);
  });

  it('mês fechado ou sem apropriação nenhuma não entra', () => {
    const fechado = { ...estado([apr(9, 1, 'RASCUNHO', [])]), mesesFechados: [{ ano: 2026, mes: 9 }] };
    expect(mesSemDados(fechado, m(9))).toBe(false);
    expect(mesSemDados(estado([]), m(9))).toBe(false);
  });
});

describe('lerQtd (quantidade do previsto, pode ser quebrada)', () => {
  it('aceita vírgula e ponto, com até 2 casas', () => {
    expect(lerQtd('2,5')).toBe(2.5);
    expect(lerQtd('2.5')).toBe(2.5);
    expect(lerQtd('2.')).toBe(2);
    expect(lerQtd('0,333')).toBe(0.33);
    expect(lerQtd('20')).toBe(20);
  });

  it('vazio, negativo e texto viram 0', () => {
    expect(lerQtd('')).toBe(0);
    expect(lerQtd(null)).toBe(0);
    expect(lerQtd('-3')).toBe(0);
    expect(lerQtd('abc')).toBe(0);
  });
});

describe('funcoesComApropriacao (função que não pode sair da lista da obra)', () => {
  const com = (apropriacoes) => funcoesComApropriacao({ apropriacoes });

  it('valor diferente de zero em qualquer campo numérico conta', () => {
    for (const campo of ['totalEfetivo', 'trabAdm', 'inssSeguro', 'ferias', 'emprestManut', 'recebidoOutraObra']) {
      expect(com([apr(9, 1, 'RASCUNHO', [item('1', { [campo]: 2 })])]).has('1')).toBe(true);
    }
  });

  it('destino ou origem preenchidos contam, mesmo sem número', () => {
    expect(com([apr(9, 1, 'RASCUNHO', [item('1', { destino: 'Obra B' })])]).has('1')).toBe(true);
    expect(com([apr(9, 1, 'RASCUNHO', [item('2', { origem: 'Obra C' })])]).has('2')).toBe(true);
  });

  it('linha zerada (o que o Lançar grava para toda função) e texto em branco não contam', () => {
    const zerada = item('1', { totalEfetivo: 0, trabAdm: 0, inssSeguro: 0, ferias: 0, emprestManut: 0, recebidoOutraObra: 0, destino: '  ', origem: '' });
    expect(com([apr(9, 1, 'LANCADA', [zerada])]).has('1')).toBe(false);
    expect(com([apr(9, 1, 'RASCUNHO', [item('1', {})])]).has('1')).toBe(false);
  });

  it('vale rascunho ou lançada, em qualquer quinzena ou mês, e só para a função que tem valor', () => {
    const set = com([
      apr(9, 1, 'RASCUNHO', [item('1', { trabAdm: 1 })]),
      apr(10, 2, 'LANCADA', [item('3', { ferias: 4 }), item('2', {})]),
    ]);
    expect([...set].sort()).toEqual(['1', '3']);
  });

  it('obra sem apropriação: ninguém tem', () => {
    expect(com([]).size).toBe(0);
  });
});

describe('porOrdemDoCadastro', () => {
  it('ordena por ordem e desempata pelo id numérico (10 depois de 9)', () => {
    const lista = [{ id: '10', ordem: 1 }, { id: '9', ordem: 1 }, { id: '3', ordem: 0 }, { id: '4' }];
    expect(lista.sort(porOrdemDoCadastro).map((f) => f.id)).toEqual(['3', '4', '9', '10']);
  });
});
