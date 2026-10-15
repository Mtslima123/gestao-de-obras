import { describe, it, expect } from 'vitest';
import { CAB_EFETIVO, CAB_PREVISTO, linhasModeloEfetivo, linhasModeloPrevisto, nomeModeloEfetivo, nomeModeloPrevisto } from '../modules/maoDeObra/efetivo/modeloXlsx';
import { avisosDeContexto, lerPlanilhaEfetivo, lerPlanilhaPrevisto } from '../modules/maoDeObra/efetivo/importXlsxPure';

const F = (id, nome, grupoId, extra = {}) => ({ id, nome, grupoId, classificacao: null, ativo: true, ...extra });
const funcoes = [
  F('1', 'Almoxarife', 'ADM_TEC'), F('2', 'Técnico de Segurança do Trabalho', 'ADM_TEC'),
  F('3', 'Carpinteiro', 'OFICIAL'), F('4', 'Pedreiro', 'OFICIAL'),
  F('5', 'Servente', 'SERVENTE'), F('6', 'Vigia', 'APOIO', { ativo: false }), // inativa: fica de fora
];
const item = (funcaoId, c) => ({ apropriacaoId: 'a', funcaoId, totalEfetivo: null, trabAdm: null, inssSeguro: null, ferias: null, emprestManut: null, destino: null, recebidoOutraObra: null, origem: null, ...c });

describe('modelo do previsto: ida e volta com o leitor real', () => {
  const previsto = [
    { obraId: 'O1', funcaoId: '3', qtdMes: 2.5, inicio: '2026-03-01', termino: '2027-06-30' },
    { obraId: 'O1', funcaoId: '5', qtdMes: 8, inicio: '2026-01-01', termino: '2027-12-31' },
  ];
  const m = linhasModeloPrevisto({ funcoes, previsto });

  it('cabeçalho no formato do leitor e título de grupo só para grupos com função ativa', () => {
    expect(m.linhas[m.linhaCabecalho]).toEqual(CAB_PREVISTO);
    expect(m.linhasGrupo.map((i) => m.linhas[i][0])).toEqual(['Administrativo e técnico', 'Oficial', 'Servente']);
    expect(m.linhas.flat().includes('Vigia')).toBe(false);
  });

  it('o leitor devolve exatamente o que veio preenchido, sem avisos nem funções não encontradas', () => {
    const r = lerPlanilhaPrevisto(m.linhas, funcoes, { inicio: '2026-01-01', termino: '2027-12-31' });
    expect(r.erro).toBeUndefined();
    expect(r.itens).toEqual([
      { funcaoId: '3', qtdMes: 2.5, inicio: '2026-03-01', termino: '2027-06-30' },
      { funcaoId: '5', qtdMes: 8, inicio: '2026-01-01', termino: '2027-12-31' },
    ]);
    expect(r.naoEncontradas).toEqual([]);
    expect(r.invalidas).toEqual([]);
    expect(r.avisos).toEqual([]);
  });

  it('linhas em branco (sem previsto) são ignoradas, não viram erro', () => {
    const r = lerPlanilhaPrevisto(m.linhas, funcoes, {});
    expect(r.itens.map((i) => i.funcaoId)).toEqual(['3', '5']);
  });

  it('modelo vazio (obra sem previsto) é aceito como arquivo, e o leitor só avisa que nada foi preenchido', () => {
    const vazio = linhasModeloPrevisto({ funcoes, previsto: [] });
    expect(vazio.linhas.filter((l, i) => i > vazio.linhaCabecalho && !vazio.linhasGrupo.includes(i)).every((l) => l.slice(1).every((v) => v == null))).toBe(true);
    expect(lerPlanilhaPrevisto(vazio.linhas, funcoes, {}).erro).toMatch(/Nenhuma função válida/);
  });

  it('completar o modelo (qtd na linha em branco) vira item, com as datas da obra como padrão', () => {
    const vazio = linhasModeloPrevisto({ funcoes, previsto: [] });
    const linhas = vazio.linhas.map((l) => (l[0] === 'Pedreiro' ? ['Pedreiro', 4, null, null] : l));
    const r = lerPlanilhaPrevisto(linhas, funcoes, { inicio: '2026-09-16', termino: '2028-06-30' });
    expect(r.itens).toEqual([{ funcaoId: '4', qtdMes: 4, inicio: '2026-09-16', termino: '2028-06-30' }]);
  });
});

