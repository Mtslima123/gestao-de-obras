import { describe, it, expect } from 'vitest';
import { snapshotEtapas, diffEtapas, patchCompensa } from '../modules/cronograma/etapasPatch';

const e = (id, extra = {}) => ({ id, etapa: 'Tarefa ' + id, parentId: null, fator_peso: 1, ...extra });
const base = () => [e('A'), e('B'), e('C')];
const outros = { customCols: [], baselines: [], reprogramacoes: [], feriados: undefined };

// Reproduz o que o RPC faz no banco, para conferir que o patch reconstrói o array certo.
// Modo in-place quando ordem é null; ordem explícita caso contrário (remoção implícita).
function aplicarPatch(noBanco, patch) {
  const ups = new Map(patch.upserts.map(x => [x.id, x]));
  if (patch.ordem == null) return noBanco.map(x => ups.get(x.id) || x);
  const atuais = new Map(noBanco.map(x => [x.id, x]));
  return patch.ordem.map(id => {
    const achado = ups.get(id) || atuais.get(id);
    if (!achado) throw new Error('patch incompleto: ' + id);
    return achado;
  });
}

describe('snapshotEtapas', () => {
  it('indexa por id e guarda a ordem', () => {
    const s = snapshotEtapas(base(), outros);
    expect([...s.porId.keys()]).toEqual(['A', 'B', 'C']);
    expect(s.ordem).toEqual(['A', 'B', 'C']);
  });
});

describe('diffEtapas', () => {
  it('sem snapshot devolve null — chamador manda tudo', () => {
    expect(diffEtapas(null, base(), outros)).toBeNull();
  });

  it('nada mudou: marca inalterado e não gera upsert', () => {
    const s = snapshotEtapas(base(), outros);
    const d = diffEtapas(s, base(), outros);
    expect(d.inalterado).toBe(true);
    expect(d.upserts).toEqual([]);
    expect(d.ordem).toBeNull();
  });

  it('edição de célula: um upsert, sem reordenação', () => {
    const s = snapshotEtapas(base(), outros);
    const agora = base().map(x => (x.id === 'B' ? { ...x, etapa: 'Renomeada' } : x));
    const d = diffEtapas(s, agora, outros);
    expect(d.upserts).toHaveLength(1);
    expect(d.upserts[0].id).toBe('B');
    expect(d.ordem).toBeNull();
    expect(aplicarPatch(base(), d)).toEqual(agora);
  });

  it('inclusão: manda a nova e a ordem completa', () => {
    const s = snapshotEtapas(base(), outros);
    const agora = [...base(), e('D')];
    const d = diffEtapas(s, agora, outros);
    expect(d.upserts.map(x => x.id)).toEqual(['D']);
    expect(d.ordem).toEqual(['A', 'B', 'C', 'D']);
    expect(aplicarPatch(base(), d)).toEqual(agora);
  });

  it('exclusão: sem upsert, remoção implícita pela ordem', () => {
    const s = snapshotEtapas(base(), outros);
    const agora = [e('A'), e('C')];
    const d = diffEtapas(s, agora, outros);
    expect(d.upserts).toEqual([]);
    expect(d.ordem).toEqual(['A', 'C']);
    expect(d.removidos).toEqual(['B']);
    expect(aplicarPatch(base(), d)).toEqual(agora);
  });

  it('movimentação: só a ordem muda, nenhum upsert', () => {
    const s = snapshotEtapas(base(), outros);
    const agora = [e('C'), e('A'), e('B')];
    const d = diffEtapas(s, agora, outros);
    expect(d.upserts).toEqual([]);
    expect(d.ordem).toEqual(['C', 'A', 'B']);
    expect(aplicarPatch(base(), d)).toEqual(agora);
  });

  it('mudança de hierarquia entra como upsert do filho movido', () => {
    const s = snapshotEtapas(base(), outros);
    const agora = base().map(x => (x.id === 'C' ? { ...x, parentId: 'A' } : x));
    const d = diffEtapas(s, agora, outros);
    expect(d.upserts.map(x => x.id)).toEqual(['C']);
    expect(aplicarPatch(base(), d)).toEqual(agora);
  });

  it('mexer em custom_cols/baselines cai fora do patch', () => {
    const s = snapshotEtapas(base(), outros);
    expect(diffEtapas(s, base(), { ...outros, baselines: [{ id: 'BL1' }] })).toBeNull();
    expect(diffEtapas(s, base(), { ...outros, customCols: ['cc_x'] })).toBeNull();
    expect(diffEtapas(s, base(), { ...outros, feriados: { dias: [] } })).toBeNull();
  });

  it('id duplicado cai fora do patch — a reconstrução por id seria ambígua', () => {
    const s = snapshotEtapas(base(), outros);
    expect(diffEtapas(s, [e('A'), e('A'), e('C')], outros)).toBeNull();
  });

  it('inclusão e exclusão no mesmo save reconstroem o array certo', () => {
    const s = snapshotEtapas(base(), outros);
    const agora = [e('A'), e('D'), e('C', { etapa: 'C alterada' })];
    const d = diffEtapas(s, agora, outros);
    expect(d.upserts.map(x => x.id).sort()).toEqual(['C', 'D']);
    expect(d.removidos).toEqual(['B']);
    expect(aplicarPatch(base(), d)).toEqual(agora);
  });

  it('a árvore inteira reordenada ainda reconstrói igual', () => {
    const grande = Array.from({ length: 200 }, (_, i) => e('T' + i));
    const s = snapshotEtapas(grande, outros);
    const agora = [...grande].reverse();
    const d = diffEtapas(s, agora, outros);
    expect(d.upserts).toEqual([]);
    expect(aplicarPatch(grande, d)).toEqual(agora);
  });
});

describe('patchCompensa', () => {
  it('recusa quando não há mudança', () => {
    const s = snapshotEtapas(base(), outros);
    expect(patchCompensa(diffEtapas(s, base(), outros), 3)).toBe(false);
    expect(patchCompensa(null, 3)).toBe(false);
  });

  it('aceita a edição de poucas etapas numa árvore grande', () => {
    const grande = Array.from({ length: 1139 }, (_, i) => e('T' + i));
    const s = snapshotEtapas(grande, outros);
    const agora = grande.map((x, i) => (i === 500 ? { ...x, etapa: 'X' } : x));
    expect(patchCompensa(diffEtapas(s, agora, outros), 1139)).toBe(true);
  });

  it('recusa quando quase tudo mudou — não economiza tráfego', () => {
    const grande = Array.from({ length: 100 }, (_, i) => e('T' + i));
    const s = snapshotEtapas(grande, outros);
    const agora = grande.map(x => ({ ...x, etapa: 'todas mudaram' }));
    expect(patchCompensa(diffEtapas(s, agora, outros), 100)).toBe(false);
  });
});
