import { describe, it, expect } from 'vitest';
import { snapshotEtapas, diffEtapas, patchCompensa, mesmaVersao, decidirSincronia } from '../modules/cronograma/etapasPatch';

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

describe('mesmaVersao', () => {
  it('compara o instante, não o texto (formato do navegador x formato do banco)', () => {
    expect(mesmaVersao('2026-10-15T13:52:04.477Z', '2026-10-15T13:52:04.477+00:00')).toBe(true);
    expect(mesmaVersao('2026-10-15T17:49:47.713476+00:00', '2026-10-15T17:49:47.713+00:00')).toBe(true);
    expect(mesmaVersao('2026-10-15T17:49:47.713+00:00', '2026-10-15T17:50:44.993+00:00')).toBe(false);
  });

  it('vazio ou inválido nunca é igual', () => {
    expect(mesmaVersao(null, null)).toBe(false);
    expect(mesmaVersao(undefined, '2026-10-15T13:52:04.477Z')).toBe(false);
    expect(mesmaVersao('lixo', 'lixo')).toBe(false);
  });
});

describe('decidirSincronia — voltar para a tela com o banco possivelmente mudado', () => {
  const v1 = '2026-10-15T17:49:47.713476+00:00';
  const v2 = '2026-10-15T17:51:30.796+00:00';

  it('banco igual ao da tela: nada', () => {
    expect(decidirSincronia({ bancoUpdatedAt: v1, referencia: '2026-10-15T17:49:47.713Z' })).toBe('nada');
  });

  it('outra aba gravou e esta tela não tem nada pendente: recarregar (o caso dos pesos em outra aba)', () => {
    expect(decidirSincronia({ bancoUpdatedAt: v2, referencia: v1 })).toBe('recarregar');
  });

  it('sem referência (cache invalidado) e nada pendente: recarregar', () => {
    expect(decidirSincronia({ bancoUpdatedAt: v2, referencia: null })).toBe('recarregar');
  });

  it('mudou mas há gravação desta tela pendente ou em andamento: aguardar (a própria gravação esbarra na trava)', () => {
    expect(decidirSincronia({ bancoUpdatedAt: v2, referencia: v1, pendente: true })).toBe('aguardar');
  });

  it('já em conflito, ou versão do banco ilegível: nada', () => {
    expect(decidirSincronia({ bancoUpdatedAt: v2, referencia: v1, emConflito: true })).toBe('nada');
    expect(decidirSincronia({ bancoUpdatedAt: null, referencia: v1 })).toBe('nada');
  });
});
