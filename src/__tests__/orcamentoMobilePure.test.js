// Composição do orçamento na casca mobile (modules/mobile/full/orcamentos/orcamentoMobilePure): níveis pelo código,
// código de item novo, resumo, números digitados e as mudanças que uma edição gera.
import { describe, it, expect } from 'vitest';
import {
  nivelDoCodigo, podeInserirAcima, podeInserirSubitem, proximoCodigoIrmao, codigoDoNovoItem, resumoDoOrcamento,
  subtituloDaComposicao, parseNumero, numeroValido, numeroParaCampo, formatarNumero, valoresIniciaisDoItem, validarItem,
  alteracoesDoItem, motivoDeNaoExcluir, paginaDeItens, rotuloDoItem, idDoItemInserido,
} from '../modules/mobile/full/orcamentos/orcamentoMobilePure';

const it_ = (codigo, extra = {}) => ({ id: 'id-' + codigo, codigo, nome: 'Item ' + codigo, quantidade: 0, unidade: 'UN', valor_unitario: 0, valor_total: 0, ...extra });

describe('níveis pelo código', () => {
  it('conta os pontos', () => {
    expect(nivelDoCodigo('001')).toBe(0);
    expect(nivelDoCodigo('001.02')).toBe(1);
    expect(nivelDoCodigo('001.02.03.04')).toBe(3);
    expect(nivelDoCodigo('')).toBe(0);
    expect(nivelDoCodigo(undefined)).toBe(0);
  });
  it('inserir acima só fora da raiz; subitem só até o nível 3', () => {
    expect(podeInserirAcima(it_('001'))).toBe(false);
    expect(podeInserirAcima(it_('001.01'))).toBe(true);
    expect(podeInserirSubitem(it_('001.01.01'))).toBe(true);
    expect(podeInserirSubitem(it_('001.01.01.01'))).toBe(false);
  });
});

describe('código de item novo', () => {
  it('irmão: maior número + 1, com a largura do trecho', () => {
    const lista = [it_('001'), it_('001.01'), it_('001.02'), it_('001.10')];
    expect(proximoCodigoIrmao('001.01', lista)).toBe('001.11');
    expect(proximoCodigoIrmao('001', [it_('001'), it_('002')])).toBe('003');
    expect(proximoCodigoIrmao('009', [it_('009')])).toBe('010');
  });
  it('irmão de outro pai não conta', () => {
    const lista = [it_('001.01'), it_('002.05')];
    expect(proximoCodigoIrmao('001.01', lista)).toBe('001.02');
  });
  it('botão "Novo item": 001 na lista vazia', () => {
    expect(codigoDoNovoItem([])).toBe('001');
  });
  it('só a raiz: abre o primeiro nível 1', () => {
    expect(codigoDoNovoItem([it_('001')])).toBe('001.01');
    expect(codigoDoNovoItem([it_('002')])).toBe('002.01');
  });
  it('com nível 1: o seguinte ao de maior número', () => {
    expect(codigoDoNovoItem([it_('001'), it_('001.01'), it_('001.02'), it_('001.02.01')])).toBe('001.03');
  });
  it('só itens de nível 1 sem raiz: segue o maior', () => {
    expect(codigoDoNovoItem([it_('002.05')])).toBe('002.06');
  });
});

describe('resumo', () => {
  const withTotals = [
    it_('001', { valor_total: 300 }), it_('001.01', { valor_total: 100 }), it_('001.02', { valor_total: 200 }),
    it_('002', { valor_total: 50 }),
  ];
  const parentSet = new Set(['001']);
  it('total pelos itens de nível 0; folhas e vínculos pelas folhas', () => {
    const r = resumoDoOrcamento({ withTotals, parentSet, vinculadoSet: new Set(['id-001.01']), totalItens: 4 });
    expect(r.grandTotal).toBe(350);
    expect(r.folhas).toBe(3);
    expect(r.totalItens).toBe(4);
    expect(r.vinculados).toEqual({ n: 1, valor: 100 });
    expect(r.naoVinculados).toEqual({ n: 2, valor: 250 });
  });
  it('vinculados mais não vinculados fecham com as folhas e o valor das folhas', () => {
    const r = resumoDoOrcamento({ withTotals, parentSet, vinculadoSet: new Set(['id-001.02']) });
    expect(r.vinculados.n + r.naoVinculados.n).toBe(r.folhas);
    expect(r.vinculados.valor + r.naoVinculados.valor).toBe(350);
  });
  it('item-resumo vinculado por engano não conta como folha', () => {
    const r = resumoDoOrcamento({ withTotals, parentSet, vinculadoSet: new Set(['id-001']) });
    expect(r.vinculados.n).toBe(0);
  });
  it('sem itens tudo zero', () => {
    const r = resumoDoOrcamento({});
    expect(r.grandTotal).toBe(0);
    expect(r.folhas).toBe(0);
  });
  it('subtítulo da composição', () => {
    expect(subtituloDaComposicao({ totalItens: 0 })).toBe('Nenhum item. Toque em "Novo item" para adicionar.');
    expect(subtituloDaComposicao({ totalItens: 40 })).toBe('40 itens');
    expect(subtituloDaComposicao({ totalItens: 40, folhasVisiveis: 3, folhasTotal: 30, filtrando: true })).toBe('3 de 30 itens');
  });
});