describe('modelo da apropriação: ida e volta com o leitor real', () => {
  const apropriacao = {
    itens: [
      item('1', { totalEfetivo: 3, trabAdm: 1, destino: 'Obra B' }),
      item('3', { totalEfetivo: 12, trabAdm: 2, inssSeguro: 1, ferias: 1, emprestManut: 2, recebidoOutraObra: 4, origem: 'Obra C' }),
    ],
  };
  const dados = { funcoes, apropriacao, obraNome: 'Pulse', obraCodigo: 'SMK', ano: 2026, mes: 10, quinzena: 2 };
  const m = linhasModeloEfetivo(dados);

  it('cabeçalho de 11 colunas no formato do leitor, com OBRA e DATA acima', () => {
    expect(m.linhas[m.linhaCabecalho]).toEqual(CAB_EFETIVO);
    expect(m.linhas.find((l) => l[0] === 'OBRA')).toEqual(['OBRA', 'Pulse']);
    expect(m.linhas.find((l) => l[0] === 'DATA')).toEqual(['DATA', '16/10/2026']); // 2ª quinzena = dia 16
    expect(linhasModeloEfetivo({ ...dados, quinzena: 1 }).linhas.find((l) => l[0] === 'DATA')[1]).toBe('01/10/2026');
  });

  it('o leitor devolve os itens preenchidos, iguais ao rascunho, sem avisos, divergências nem não encontradas', () => {
    const r = lerPlanilhaEfetivo(m.linhas, funcoes);
    expect(r.erro).toBeUndefined();
    expect(r.itens).toHaveLength(2);
    expect(r.itens.find((i) => i.funcaoId === '1')).toMatchObject({ totalEfetivo: 3, trabAdm: 1, inssSeguro: null, destino: 'Obra B', origem: null });
    expect(r.itens.find((i) => i.funcaoId === '3')).toMatchObject({ totalEfetivo: 12, trabAdm: 2, inssSeguro: 1, ferias: 1, emprestManut: 2, recebidoOutraObra: 4, origem: 'Obra C' });
    expect(r.naoEncontradas).toEqual([]);
    expect(r.divergencias).toEqual([]);
    expect(r.avisos).toEqual([]);
  });

  it('DATA e OBRA do modelo batem com a tela de origem (nenhum aviso de contexto)', () => {
    const r = lerPlanilhaEfetivo(m.linhas, funcoes);
    expect(r.cabecalho).toEqual({ data: '2026-10-16', obra: 'Pulse' });
    expect(avisosDeContexto(r.cabecalho, { obraCodigo: 'SMK', obraNome: 'Pulse', ano: 2026, mes: 10, quinzena: 2 })).toEqual([]);
    // importar na 1ª quinzena: o aviso de contexto aparece (só avisa)
    expect(avisosDeContexto(r.cabecalho, { obraCodigo: 'SMK', obraNome: 'Pulse', ano: 2026, mes: 10, quinzena: 1 })).toHaveLength(1);
  });

  it('sem apropriação ainda: só o cabeçalho e as funções; completar uma linha funciona', () => {
    const vazio = linhasModeloEfetivo({ ...dados, apropriacao: undefined });
    const linhas = vazio.linhas.map((l) => (l[0] === 'Servente' ? ['Servente', 5, 5, null, null, null, null, null, null, null, null] : l));
    const r = lerPlanilhaEfetivo(linhas, funcoes);
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0]).toMatchObject({ funcaoId: '5', totalEfetivo: 5, trabAdm: 5 });
    expect(r.naoEncontradas).toEqual([]);
  });

  it('nome da obra cai no código quando não há nome', () => {
    expect(linhasModeloEfetivo({ ...dados, obraNome: '' }).linhas.find((l) => l[0] === 'OBRA')[1]).toBe('SMK');
  });
});

describe('modelo: nomes de arquivo', () => {
  it('sem caracteres estranhos, com mês e quinzena no da apropriação', () => {
    expect(nomeModeloPrevisto({ obraCodigo: 'SMK' })).toBe('modelo-previsto-smk.xlsx');
    expect(nomeModeloEfetivo({ obraCodigo: 'Obra / Nº 7', ano: 2026, mes: 3, quinzena: 2 })).toBe('modelo-apropriacao-obra-n-7-2026-03-2a.xlsx');
    expect(nomeModeloEfetivo({ obraCodigo: '', ano: 2026, mes: 10, quinzena: 1 })).toBe('modelo-apropriacao-obra-2026-10-1a.xlsx');
  });
});
