// Mover linha pela borda na Lista: a linha azul mostra onde o bloco cai. Metade de cima da linha sob o
// cursor = antes dela, metade de baixo = depois (moveTaskBlock recebe insertAfter). "Depois" de um
// grupo recolhido é depois do grupo inteiro, não entre o cabeçalho e as filhas escondidas.
import { describe, it, expect } from 'vitest';
import { moveTaskBlock } from '../modules/cronograma/scheduleEngine';

const t = (id, extra = {}) => ({ id, etapa: id, isGroup: false, parentId: null, collapsed: false, ...extra });
const ids = (lista) => lista.map(e => e.id);

// G1 (Manta Piscinas) com P1..P3, depois o grupo G2 (Telhado) com T1 e T2, depois a folha X
const cenario = () => [
  t('G1', { isGroup: true }),
  t('P1', { parentId: 'G1' }), t('P2', { parentId: 'G1' }), t('P3', { parentId: 'G1' }),
  t('G2', { isGroup: true }),
  t('T1', { parentId: 'G2' }), t('T2', { parentId: 'G2' }),
  t('X'),
];

describe('moveTaskBlock: antes e depois da linha alvo', () => {
  it('depois da P3 (a linha azul embaixo da P3, caso do print): o bloco fica entre a P3 e o grupo G2', () => {
    const out = moveTaskBlock(cenario(), 'X', 'P3', true);
    expect(ids(out)).toEqual(['G1', 'P1', 'P2', 'P3', 'X', 'G2', 'T1', 'T2']);
  });

  it('antes do grupo G2 (a linha azul em cima do G2) cai no mesmo ponto que depois da P3', () => {
    const antes = moveTaskBlock(cenario(), 'X', 'G2', false);
    const depois = moveTaskBlock(cenario(), 'X', 'P3', true);
    expect(ids(antes)).toEqual(ids(depois));
  });

  it('depois do G2 ABERTO (a linha embaixo do cabeçalho): cai logo abaixo dele, antes da primeira filha', () => {
    const out = moveTaskBlock(cenario(), 'X', 'G2', true);
    expect(ids(out)).toEqual(['G1', 'P1', 'P2', 'P3', 'G2', 'X', 'T1', 'T2']);
  });

  it('mover um bloco inteiro (grupo com filhas) leva as filhas junto', () => {
    const out = moveTaskBlock(cenario(), 'G2', 'P1', false);
    expect(ids(out)).toEqual(['G1', 'G2', 'T1', 'T2', 'P1', 'P2', 'P3', 'X']);
  });

  it('o parentId não muda: só a ordem do array', () => {
    const out = moveTaskBlock(cenario(), 'X', 'P3', true);
    expect(out.find(e => e.id === 'X').parentId).toBe(null);
  });

  it('alvo dentro do próprio bloco arrastado: devolve a mesma lista', () => {
    const base = cenario();
    expect(moveTaskBlock(base, 'G2', 'T1', true)).toBe(base);
  });
});

describe('moveTaskBlock: depois de um grupo recolhido', () => {
  const recolhido = () => cenario().map(e => (e.id === 'G2' ? { ...e, collapsed: true } : e));

  it('cai depois do grupo inteiro (as filhas escondidas ficam coladas ao cabeçalho)', () => {
    const out = moveTaskBlock(recolhido(), 'P1', 'G2', true);
    expect(ids(out)).toEqual(['G1', 'P2', 'P3', 'G2', 'T1', 'T2', 'P1', 'X']);
  });

  it('antes do grupo recolhido continua antes do cabeçalho', () => {
    const out = moveTaskBlock(recolhido(), 'X', 'G2', false);
    expect(ids(out)).toEqual(['G1', 'P1', 'P2', 'P3', 'X', 'G2', 'T1', 'T2']);
  });

  it('grupo recolhido com subgrupo recolhido dentro: pula todos os descendentes', () => {
    const base = [
      t('A', { isGroup: true, collapsed: true }),
      t('A1', { isGroup: true, parentId: 'A', collapsed: true }),
      t('A1a', { parentId: 'A1' }),
      t('A2', { parentId: 'A' }),
      t('Z'),
      t('Y'),
    ];
    const out = moveTaskBlock(base, 'Y', 'A', true);
    expect(ids(out)).toEqual(['A', 'A1', 'A1a', 'A2', 'Y', 'Z']);
  });

  it('grupo recolhido no fim da lista: cai no fim', () => {
    const base = [t('X'), t('G', { isGroup: true, collapsed: true }), t('G1', { parentId: 'G' })];
    expect(ids(moveTaskBlock(base, 'X', 'G', true))).toEqual(['G', 'G1', 'X']);
  });
});
