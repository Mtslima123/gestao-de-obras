// Orçamento × Cronograma na casca mobile (modules/mobile/full/orcamentos/vinculosMobilePure): itens-resumo, seleção,
// busca de tarefa e resumo por tarefa, com as mesmas regras do desktop.
import { describe, it, expect } from 'vitest';
import {
  valorDoItem, normalizar, idsDeResumo, valorDoGrupoMap, itensDoSeletor, estadoDoItem, totalDosSelecionados,
  rotuloDaTarefa, nomeDoPai, filtrarTarefas, nivelDaTarefa, totalDosVinculos, resumoPorTarefa, filtrarResumo, plural,
  textoDaSelecao, textoDoBotaoAdicionar,
} from '../modules/mobile/full/orcamentos/vinculosMobilePure';

const item = (id, codigo, nome, q = 0, vu = 0, extra = {}) => ({ id, codigo, nome, quantidade: q, valor_unitario: vu, valor_total: 0, ...extra });
// 001 (resumo) > 001.01 (resumo) > 001.01.01, 001.01.02 ; 001.02 ; 002 (folha)
const itens = [
  item(1, '001', 'Serviços preliminares'), item(2, '001.01', 'Projetos'),
  item(3, '001.01.01', 'Projeto de arquitetura', 1, 15000), item(4, '001.01.02', 'Projeto estrutural', 1, 12000),
  item(5, '001.02', 'Alvará', 1, 3000), item(6, '002', 'Fundação', 10, 500),
];
const resumoIds = idsDeResumo(itens);

describe('valor e texto', () => {
  it('valor_total manda; senão quantidade x valor unitário', () => {
    expect(valorDoItem({ valor_total: 99, quantidade: 2, valor_unitario: 5 })).toBe(99);
    expect(valorDoItem({ valor_total: 0, quantidade: 2, valor_unitario: 5 })).toBe(10);
    expect(valorDoItem(null)).toBe(0);
    expect(valorDoItem({})).toBe(0);
  });
  it('normalizar tira acento e caixa', () => {
    expect(normalizar('FUNDAÇÃO')).toBe('fundacao');
    expect(normalizar(null)).toBe('');
  });
});

describe('itens-resumo', () => {
  it('quem tem código-prefixo de outro é resumo', () => {
    expect([...resumoIds].sort()).toEqual([1, 2]);
  });
  it('o valor do resumo é a soma das folhas de toda a subárvore, sem contar em dobro', () => {
    const m = valorDoGrupoMap(itens, resumoIds);
    expect(m['001']).toBe(30000);
    expect(m['001.01']).toBe(27000);
    expect(m['001.02']).toBeUndefined();
    expect(m['002']).toBeUndefined();
  });
  it('resumo com valor próprio não entra na soma', () => {
    const comValor = [...itens.slice(0, 5), item(7, '001.03', 'x', 1, 1), { ...itens[1], valor_total: 777 }];
    const m = valorDoGrupoMap(comValor.filter((v, i, a) => a.findIndex(o => o.id === v.id) === i), idsDeResumo(comValor));
    expect(m['001']).toBeLessThan(40000);
  });
});

describe('lista do seletor', () => {
  it('sem busca: só os que ainda não têm vínculo', () => {
    const r = itensDoSeletor({ itens, itensVinculadosIds: new Set([3]), busca: '' });
    expect(r.map(i => i.id)).toEqual([1, 2, 4, 5, 6]);
  });
  it('busca pelo nome do resumo traz as filhas e o contexto', () => {
    const r = itensDoSeletor({ itens, itensVinculadosIds: new Set(), busca: 'projetos' });
    expect(r.map(i => i.id)).toEqual([1, 2, 3, 4]);
  });
  it('busca pela filha traz o resumo como contexto, mas não os irmãos', () => {
    const r = itensDoSeletor({ itens, itensVinculadosIds: new Set(), busca: 'estrutural' });
    expect(r.map(i => i.id)).toEqual([1, 2, 4]);
  });
  it('pai já vinculado continua puxando as filhas livres', () => {
    const r = itensDoSeletor({ itens, itensVinculadosIds: new Set([2]), busca: 'projetos' });
    expect(r.map(i => i.id)).toEqual([1, 3, 4]);
  });
});

