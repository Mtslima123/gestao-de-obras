import { describe, it, expect } from 'vitest';
import {
  fmt1, fmtSaldo, fmtMedia, n2, saldoComSinal, saldoAnalise, rotuloMes, dataBR, faixaDaQuinzena, textoDaQuinzena, somarQtd,
  CAMPOS_APROPRIACAO, valorDoCampo, patchDoCampo, idsNaOrdemDaTela, vizinhasDaFuncao,
  escalaDoGrafico, alturaPct, larguraDoGrafico, detalheProjecao, detalheEvolucao, legendaDoAcumulado, filtrarOpcoes, subtituloDoPainel,
} from '../modules/mobile/full/maoDeObra/maoDeObraMobilePure';
import { aplicarPatchItem } from '../modules/maoDeObra/efetivo/efetivoStore';

describe('números', () => {
  it('fmt1: até 1 casa, vírgula e milhar', () => {
    expect(fmt1(12.5)).toBe('12,5');
    expect(fmt1(12)).toBe('12');
    expect(fmt1(1234.56)).toBe('1.234,6');
  });
  it('fmtSaldo: negativo com sinal de menos; perto de zero não vira "−0"', () => {
    expect(fmtSaldo(-3)).toBe('−3');
    expect(fmtSaldo(-0.04)).toBe('0'); // arredonda para 0 e não ganha sinal
    expect(fmtSaldo(4.5)).toBe('4,5');
  });
  it('fmtMedia: "—" sem média; negativo com sinal', () => {
    expect(fmtMedia(null)).toBe('—');
    expect(fmtMedia(1.25)).toBe('1,3');
    expect(fmtMedia(-2)).toBe('−2');
    expect(fmtMedia(-0.04)).toBe('0'); // sem "−0"
  });
  it('n2 e saldoComSinal: 2 casas, sem 0,30000000000000004', () => {
    expect(n2(0.1 + 0.2)).toBe('0,3');
    expect(n2(2.5)).toBe('2,5');
    expect(saldoComSinal(5 - 2.5)).toBe('+2,5');
    expect(saldoComSinal(2.5 - 5)).toBe('−2,5');
    expect(saldoComSinal(0.001)).toBe('0');
  });
  it('saldoAnalise: ±0,05 é zero', () => {
    expect(saldoAnalise(0.05)).toBe('0');
    expect(saldoAnalise(-0.05)).toBe('0');
    expect(saldoAnalise(1)).toBe('+1');
    expect(saldoAnalise(-1.5)).toBe('−1,5');
  });
});

describe('datas e períodos', () => {
  it('rotuloMes: Set/26 vira Set/2026', () => {
    expect(rotuloMes({ label: 'Set/26' })).toBe('Set/2026');
  });
  it('dataBR não depende do fuso e ignora o que não é data', () => {
    expect(dataBR('2026-09-01')).toBe('01/09/2026');
    expect(dataBR('2026-12-31T23:59:59Z')).toBe('31/12/2026');
    expect(dataBR('')).toBe('');
    expect(dataBR(null)).toBe('');
    expect(dataBR('lixo')).toBe('');
  });
  it('faixa da quinzena: 1ª até o dia 15, 2ª do 16 ao último dia', () => {
    expect(faixaDaQuinzena(1, 30)).toBe('01 a 15');
    expect(faixaDaQuinzena(2, 28)).toBe('16 a 28');
  });
  it('texto da quinzena: lançada com autor, lançada sem autor, ou data de referência', () => {
    const base = { n: 2, ano: 2026, mes: 3 };
    expect(textoDaQuinzena({ ...base, lancadaEm: '2026-03-20T15:00:00Z', lancadaPor: 'Ana' })).toBe('Lançada em 20/03/2026 por Ana');
    expect(textoDaQuinzena({ ...base, lancadaEm: '2026-03-20T15:00:00Z' })).toBe('Lançada em 20/03/2026');
    expect(textoDaQuinzena({ ...base, lancadaEm: null })).toBe('Data de referência 16/03/2026');
    expect(textoDaQuinzena({ n: 1, ano: 2026, mes: 11 })).toBe('Data de referência 01/11/2026');
  });
});