describe('números digitados', () => {
  it('formatos brasileiros', () => {
    expect(parseNumero('1.234,56')).toBe(1234.56);
    expect(parseNumero('1234,56')).toBe(1234.56);
    expect(parseNumero('12,5')).toBe(12.5);
    expect(parseNumero('0,5')).toBe(0.5);
    expect(parseNumero('1.234.567,89')).toBe(1234567.89);
    expect(parseNumero('1500')).toBe(1500);
  });
  it('ponto: milhar com 3 casas, decimal com 1 ou 2', () => {
    expect(parseNumero('1.500')).toBe(1500);
    expect(parseNumero('12.5')).toBe(12.5);
    expect(parseNumero('12.50')).toBe(12.5);
  });
  it('vazio e lixo valem zero', () => {
    expect(parseNumero('')).toBe(0);
    expect(parseNumero(null)).toBe(0);
    expect(parseNumero('abc')).toBe(0);
  });
  it('validação: só dígitos com ponto ou vírgula; sem sinal nem letra', () => {
    ['', '12', '1.234,56', '12,5', '0'].forEach(s => expect(numeroValido(s)).toBe(true));
    ['-5', 'abc', '12a', '1,2,x', ',5'].forEach(s => expect(numeroValido(s)).toBe(false));
  });
  it('campo de edição: vírgula decimal; zero fica vazio', () => {
    expect(numeroParaCampo(12.5)).toBe('12,5');
    expect(numeroParaCampo(1000)).toBe('1000');
    expect(numeroParaCampo(0)).toBe('');
    expect(numeroParaCampo(null)).toBe('');
  });
  it('formatação pt-BR', () => {
    expect(formatarNumero(1234.5)).toBe('1.234,50');
    expect(formatarNumero(null)).toBe('0,00');
    expect(formatarNumero(3, 0)).toBe('3');
  });
});

describe('edição de um item', () => {
  const item = it_('001.01.01', { nome: 'Alvenaria', quantidade: 10, unidade: 'M2', valor_unitario: 55.5 });
  it('valores iniciais em texto de campo', () => {
    expect(valoresIniciaisDoItem(item)).toEqual({ nome: 'Alvenaria', quantidade: '10', unidade: 'M2', valor_unitario: '55,5' });
    expect(valoresIniciaisDoItem(it_('001', { nome: '', quantidade: 0, unidade: undefined, valor_unitario: 0 }))).toEqual({ nome: '', quantidade: '', unidade: '', valor_unitario: '' });
  });
  it('nada mudou, nada a aplicar', () => {
    expect(alteracoesDoItem(item, valoresIniciaisDoItem(item), false)).toEqual([]);
  });
  it('gera só os campos diferentes, com os tipos do editCell', () => {
    const v = { ...valoresIniciaisDoItem(item), nome: 'Alvenaria de vedação', quantidade: '12,5', valor_unitario: '1.000' };
    expect(alteracoesDoItem(item, v, false)).toEqual([
      { campo: 'nome', valor: 'Alvenaria de vedação' },
      { campo: 'quantidade', valor: 12.5 },
      { campo: 'valor_unitario', valor: 1000 },
    ]);
  });
  it('unidade em maiúsculas, até 8 letras', () => {
    const v = { ...valoresIniciaisDoItem(item), unidade: 'm3 extenso demais' };
    expect(alteracoesDoItem(item, v, false)).toEqual([{ campo: 'unidade', valor: 'M3 EXTEN' }]);
  });
  it('número nunca fica negativo', () => {
    const v = { ...valoresIniciaisDoItem(item), quantidade: '-3' };
    expect(alteracoesDoItem(item, v, false)).toEqual([{ campo: 'quantidade', valor: 0 }]);
  });
  it('grupo só muda o nome', () => {
    const grupo = it_('001', { nome: 'Serviços', quantidade: 0 });
    const v = { nome: 'Serviços iniciais', quantidade: '5', unidade: 'X', valor_unitario: '9' };
    expect(alteracoesDoItem(grupo, v, true)).toEqual([{ campo: 'nome', valor: 'Serviços iniciais' }]);
  });
  it('validação: número com sinal ou letra é recusado; grupo não valida números', () => {
    expect(validarItem({ quantidade: '-1', valor_unitario: '2' }, false)).toEqual({ quantidade: 'Use só números, sem sinal.' });
    expect(validarItem({ quantidade: '1', valor_unitario: 'abc' }, false)).toEqual({ valor_unitario: 'Use só números, sem sinal.' });
    expect(validarItem({ quantidade: '1', valor_unitario: '2' }, false)).toEqual({});
    expect(validarItem({ quantidade: '-1', valor_unitario: 'x' }, true)).toEqual({});
  });
  it('exclusão protegida por vínculo', () => {
    expect(motivoDeNaoExcluir(item, new Set(['001.01.01']))).toMatch(/vinculado/);
    expect(motivoDeNaoExcluir(item, new Set(['002']))).toBeNull();
    expect(motivoDeNaoExcluir(item)).toBeNull();
  });
});

describe('lista', () => {
  it('página: o limite e quantos faltam', () => {
    const lista = Array.from({ length: 250 }, (_, i) => it_(String(i + 1).padStart(3, '0')));
    const p = paginaDeItens(lista, 100);
    expect(p.itens).toHaveLength(100);
    expect(p.restantes).toBe(150);
    expect(paginaDeItens(lista.slice(0, 5), 100)).toEqual({ itens: lista.slice(0, 5), restantes: 0 });
  });
  it('rótulo sem traço sobrando quando o nome está vazio', () => {
    expect(rotuloDoItem(it_('001', { nome: 'Serviços' }))).toBe('001 · Serviços');
    expect(rotuloDoItem(it_('001.05', { nome: '' }))).toBe('001.05');
  });
  it('item inserido: o que não existia antes', () => {
    const antes = new Set(['id-001', 'id-001.01']);
    expect(idDoItemInserido(antes, [it_('001'), it_('001.01'), { ...it_('001.02'), id: 'tmp-abc' }])).toBe('tmp-abc');
    expect(idDoItemInserido(antes, [it_('001'), it_('001.01')])).toBeNull();
  });
});