describe('seleção', () => {
  const base = { resumoIds, valorGrupoMap: valorDoGrupoMap(itens, resumoIds) };
  const lista = itensDoSeletor({ itens, itensVinculadosIds: new Set(), busca: '' });
  it('item comum: marcado se está na seleção (ids em texto)', () => {
    expect(estadoDoItem(itens[2], { ...base, lista, selItens: ['3'] })).toMatchObject({ resumo: false, marcado: true, valor: 15000 });
    expect(estadoDoItem(itens[2], { ...base, lista, selItens: [] }).marcado).toBe(false);
  });
  it('resumo: nenhuma, parte e todas as folhas visíveis marcadas', () => {
    const r0 = estadoDoItem(itens[1], { ...base, lista, selItens: [] });
    expect(r0).toMatchObject({ resumo: true, marcado: false, parcial: false, inerte: false, valor: 27000 });
    expect(r0.folhas.map(f => f.id)).toEqual([3, 4]);
    expect(estadoDoItem(itens[1], { ...base, lista, selItens: ['3'] })).toMatchObject({ marcado: false, parcial: true });
    expect(estadoDoItem(itens[1], { ...base, lista, selItens: ['3', '4'] })).toMatchObject({ marcado: true, parcial: false });
  });
  it('resumo do topo pega as folhas de qualquer profundidade, pulando o sub-resumo', () => {
    const r = estadoDoItem(itens[0], { ...base, lista, selItens: [] });
    expect(r.folhas.map(f => f.id)).toEqual([3, 4, 5]);
  });
  it('resumo sem folha visível fica inerte', () => {
    const soResumos = itens.filter(i => i.id <= 2);
    expect(estadoDoItem(itens[1], { ...base, lista: soResumos, selItens: [] })).toMatchObject({ inerte: true, marcado: false });
  });
  it('só o que está na lista visível é marcado (busca estreita a seleção em massa)', () => {
    const estreita = itensDoSeletor({ itens, itensVinculadosIds: new Set(), busca: 'estrutural' });
    expect(estadoDoItem(itens[1], { ...base, lista: estreita, selItens: [] }).folhas.map(f => f.id)).toEqual([4]);
  });
  it('total dos selecionados', () => {
    expect(totalDosSelecionados(itens, ['3', '5'])).toBe(18000);
    expect(totalDosSelecionados(itens, [])).toBe(0);
    expect(totalDosSelecionados(itens, ['999'])).toBe(0);
  });
});

describe('tarefas do cronograma', () => {
  const etapas = [
    { id: 'G1', etapa: 'Fundação', nivel: 0, isGroup: true, parentId: null },
    { id: 'T1', etapa: 'Escavação', nivel: 1, isGroup: false, parentId: 'G1' },
    { id: 'T2', etapa: 'Alvenaria estrutural', nivel: 1, isGroup: false, parentId: 'G1' },
  ];
  const nums = { G1: 1, T1: 2, T2: 3 };
  it('busca sem acento por nome e por número da linha', () => {
    expect(filtrarTarefas(etapas, 'fundacao', nums).map(e => e.id)).toEqual(['G1']);
    expect(filtrarTarefas(etapas, '3', nums).map(e => e.id)).toEqual(['T2']);
    expect(filtrarTarefas(etapas, '', nums)).toBe(etapas);
    expect(filtrarTarefas(etapas, 'zzz', nums)).toEqual([]);
  });
  it('rótulo, pai e nível', () => {
    expect(rotuloDaTarefa(etapas[1], nums)).toBe('2  Escavação');
    expect(rotuloDaTarefa({ id: 'X', etapa: 'Sem número' }, {})).toBe('X  Sem número');
    expect(nomeDoPai(etapas[1], etapas)).toBe('Fundação');
    expect(nomeDoPai(etapas[0], etapas)).toBe('');
    expect(nivelDaTarefa(etapas[0])).toBe('Grupo');
    expect(nivelDaTarefa(etapas[1])).toBe('N1');
  });
});

describe('vínculos e resumo por tarefa', () => {
  const etapas = [{ id: 'G1', etapa: 'Fundação' }, { id: 'T1', etapa: 'Escavação' }, { id: 'T2', etapa: 'Alvenaria' }];
  const v = (id, etapaId, it) => ({ id, etapa_id: etapaId, orcamento_itens: it });
  const vinculos = [v('a', 'T2', itens[2]), v('b', 'T2', itens[3]), v('c', 'G1', itens[4]), v('d', 'SUMIU', itens[5])];
  it('total dos vínculos', () => {
    expect(totalDosVinculos(vinculos)).toBe(15000 + 12000 + 3000 + 5000);
    expect(totalDosVinculos([])).toBe(0);
    expect(totalDosVinculos([v('x', 'T1', null)])).toBe(0);
  });
  it('uma linha por tarefa com vínculo, na ordem do cronograma, sem tarefa que sumiu', () => {
    const r = resumoPorTarefa(vinculos, etapas);
    expect(r.map(l => l.etapa.id)).toEqual(['G1', 'T2']);
    expect(r[1]).toMatchObject({ itens: 2, total: 27000 });
    expect(r[0]).toMatchObject({ itens: 1, total: 3000 });
  });
  it('filtro do resumo pelo nome da tarefa', () => {
    const r = resumoPorTarefa(vinculos, etapas);
    expect(filtrarResumo(r, 'alven').map(l => l.etapa.id)).toEqual(['T2']);
    expect(filtrarResumo(r, '  ')).toBe(r);
    expect(filtrarResumo(r, 'zzz')).toEqual([]);
  });
});

describe('textos', () => {
  it('plural', () => {
    expect(plural(1, 'item', 'itens')).toBe('item');
    expect(plural(2, 'item', 'itens')).toBe('itens');
  });
  it('resumo da seleção', () => {
    expect(textoDaSelecao({ nItens: 1 })).toBe('1 item selecionado');
    expect(textoDaSelecao({ nItens: 3 })).toBe('3 itens selecionados');
    expect(textoDaSelecao({ nItens: 3, tarefa: '2  Escavação' })).toBe('3 itens → 2  Escavação');
    expect(textoDaSelecao({ nItens: 1, tarefa: 'X' })).toBe('1 item → X');
  });
  it('botão adicionar', () => {
    expect(textoDoBotaoAdicionar(1)).toBe('Adicionar');
    expect(textoDoBotaoAdicionar(4)).toBe('Adicionar (4 itens)');
  });
});