describe('somarQtd (botões − e + do Previsto)', () => {
  it('soma e subtrai de 1 em 1', () => {
    expect(somarQtd(2, 1)).toBe(3);
    expect(somarQtd(2, -1)).toBe(1);
  });
  it('nunca fica negativa', () => {
    expect(somarQtd(0, -1)).toBe(0);
    expect(somarQtd(0.5, -1)).toBe(0);
  });
  it('quebrado fica com 2 casas', () => {
    expect(somarQtd(2.5, 1)).toBe(3.5);
    expect(somarQtd(0.1, 0.2)).toBe(0.3);
  });
  it('vazio ou inválido conta como 0', () => {
    expect(somarQtd(undefined, 1)).toBe(1);
    expect(somarQtd('', 1)).toBe(1);
    expect(somarQtd('abc', 1)).toBe(1);
  });
});

describe('campos da folha da Apropriação', () => {
  it('são os mesmos 8 campos da tabela do desktop, sem repetir', () => {
    const chaves = CAMPOS_APROPRIACAO.map((c) => c.chave);
    expect(chaves).toEqual(['trabAdm', 'canteiro', 'inssSeguro', 'ferias', 'emprestManut', 'recebidoOutraObra', 'destino', 'origem']);
    expect(new Set(chaves).size).toBe(chaves.length);
  });
  it('só Destino e Origem são texto', () => {
    expect(CAMPOS_APROPRIACAO.filter((c) => c.tipo === 'texto').map((c) => c.chave)).toEqual(['destino', 'origem']);
  });
  it('valorDoCampo: o canteiro vem do valor calculado, o resto do item', () => {
    const item = { trabAdm: 2, ferias: 1 };
    expect(valorDoCampo(item, 'canteiro', 5)).toBe(5);
    expect(valorDoCampo(item, 'trabAdm', 5)).toBe(2);
    expect(valorDoCampo(undefined, 'ferias', null)).toBeUndefined();
  });
  it('patchDoCampo numérico: vazio = null, inteiro >= 0, lixo vira 0', () => {
    const c = CAMPOS_APROPRIACAO.find((x) => x.chave === 'ferias');
    expect(patchDoCampo(c, '')).toEqual({ ferias: null });
    expect(patchDoCampo(c, '3')).toEqual({ ferias: 3 });
    expect(patchDoCampo(c, '-4')).toEqual({ ferias: 0 });
    expect(patchDoCampo(c, '2,7')).toEqual({ ferias: 2 });
    expect(patchDoCampo(c, 'x')).toEqual({ ferias: 0 });
  });
  it('patchDoCampo de texto: vazio = null', () => {
    const c = CAMPOS_APROPRIACAO.find((x) => x.chave === 'destino');
    expect(patchDoCampo(c, 'Obra Maestro')).toEqual({ destino: 'Obra Maestro' });
    expect(patchDoCampo(c, '')).toEqual({ destino: null });
  });
  it('o patch do canteiro vira o total efetivo pelo mesmo aplicarPatchItem do desktop', () => {
    const canteiro = CAMPOS_APROPRIACAO.find((x) => x.chave === 'canteiro');
    const base = { funcaoId: '1', totalEfetivo: null, trabAdm: 2, inssSeguro: null, ferias: null, emprestManut: null };
    expect(aplicarPatchItem(base, patchDoCampo(canteiro, '5')).totalEfetivo).toBe(7); // 5 no canteiro + 2 na ADM
  });
});

