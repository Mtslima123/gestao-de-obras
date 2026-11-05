// "Distribuir pesos" na casca mobile (modules/mobile/full/orcamentos/pesosMobilePure): estado de partida, retirar e
// readicionar, valores por linha, R$ digitado, alteração e payload do salvar, com as mesmas regras do modal do desktop.
import { describe, it, expect } from 'vitest';
import {
  subarvoreIds, estadoInicial, retirarDaDistribuicao, readicionarNaDistribuicao, idsComSubarvore, linhasDaLista, alternarEm,
  valorDoGrupo, valorPorNoDe, totalDistribuido, divergenciaDe, valorDoPai, valorEditavel, bloqueioDaLinha,
  valorDigitado, valorParaCampo, aplicarValorDigitado, houveMudanca, payloadParaSalvar,
} from '../modules/mobile/full/orcamentos/pesosMobilePure';

// G (grupo) > A, B (grupo) > [B1 (grupo) > [B1a, B1b], B2], C
// O nivel importa: o computeValorVinculadoMap soma das folhas para os grupos ordenando do mais fundo para o mais raso.
const et = (id, parentId, isGroup = false, nivel = 0, extra = {}) => ({ id, etapa: id, parentId, isGroup, nivel, fator_peso: 1, avanco: 0, ...extra });
const base = () => [
  et('G', null, true, 0), et('A', 'G', false, 1), et('B', 'G', true, 1), et('B1', 'B', true, 2), et('B1a', 'B1', false, 3),
  et('B1b', 'B1', false, 3), et('B2', 'B', false, 2), et('C', 'G', false, 1),
];
const G = { id: 'G' };
const vinculos = [{ id: 'v', etapa_id: 'G', orcamento_item_id: 1 }];
const itensMap = { 1: 1000 };

describe('estado de partida', () => {
  it('descendentes em ordem de árvore, recolhe só subgrupos além do primeiro nível, pesos em texto', () => {
    const s = estadoInicial(G, base());
    expect(s.descendentes.map(n => n.etapa.id)).toEqual(['A', 'B', 'B1', 'B1a', 'B1b', 'B2', 'C']);
    expect([...s.collapsed]).toEqual(['B1']);
    expect(s.pesos).toEqual({ A: '1', B: '1', B1: '1', B1a: '1', B1b: '1', B2: '1', C: '1' });
    expect(s.travas.size).toBe(0);
    expect(s.removidos.size).toBe(0);
    expect(s.unidade).toBe('');
  });
  it('cadeado e unidade vêm do que está salvo no cronograma', () => {
    const e = base().map(x => (x.id === 'A' ? { ...x, peso_travado: true } : x));
    const s = estadoInicial({ ...G, peso_unidade: 'm²' }, e);
    expect([...s.travas]).toEqual(['A']);
    expect(s.unidade).toBe('m²');
  });
  it('reconhece quem já foi retirado: só a raiz da subárvore zerada', () => {
    const e = base().map(x => (['B', 'B1', 'B1a'].includes(x.id) || x.id === 'C' ? { ...x, fator_peso: 0 } : x));
    const s = estadoInicial(G, e);
    expect([...s.removidos].sort()).toEqual(['B', 'C']);
  });
});

describe('retirar e readicionar', () => {
  const s = estadoInicial(G, base());
  const pesos = { ...s.pesos, B: '2', B2: '3' };
  it('zera a subárvore inteira e guarda o peso de antes', () => {
    const ids = subarvoreIds('B', s.childrenOf);
    expect(ids.sort()).toEqual(['B', 'B1', 'B1a', 'B1b', 'B2']);
    const r = retirarDaDistribuicao({ pesos, ids });
    expect(r.pesos).toMatchObject({ A: '1', B: '0', B1: '0', B1a: '0', B1b: '0', B2: '0', C: '1' });
    expect(r.guardados).toMatchObject({ B: '2', B2: '3', B1: '1' });
  });
  it('adicionar de volta restaura o que tinha; sem guardado volta com 1', () => {
    const ids = subarvoreIds('B', s.childrenOf);
    const r = retirarDaDistribuicao({ pesos, ids });
    expect(readicionarNaDistribuicao({ pesos: r.pesos, ids, guardados: r.guardados })).toEqual(pesos);
    expect(readicionarNaDistribuicao({ pesos: r.pesos, ids })).toMatchObject({ B: '1', B2: '1' });
  });
  it('a subárvore retirada some da lista, junto com o que está recolhido', () => {
    const removidosSubarvore = idsComSubarvore(new Set(['B']), s.childrenOf);
    expect([...removidosSubarvore].sort()).toEqual(['B', 'B1', 'B1a', 'B1b', 'B2']);
    const ver = (collapsed, rem) => linhasDaLista({ etapaId: 'G', childrenOf: s.childrenOf, collapsed, removidosSubarvore: rem }).map(n => n.etapa.id);
    expect(ver(new Set(['B1']), new Set())).toEqual(['A', 'B', 'B1', 'B2', 'C']);
    expect(ver(new Set(), new Set())).toEqual(['A', 'B', 'B1', 'B1a', 'B1b', 'B2', 'C']);
    expect(ver(new Set(), removidosSubarvore)).toEqual(['A', 'C']);
  });
  it('alternarEm não muda o conjunto original', () => {
    const a = new Set(['x']);
    expect([...alternarEm(a, 'y')].sort()).toEqual(['x', 'y']);
    expect([...alternarEm(a, 'x')]).toEqual([]);
    expect([...a]).toEqual(['x']);
  });
});

