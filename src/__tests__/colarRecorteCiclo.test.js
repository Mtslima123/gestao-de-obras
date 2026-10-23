// BUG-001: recortar um grupo e colar sobre um descendente dele criava parentId cíclico
// (G.parentId = G, ou ciclo de 2 pelo neto). A tela travava em laço infinito e os cálculos
// estouravam a pilha. O colar passa a ser recusado quando o destino está dentro do recorte.
import { describe, it, expect } from 'vitest';
import { destinoNaSubarvoreDoRecorte, getVisibleEtapas } from '../modules/cronograma/scheduleEngine';

const t = (id, extra = {}) => ({ id, etapa: id, isGroup: false, parentId: null, collapsed: false, ...extra });

// G (Fundação) > C (Estacas, grupo) > N (Bloco 1), e G2 (Estrutura) > F
const cenario = () => [
  t('G', { isGroup: true }),
  t('C', { isGroup: true, parentId: 'G' }),
  t('N', { parentId: 'C' }),
  t('G2', { isGroup: true }),
  t('F', { parentId: 'G2' }),
  t('X'),
];

describe('destinoNaSubarvoreDoRecorte', () => {
  it('filho do grupo recortado: recusa (caso que criava G.parentId = G)', () => {
    expect(destinoNaSubarvoreDoRecorte(cenario(), new Set(['G']), 'C')).toBe(true);
  });

  it('neto do grupo recortado: recusa (caso do ciclo de 2)', () => {
    expect(destinoNaSubarvoreDoRecorte(cenario(), new Set(['G']), 'N')).toBe(true);
  });

  it('destino fora da subárvore: permite', () => {
    expect(destinoNaSubarvoreDoRecorte(cenario(), new Set(['G']), 'G2')).toBe(false);
    expect(destinoNaSubarvoreDoRecorte(cenario(), new Set(['G']), 'F')).toBe(false);
    expect(destinoNaSubarvoreDoRecorte(cenario(), new Set(['G']), 'X')).toBe(false);
  });

  it('folha recortada colada sobre irmã ou parente do mesmo grupo: permite', () => {
    // N sai de dentro de C e vai para perto de C: não vira descendente de si mesma
    expect(destinoNaSubarvoreDoRecorte(cenario(), new Set(['N']), 'C')).toBe(false);
    expect(destinoNaSubarvoreDoRecorte(cenario(), new Set(['N']), 'G')).toBe(false);
  });

  it('o próprio destino no recorte não conta (isso é o no-op, tratado à parte)', () => {
    expect(destinoNaSubarvoreDoRecorte(cenario(), new Set(['G']), 'G')).toBe(false);
  });

  it('vários recortados: basta um deles ser ancestral do destino', () => {
    expect(destinoNaSubarvoreDoRecorte(cenario(), new Set(['G2', 'C']), 'N')).toBe(true);
    expect(destinoNaSubarvoreDoRecorte(cenario(), new Set(['G2', 'X']), 'N')).toBe(false);
  });

  it('aceita array de ids além de Set', () => {
    expect(destinoNaSubarvoreDoRecorte(cenario(), ['G'], 'N')).toBe(true);
  });

  it('destino inexistente ou recorte vazio: permite e não quebra', () => {
    expect(destinoNaSubarvoreDoRecorte(cenario(), new Set(['G']), 'NAO_EXISTE')).toBe(false);
    expect(destinoNaSubarvoreDoRecorte(cenario(), new Set(), 'N')).toBe(false);
  });

  it('não entra em laço se o cronograma já tem ciclo gravado', () => {
    const ciclico = [t('A', { isGroup: true, parentId: 'B' }), t('B', { isGroup: true, parentId: 'A' }), t('Z', { parentId: 'A' })];
    expect(destinoNaSubarvoreDoRecorte(ciclico, new Set(['Q']), 'Z')).toBe(false);
  });
});

describe('getVisibleEtapas com parentId cíclico já gravado', () => {
  it('termina (antes ficava em laço infinito com qualquer grupo recolhido)', () => {
    const ciclico = [
      t('G', { isGroup: true, parentId: 'G' }),                 // G.parentId = G
      t('A', { isGroup: true, parentId: 'B' }),
      t('B', { isGroup: true, parentId: 'A' }),                 // ciclo de 2
      t('R', { isGroup: true, collapsed: true }),               // um grupo recolhido qualquer
      t('X', { parentId: 'G' }),
      t('Y', { parentId: 'A' }),
    ];
    const out = getVisibleEtapas(ciclico);
    expect(out.map(e => e.id)).toEqual(expect.arrayContaining(['R', 'X', 'Y']));
  });

  it('continua escondendo os filhos de grupo recolhido em árvore normal', () => {
    const l = cenario().map(e => (e.id === 'C' ? { ...e, collapsed: true } : e));
    expect(getVisibleEtapas(l).map(e => e.id)).toEqual(['G', 'C', 'G2', 'F', 'X']);
  });
});
