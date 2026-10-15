import { describe, it, expect } from 'vitest';
import { COLUNAS, montarLinhas, nomeArquivo, subtitulo, titulo } from '../modules/maoDeObra/efetivo/exportApropriacao';

// Soma como a aba Apropriação monta (Z() em ApropriacaoTab.jsx).
const soma = (campos = {}) => ({ prev: 0, totalEfetivo: 0, trabAdm: 0, can: 0, inssSeguro: 0, ferias: 0, emprestManut: 0, recebidoOutraObra: 0, at: 0, any: false, ...campos });
const funcao = (id, nome) => ({ id, nome, grupoId: 'OFICIAL', classificacao: null, ativo: true });
const item = (campos) => ({ trabAdm: null, inssSeguro: null, ferias: null, emprestManut: null, destino: null, recebidoOutraObra: null, origem: null, ...campos });

describe('exportApropriacao: montarLinhas', () => {
  const carpinteiro = { f: funcao('1', 'Carpinteiro'), it: item({ trabAdm: 1, destino: 'Obra B' }), pv: 5, at: 4, can: 3, tot: 4 };
  const pedreiro = { f: funcao('2', 'Pedreiro'), it: undefined, pv: 2, at: null, can: null, tot: null };
  const grupo = soma({ prev: 7, totalEfetivo: 4, trabAdm: 1, can: 3, at: 4, any: true });
  const dados = { grupos: [{ nome: 'Oficial', rows: [carpinteiro, pedreiro], G: grupo }], total: grupo };

  it('cada grupo vem seguido das suas funções, e o total sai à parte', () => {
    const { linhas, total } = montarLinhas(dados);
    expect(linhas.map((l) => `${l.tipo}:${l.nome}`)).toEqual(['grupo:Oficial', 'funcao:Carpinteiro', 'funcao:Pedreiro']);
    expect(total.tipo).toBe('total');
    expect(total.nome).toBe('TOTAL');
  });

  it('função com valores: saldo = previsto - ativos, status e cores da tela', () => {
    const l = montarLinhas(dados).linhas[1];
    expect(l).toMatchObject({ prev: 5, totalEfetivo: 4, trabAdm: 1, canteiro: 3, destino: 'Obra B', ativos: 4, saldo: 1, status: 'No previsto' });
    expect(l.corSaldo).toBe('#014386'); // sobrou vaga: azul
    expect(l.corStatus).toBe('#0f7a3d'); // até 100%: verde
  });

  it('função sem apropriação sai em branco (nada de zero inventado) e Pendente', () => {
    const l = montarLinhas(dados).linhas[2];
    expect(l).toMatchObject({ prev: 2, totalEfetivo: null, trabAdm: null, canteiro: null, ativos: null, saldo: null, destino: '', origem: '', status: 'Pendente' });
    expect(l.corSaldo).toBeNull();
  });

  it('acima do previsto: saldo negativo em vermelho', () => {
    const acima = { f: funcao('3', 'Servente'), it: item({ trabAdm: 6 }), pv: 4, at: 6, can: 0, tot: 6 };
    const l = montarLinhas({ grupos: [{ nome: 'Servente', rows: [acima], G: soma({ prev: 4, at: 6, any: true }) }], total: soma({ prev: 4, at: 6, any: true }) }).linhas[1];
    expect(l.saldo).toBe(-2);
    expect(l.status).toBe('Acima do previsto');
    expect(l.corSaldo).toBe('#b42318');
    expect(l.corStatus).toBe('#b42318');
  });

  it('grupo e total mostram o uso em % e a soma das colunas', () => {
    const { linhas, total } = montarLinhas(dados);
    expect(linhas[0]).toMatchObject({ prev: 7, totalEfetivo: 4, trabAdm: 1, canteiro: 3, ativos: 4, saldo: 3, status: '57%', destino: '', origem: '' });
    expect(total.status).toBe('57%');
  });

  it('grupo sem nenhum valor apropriado: saldo, ativos e status em branco', () => {
    const vazio = soma({ prev: 3 });
    const { linhas, total } = montarLinhas({ grupos: [{ nome: 'Apoio', rows: [], G: vazio }], total: vazio });
    expect(linhas[0]).toMatchObject({ prev: 3, ativos: null, saldo: null, status: '', corSaldo: null, corStatus: null });
    expect(total.saldo).toBeNull();
  });

  it('previsto quebrado e soma de decimais não vazam ruído de ponto flutuante', () => {
    const o = soma({ prev: 0.1 + 0.2, at: 0, any: true });
    const { total } = montarLinhas({ grupos: [], total: o });
    expect(total.prev).toBe(0.3);
    expect(total.saldo).toBe(0.3);
  });

  it('previsto zero com efetivo: status "-%" (sem base para o percentual) e vermelho', () => {
    const o = soma({ prev: 0, at: 2, any: true });
    const { total } = montarLinhas({ grupos: [], total: o });
    expect(total.status).toBe('-%');
    expect(total.corStatus).toBe('#b42318');
  });
});