describe('valores por linha', () => {
  const s = estadoInicial(G, base());
  const etapas = base();
  it('valor do grupo e rateio por peso (3 filhos iguais)', () => {
    expect(valorDoGrupo(vinculos, itensMap)).toBe(1000);
    expect(valorDoGrupo([], itensMap)).toBe(0);
    const m = valorPorNoDe({ etapas, pesos: s.pesos, vinculos, orcamentoItensMap: itensMap });
    expect(m.A).toBeCloseTo(333.333, 2);
    expect(m.B).toBeCloseTo(333.333, 2);
    expect(totalDistribuido('G', s.childrenOf, m)).toBeCloseTo(1000, 6);
    expect(divergenciaDe(1000, totalDistribuido('G', s.childrenOf, m)).tem).toBe(false);
  });
  it('peso maior leva mais dinheiro e o total continua fechando', () => {
    const m = valorPorNoDe({ etapas, pesos: { ...s.pesos, A: '2' }, vinculos, orcamentoItensMap: itensMap });
    expect(m.A).toBeCloseTo(500, 2);
    expect(m.C).toBeCloseTo(250, 2);
  });
  it('todos os irmãos com peso zero: sobra dinheiro sem destino (divergência)', () => {
    const pesos = { ...s.pesos, A: '0', B: '0', C: '0' };
    const m = valorPorNoDe({ etapas, pesos, vinculos, orcamentoItensMap: itensMap });
    const d = divergenciaDe(1000, totalDistribuido('G', s.childrenOf, m));
    expect(d.tem).toBe(true);
    expect(d.valor).toBeCloseTo(1000, 6);
    expect(divergenciaDe(100, 100.005).tem).toBe(false);
  });
  it('valor do pai: o do grupo para filhos diretos, o da linha-pai para os demais', () => {
    const m = valorPorNoDe({ etapas, pesos: s.pesos, vinculos, orcamentoItensMap: itensMap });
    const ctx = { etapaId: 'G', valorGrupo: 1000, valorPorNo: m };
    expect(valorDoPai(etapas.find(x => x.id === 'A'), ctx)).toBe(1000);
    expect(valorDoPai(etapas.find(x => x.id === 'B1'), ctx)).toBeCloseTo(333.333, 2);
  });
});

describe('valor editável', () => {
  const s = estadoInicial(G, base());
  const A = base().find(x => x.id === 'A');
  const ctx = (travas, valorPai = 1000, childrenOf = s.childrenOf) => ({ childrenOf, travas: new Set(travas), valorPai });
  it('precisa de pelo menos 2 irmãos livres e valor do pai', () => {
    expect(valorEditavel(A, ctx([]))).toBe(true);
    expect(valorEditavel(A, ctx([], 0))).toBe(false);
    expect(valorEditavel(A, ctx(['A']))).toBe(false);
    expect(valorEditavel(A, ctx(['B', 'C']))).toBe(false);
    expect(valorEditavel(A, ctx(['C']))).toBe(true);
  });
  it('irmão com valor congelado na conclusão não conta como livre', () => {
    const e = base().map(x => (x.id === 'C' ? { ...x, valorVinculadoFixo: 100 } : x));
    const c = estadoInicial(G, e).childrenOf;
    expect(valorEditavel(A, ctx([], 1000, c))).toBe(true);
    expect(valorEditavel(A, ctx(['B'], 1000, c))).toBe(false);
  });
  it('bloqueio: concluída ou cadeado', () => {
    const e = base().map(x => (['B1a', 'B1b', 'B2'].includes(x.id) ? { ...x, avanco: 100 } : x));
    const c = estadoInicial(G, e).childrenOf;
    const por = (id, travas = []) => bloqueioDaLinha(e.find(x => x.id === id), { childrenOf: c, travas: new Set(travas) });
    expect(por('A')).toEqual({ concluida: false, cadeado: false, bloqueada: false });
    expect(por('B2').concluida).toBe(true);
    expect(por('B').concluida).toBe(true); // todas as folhas do grupo concluídas
    expect(por('C', ['C'])).toEqual({ concluida: false, cadeado: true, bloqueada: true });
  });
});

