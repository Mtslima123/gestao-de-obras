import { describe, it, expect } from 'vitest';
import { origemDaCopia, itensDaCopia, apropriacaoTemDados } from '../modules/maoDeObra/efetivo/copiaMesAnteriorPure';
import { mesDeAbs } from '../modules/maoDeObra/efetivo/efetivoStore';
import { trabCanteiro } from '../modules/maoDeObra/efetivo/regras';

const item = (funcaoId, campos) => ({ apropriacaoId: 'x', funcaoId, totalEfetivo: null, trabAdm: null, inssSeguro: null, ferias: null, emprestManut: null, destino: null, recebidoOutraObra: null, origem: null, ...campos });
const apr = (ano, mes, quinzena, status, itens) => ({ id: `${ano}-${mes}-${quinzena}`, obraId: 'O1', ano, mes, quinzena, dataReferencia: '', status, lancadaEm: null, lancadaPor: null, itens });
const estado = (apropriacoes) => ({ obra: { id: 'O1' }, funcoes: [], apropriacoes });

describe('origemDaCopia: 2ª do mês anterior', () => {
  const nov = mesDeAbs(2026 * 12 + 10); // Nov/2026

  it('acha a 2ª do mês anterior lançada e com dados', () => {
    const s = estado([apr(2026, 10, 2, 'LANCADA', [item('1', { totalEfetivo: 4 })]), apr(2026, 10, 1, 'LANCADA', [item('1', { totalEfetivo: 9 })])]);
    const r = origemDaCopia(s, nov);
    expect(r.erro).toBeNull();
    expect(r.mes.label).toBe('Out/26');
    expect(r.ap.itens[0].totalEfetivo).toBe(4); // a 2ª, não a 1ª
  });

  it('janeiro busca dezembro do ano anterior', () => {
    const jan = mesDeAbs(2027 * 12);
    const s = estado([apr(2026, 12, 2, 'LANCADA', [item('1', { totalEfetivo: 4 })])]);
    const r = origemDaCopia(s, jan);
    expect(r.mes).toMatchObject({ ano: 2026, mes: 12 });
    expect(r.erro).toBeNull();
  });

  it('recusa quando não existe a 2ª do mês anterior', () => {
    const r = origemDaCopia(estado([]), nov);
    expect(r.erro).toBe('A 2ª apropriação de Out/26 não tem dados para copiar.');
  });

  it('recusa rascunho: só vale o que foi lançado', () => {
    const s = estado([apr(2026, 10, 2, 'RASCUNHO', [item('1', { totalEfetivo: 4 })])]);
    expect(origemDaCopia(s, nov).erro).toMatch(/ainda não foi lançada/);
  });

  it('recusa lançada que só tem linhas zeradas (o Lançar zera toda função ativa)', () => {
    const s = estado([apr(2026, 10, 2, 'LANCADA', [item('1', { totalEfetivo: 0, trabAdm: 0 })])]);
    expect(origemDaCopia(s, nov).erro).toMatch(/não tem dados/);
  });
});

describe('itensDaCopia', () => {
  it('copia os campos e refaz o vínculo com a apropriação de destino', () => {
    const origem = [item('1', { apropriacaoId: 'velha', totalEfetivo: 10, trabAdm: 2, inssSeguro: 1, ferias: 1, emprestManut: 1, recebidoOutraObra: 3, destino: ' CRI ', origem: 'LEC' })];
    const [c] = itensDaCopia(origem, ['1'], 'nova');
    expect(c).toEqual({ apropriacaoId: 'nova', funcaoId: '1', totalEfetivo: 10, trabAdm: 2, inssSeguro: 1, ferias: 1, emprestManut: 1, destino: 'CRI', recebidoOutraObra: 3, origem: 'LEC' });
  });

  it('mantém o Trab. no canteiro igual ao da origem', () => {
    const origem = [item('1', { totalEfetivo: 10, trabAdm: 2, inssSeguro: 1, ferias: 1, emprestManut: 1 })];
    expect(trabCanteiro(itensDaCopia(origem, ['1'], 'n')[0])).toBe(trabCanteiro(origem[0]));
  });

  it('deixa de fora função que não está mais ativa na obra', () => {
    const origem = [item('1', { totalEfetivo: 3 }), item('2', { totalEfetivo: 5 })];
    expect(itensDaCopia(origem, ['1'], 'n').map((i) => i.funcaoId)).toEqual(['1']);
  });

  it('compara o id da função como texto (número e string)', () => {
    expect(itensDaCopia([item(1, { totalEfetivo: 3 })], ['1'], 'n')).toHaveLength(1);
  });

  it('descarta linha zerada e sem texto, mas mantém linha só com Destino', () => {
    const origem = [item('1', { totalEfetivo: 0, trabAdm: 0 }), item('2', {}), item('3', { destino: 'CRI' })];
    expect(itensDaCopia(origem, ['1', '2', '3'], 'n').map((i) => i.funcaoId)).toEqual(['3']);
  });

  it('texto em branco vira null', () => {
    const [c] = itensDaCopia([item('1', { totalEfetivo: 2, destino: '   ', origem: '' })], ['1'], 'n');
    expect(c.destino).toBeNull();
    expect(c.origem).toBeNull();
  });
});

describe('apropriacaoTemDados: guarda de sobrescrita da 1ª', () => {
  it('sem apropriação ou sem linhas não tem dados', () => {
    expect(apropriacaoTemDados(undefined)).toBe(false);
    expect(apropriacaoTemDados(apr(2026, 11, 1, 'RASCUNHO', []))).toBe(false);
  });

  it('número digitado conta', () => {
    expect(apropriacaoTemDados(apr(2026, 11, 1, 'RASCUNHO', [item('1', { trabAdm: 2 })]))).toBe(true);
  });

  it('só Destino/Origem em texto também conta (temValor não enxerga)', () => {
    expect(apropriacaoTemDados(apr(2026, 11, 1, 'RASCUNHO', [item('1', { origem: 'LEC' })]))).toBe(true);
  });

  it('só zeros não conta', () => {
    expect(apropriacaoTemDados(apr(2026, 11, 1, 'RASCUNHO', [item('1', { totalEfetivo: 0 })]))).toBe(false);
  });
});