describe('exportApropriacao: colunas e nomes', () => {
  it('toda coluna tem rótulo e as larguras fecham os 277 mm úteis do A4 paisagem', () => {
    expect(COLUNAS.every((c) => c.rotulo && c.id)).toBe(true);
    expect(COLUNAS.reduce((a, c) => a + c.larguraPdf, 0)).toBe(277);
  });

  it('título e subtítulo identificam obra, mês, quinzena, situação e busca', () => {
    const d = { obraNome: 'Maestro', obraCodigo: 'MAE', mesLabel: 'Out/2026', quinzena: 2, periodo: '16 a 31', situacao: 'Lançada', busca: '' };
    expect(titulo(d)).toBe('Apropriação de Efetivo · Maestro');
    expect(subtitulo(d)).toBe('Out/2026 · 2ª apropriação (16 a 31) · Lançada');
    expect(subtitulo({ ...d, busca: 'pedreiro' })).toBe('Out/2026 · 2ª apropriação (16 a 31) · Lançada · Busca: "pedreiro"');
    expect(titulo({ ...d, obraNome: '' })).toBe('Apropriação de Efetivo · MAE'); // sem nome, cai no código
  });

  it('nome do arquivo sem caracteres estranhos e com mês e quinzena', () => {
    expect(nomeArquivo({ obraCodigo: 'AAZ', ano: 2026, mes: 10, quinzena: 1 }, 'pdf')).toBe('apropriacao-efetivo-aaz-2026-10-1a.pdf');
    expect(nomeArquivo({ obraCodigo: 'Obra / Nº 7', ano: 2026, mes: 3, quinzena: 2 }, 'xlsx')).toBe('apropriacao-efetivo-obra-n-7-2026-03-2a.xlsx');
    expect(nomeArquivo({ obraCodigo: '', ano: 2026, mes: 3, quinzena: 2 }, 'xlsx')).toBe('apropriacao-efetivo-obra-2026-03-2a.xlsx');
  });
});

describe('exportApropriacao: zero some do arquivo', () => {
  it('grupo e total sem nenhum dado saem todos em branco (nada de linha de zeros)', () => {
    const vazio = soma({ prev: 0 });
    const { linhas, total } = montarLinhas({ grupos: [{ nome: 'Liderança de campo', rows: [], G: vazio }], total: vazio });
    for (const l of [linhas[0], total]) {
      expect(l).toMatchObject({ prev: null, totalEfetivo: null, trabAdm: null, canteiro: null, inssSeguro: null, ferias: null, emprestManut: null, recebido: null, ativos: null, saldo: null, status: '' });
    }
  });

  it('previsto 0 na linha da função fica em branco, mas o status continua dizendo o que é', () => {
    const f = { f: funcao('9', 'Vigia'), it: undefined, pv: 0, at: null, can: null, tot: null };
    const l = montarLinhas({ grupos: [{ nome: 'Apoio', rows: [f], G: soma() }], total: soma() }).linhas[1];
    expect(l.prev).toBeNull();
    expect(l.status).toBe('Pendente');
  });

  it('zero digitado nas colunas de quantidade também sai em branco; Ativos e Saldo mostram o 0', () => {
    const f = { f: funcao('8', 'Pintor'), it: item('8', { trabAdm: 0, inssSeguro: 0 }), pv: 3, at: 0, can: 0, tot: 0 };
    const l = montarLinhas({ grupos: [{ nome: 'Oficial', rows: [f], G: soma({ prev: 3, at: 0, any: true }) }], total: soma({ prev: 3, at: 0, any: true }) }).linhas[1];
    expect(l).toMatchObject({ prev: 3, totalEfetivo: null, trabAdm: null, canteiro: null, inssSeguro: null, ativos: 0, saldo: 3 });
  });

  it('grupo com dado: só as somas que deram zero somem; as com valor e o Ativos ficam', () => {
    const g = soma({ prev: 4, totalEfetivo: 6, trabAdm: 0, can: 6, ferias: 0, at: 6, any: true });
    const { linhas } = montarLinhas({ grupos: [{ nome: 'Oficial', rows: [], G: g }], total: g });
    expect(linhas[0]).toMatchObject({ prev: 4, totalEfetivo: 6, trabAdm: null, canteiro: 6, ferias: null, ativos: 6, saldo: -2 });
  });
});
