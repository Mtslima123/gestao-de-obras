// Testes de getVisibleEtapas — a fonte das linhas visíveis (usada pela virtualização
// da Lista e do Gantt). Grupos recolhidos escondem seus descendentes (qualquer nível).
import { describe, it, expect } from 'vitest';
import { getVisibleEtapas, indentTasks, outdentTasks } from '../modules/cronograma/scheduleEngine';

const arvore = () => [
  { id: 'A',   parentId: null, isGroup: true,  collapsed: false },
  { id: 'A1',  parentId: 'A',  isGroup: true,  collapsed: false },
  { id: 'A1a', parentId: 'A1', isGroup: false, collapsed: false },
  { id: 'A2',  parentId: 'A',  isGroup: false, collapsed: false },
  { id: 'B',   parentId: null, isGroup: false, collapsed: false },
];
const ids = (arr) => arr.map(e => e.id);

describe('getVisibleEtapas', () => {
  it('sem grupos recolhidos retorna todas (mesma referência)', () => {
    const e = arvore();
    const out = getVisibleEtapas(e);
    expect(out).toBe(e);            // otimização: retorna o próprio array
    expect(ids(out)).toEqual(['A', 'A1', 'A1a', 'A2', 'B']);
  });

  it('recolher um grupo esconde todos os descendentes (diretos e profundos), mas o grupo permanece', () => {
    const e = arvore().map(x => x.id === 'A' ? { ...x, collapsed: true } : x);
    expect(ids(getVisibleEtapas(e))).toEqual(['A', 'B']); // A1, A1a e A2 somem
  });

  it('recolher um subgrupo esconde só os descendentes dele', () => {
    const e = arvore().map(x => x.id === 'A1' ? { ...x, collapsed: true } : x);
    expect(ids(getVisibleEtapas(e))).toEqual(['A', 'A1', 'A2', 'B']); // só A1a some
  });

  it('collapsed em não-grupo é ignorado (só grupos recolhem)', () => {
    const e = arvore().map(x => x.id === 'A2' ? { ...x, collapsed: true } : x);
    expect(ids(getVisibleEtapas(e))).toEqual(['A', 'A1', 'A1a', 'A2', 'B']);
  });
});

describe('indentTasks / outdentTasks com múltiplos ids (recuar/avançar em bloco)', () => {
  const flat = () => [
    { id: 'A', parentId: null, nivel: 0, isGroup: false, avanco: 0, inicio: 0, dur: 1 },
    { id: 'B', parentId: null, nivel: 0, isGroup: false, avanco: 0, inicio: 0, dur: 1 },
    { id: 'C', parentId: null, nivel: 0, isGroup: false, avanco: 0, inicio: 0, dur: 1 },
  ];

  it('recuar um bloco contíguo põe TODAS sob a mesma irmã acima (não em cadeia)', () => {
    const out = indentTasks(flat(), ['B', 'C']);
    expect(out.find(e => e.id === 'B').parentId).toBe('A');
    expect(out.find(e => e.id === 'C').parentId).toBe('A'); // C filha de A, não de B
    expect(out.find(e => e.id === 'A').isGroup).toBe(true);
  });

  it('recuar uma única linha continua funcionando', () => {
    const out = indentTasks(flat(), ['B']);
    expect(out.find(e => e.id === 'B').parentId).toBe('A');
  });

  it('promover (avançar) múltiplas filhas devolve ambas ao nível do pai', () => {
    const nested = [
      { id: 'A', parentId: null, nivel: 0, isGroup: true,  avanco: 0, inicio: 0, dur: 1 },
      { id: 'B', parentId: 'A', nivel: 1, isGroup: false, avanco: 0, inicio: 0, dur: 1 },
      { id: 'C', parentId: 'A', nivel: 1, isGroup: false, avanco: 0, inicio: 0, dur: 1 },
    ];
    const out = outdentTasks(nested, ['B', 'C']);
    expect(out.find(e => e.id === 'B').parentId).toBe(null);
    expect(out.find(e => e.id === 'C').parentId).toBe(null);
  });
});