describe('vizinhas da função na folha', () => {
  const grupos = [
    { rows: [{ f: { id: 'a' } }, { f: { id: 'b' } }] },
    { rows: [{ f: { id: 'c' } }] },
    { rows: [] },
    { rows: [{ f: { id: 'd' } }] },
  ];
  it('ordem plana, grupo a grupo', () => {
    expect(idsNaOrdemDaTela(grupos)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('atravessa os grupos', () => {
    const ids = idsNaOrdemDaTela(grupos);
    expect(vizinhasDaFuncao(ids, 'b')).toEqual({ posicao: 2, total: 4, anterior: 'a', proxima: 'c' });
  });
  it('na ponta não há anterior ou próxima', () => {
    const ids = idsNaOrdemDaTela(grupos);
    expect(vizinhasDaFuncao(ids, 'a').anterior).toBeNull();
    expect(vizinhasDaFuncao(ids, 'd').proxima).toBeNull();
  });
  it('função fora da lista (a busca a escondeu): sem vizinhas e posição 0', () => {
    expect(vizinhasDaFuncao(['a', 'b'], 'z')).toEqual({ posicao: 0, total: 2, anterior: null, proxima: null });
  });
  it('lista vazia não quebra', () => {
    expect(idsNaOrdemDaTela([])).toEqual([]);
    expect(vizinhasDaFuncao([], 'a').total).toBe(0);
  });
});

describe('gráficos da Análise', () => {
  it('escala: nunca menos que 1, com folga', () => {
    expect(escalaDoGrafico([])).toBe(1);
    expect(escalaDoGrafico([0, 0])).toBe(1);
    expect(escalaDoGrafico([4, 10, 7])).toBe(10);
    expect(escalaDoGrafico([10], 1.12)).toBeCloseTo(11.2);
  });
  it('altura em %, presa entre 0 e 100', () => {
    expect(alturaPct(5, 10)).toBe(50);
    expect(alturaPct(20, 10)).toBe(100);
    expect(alturaPct(-1, 10)).toBe(0);
    expect(alturaPct(5, 0)).toBe(0);
  });
  it('largura = meses × fatia', () => {
    expect(larguraDoGrafico(12, 44)).toBe(528);
    expect(larguraDoGrafico(0, 44)).toBe(0);
  });
  it('detalhe da projeção diz se é realizado ou projeção', () => {
    expect(detalheProjecao({ m: { label: 'Mar/26' }, past: true, v: 12, prev: 10 })).toBe('Mar/26: realizado 12 · previsto 10');
    expect(detalheProjecao({ m: { label: 'Abr/26' }, past: false, v: 3.25, prev: 4 })).toBe('Abr/26: projeção 3,3 · previsto 4');
  });
  it('detalhe da evolução', () => {
    expect(detalheEvolucao({ m: { label: 'Mar/26' }, p: 10, e: 8 })).toBe('Mar/26: previsto 10, efetivo 8');
  });
  it('previsto quebrado sai com vírgula nos dois detalhes', () => {
    expect(detalheEvolucao({ m: { label: 'Mai/26' }, p: 38.5, e: 36 })).toBe('Mai/26: previsto 38,5, efetivo 36');
    expect(detalheProjecao({ m: { label: 'Mai/26' }, past: true, v: 9, prev: 2.5 })).toBe('Mai/26: realizado 9 · previsto 2,5');
  });
  it('legenda do saldo acumulado', () => {
    expect(legendaDoAcumulado(null)).toBe('');
    expect(legendaDoAcumulado(2)).toBe('não utilizado');
    expect(legendaDoAcumulado(-2)).toBe('excedido');
    expect(legendaDoAcumulado(0.02)).toBe('zerado');
  });
  it('busca do seletor: ignora caixa e espaços, mantém a ordem; vazio devolve tudo', () => {
    const o = ['Todos', 'Carpinteiro', 'Armador', 'Servente'];
    expect(filtrarOpcoes(o, '  CARP ')).toEqual(['Carpinteiro']);
    expect(filtrarOpcoes(o, 'r')).toEqual(['Carpinteiro', 'Armador', 'Servente']);
    expect(filtrarOpcoes(o, '')).toBe(o);
    expect(filtrarOpcoes(o, 'zzz')).toEqual([]);
  });
});

describe('subtítulo do Painel', () => {
  it('carregando', () => {
    expect(subtituloDoPainel({ carregando: true, doPeriodo: 0, completas: 0, fora: 0 })).toBe('Carregando...');
  });
  it('nenhuma obra no período', () => {
    expect(subtituloDoPainel({ carregando: false, doPeriodo: 0, completas: 0, fora: 2 })).toBe('Nenhuma obra com este mês no período.');
  });
  it('singular e plural, com e sem obras fora do período', () => {
    expect(subtituloDoPainel({ carregando: false, doPeriodo: 1, completas: 1, fora: 0 })).toBe('1 de 1 obra com as duas apropriações lançadas');
    expect(subtituloDoPainel({ carregando: false, doPeriodo: 5, completas: 2, fora: 3 })).toBe('2 de 5 obras com as duas apropriações lançadas · 3 fora do período');
  });
});