describe('R$ digitado', () => {
  it('lê os formatos do teclado do celular', () => {
    expect(valorDigitado('1.234,50')).toBe(1234.5);
    expect(valorDigitado('1234,5')).toBe(1234.5);
    expect(valorDigitado('1234.5')).toBe(1234.5); // o desktop (parseBRL) leria 12345
    expect(valorDigitado('1.000')).toBe(1000);
    expect(valorDigitado('R$ 500,00')).toBe(500);
    expect(valorDigitado('')).toBe(0);
    expect(valorDigitado('abc')).toBe(0);
    expect(valorDigitado('-5')).toBe(0);
  });
  it('valor para o campo de edição', () => {
    expect(valorParaCampo(1234.5)).toBe('1234,50');
    expect(valorParaCampo(null)).toBe('0,00');
    expect(valorParaCampo(0.005)).toBe('0,01');
  });
  const s = estadoInicial(G, base());
  const etapas = base();
  const valorPorNo = valorPorNoDe({ etapas, pesos: s.pesos, vinculos, orcamentoItensMap: itensMap });
  const A = etapas.find(x => x.id === 'A');
  const aplicar = (texto, travas = []) => aplicarValorDigitado({ etapa: A, texto, childrenOf: s.childrenOf, valorPai: 1000, valorPorNo, pesos: s.pesos, travas: new Set(travas) });
  it('redistribui os irmãos mantendo a soma dos pesos', () => {
    const p = aplicar('500,00');
    expect(Number(p.A)).toBeCloseTo(1.5, 6);
    expect(Number(p.B)).toBeCloseTo(0.75, 6);
    expect(Number(p.C)).toBeCloseTo(0.75, 6);
    expect(Number(p.A) + Number(p.B) + Number(p.C)).toBeCloseTo(3, 6);
  });
  it('passa do disponível: limita ao que o grupo tem', () => {
    const p = aplicar('999.999,00');
    expect(Number(p.A)).toBeCloseTo(3, 6);
    expect(Number(p.B)).toBeCloseTo(0, 6);
  });
  it('linha com cadeado não entra no patch e segura o seu dinheiro', () => {
    const p = aplicar('500,00', ['C']);
    expect(Object.keys(p).sort()).toEqual(['A', 'B']);
    expect(Number(p.A)).toBeCloseTo(1.5, 6);
    expect(Number(p.B)).toBeCloseTo(0.5, 6);
  });
  it('sem o que redistribuir devolve null', () => {
    expect(aplicar('500,00', ['B', 'C'])).toBeNull();
  });
});

describe('alteração e payload do salvar', () => {
  const s = estadoInicial(G, base());
  const igual = () => ({ pesos: { ...s.pesos }, travas: new Set(s.travas), removidos: new Set(s.removidos), unidade: s.unidade });
  it('só acusa mudança de verdade (por valor, não por referência)', () => {
    expect(houveMudanca(igual(), igual())).toBe(false);
    expect(houveMudanca(igual(), { ...igual(), pesos: { ...s.pesos, A: '1.0' } })).toBe(false);
    expect(houveMudanca(igual(), { ...igual(), pesos: { ...s.pesos, A: '2' } })).toBe(true);
    expect(houveMudanca(igual(), { ...igual(), travas: new Set(['A']) })).toBe(true);
    expect(houveMudanca(igual(), { ...igual(), removidos: new Set(['C']) })).toBe(true);
    expect(houveMudanca(igual(), { ...igual(), unidade: 'm²' })).toBe(true);
  });
  it('payload: peso de concluída fica de fora, cadeado vai de todas as linhas', () => {
    const e = base().map(x => (x.id === 'A' ? { ...x, avanco: 100 } : x));
    const i = estadoInicial(G, e);
    const r = payloadParaSalvar({ descendentes: i.descendentes, pesos: { ...i.pesos, C: '4' }, travas: new Set(['C']), childrenOf: i.childrenOf });
    expect(Object.keys(r.pesos).sort()).toEqual(['B', 'B1', 'B1a', 'B1b', 'B2', 'C']);
    expect(r.pesos.C).toBe('4');
    expect(Object.keys(r.travas).sort()).toEqual(['A', 'B', 'B1', 'B1a', 'B1b', 'B2', 'C']);
    expect(r.travas.C).toBe(true);
    expect(r.travas.A).toBe(false);
  });
  it('cadeado do usuário não tira o peso já digitado do payload', () => {
    const r = payloadParaSalvar({ descendentes: s.descendentes, pesos: { ...s.pesos, A: '7' }, travas: new Set(['A']), childrenOf: s.childrenOf });
    expect(r.pesos.A).toBe('7');
  });
});
