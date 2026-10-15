import { describe, it, expect } from 'vitest';
import { LIMITE_RESULTADOS, ancestraisRecolhidos, buscarNaLista, encontrarTudo, normBusca } from '../modules/cronograma/localizarPure';

const t = (id, campos = {}) => ({ id, etapa: '', resp: '', parentId: null, isGroup: false, collapsed: false, ...campos });
const colunas = [{ id: 'etapa', label: 'Nome da tarefa' }, { id: 'resp', label: 'Responsável' }, { id: 'status', label: 'Status' }];
const texto = (e, colId) => (colId === 'status' ? (e.status ?? '') : e[colId] ?? '');

describe('normBusca', () => {
  it('ignora acento, caixa e espaços das pontas', () => {
    expect(normBusca('  AÇÃO  Fundação ')).toBe('acao  fundacao');
    expect(normBusca(null)).toBe('');
    expect(normBusca(42)).toBe('42');
  });
});

describe('encontrarTudo', () => {
  const tarefas = [
    t('a', { etapa: 'Fundação do bloco A', resp: 'João' }),
    t('b', { etapa: 'Alvenaria', resp: 'Equipe de fundação', status: 'Futura' }),
    t('c', { etapa: 'Pintura', resp: 'Maria' }),
  ];

  it('uma ocorrência por célula, na ordem das linhas e, dentro da linha, das colunas', () => {
    const r = encontrarTudo({ tarefas, colunas, termo: 'fundacao', textoDaCelula: texto });
    expect(r.map((x) => `${x.taskId}:${x.colId}`)).toEqual(['a:etapa', 'b:resp']);
  });

  it('casa por substring, sem acento nem caixa, e devolve o texto da célula e o rótulo da coluna', () => {
    const [r] = encontrarTudo({ tarefas, colunas, termo: 'JOAO', textoDaCelula: texto });
    expect(r).toEqual({ taskId: 'a', colId: 'resp', colLabel: 'Responsável', texto: 'João' });
  });

  it('a mesma tarefa pode aparecer em várias colunas', () => {
    const r = encontrarTudo({ tarefas: [t('x', { etapa: 'Equipe A', resp: 'Equipe B' })], colunas, termo: 'equipe', textoDaCelula: texto });
    expect(r.map((x) => x.colId)).toEqual(['etapa', 'resp']);
  });

  it('termo vazio ou só espaços não acha nada; célula vazia nunca casa', () => {
    expect(encontrarTudo({ tarefas, colunas, termo: '   ', textoDaCelula: texto })).toEqual([]);
    expect(encontrarTudo({ tarefas, colunas, termo: 'zzz', textoDaCelula: texto })).toEqual([]);
  });

  it('respeita o limite', () => {
    const muitas = Array.from({ length: 10 }, (_, i) => t(`t${i}`, { etapa: 'laje' }));
    expect(encontrarTudo({ tarefas: muitas, colunas, termo: 'laje', textoDaCelula: texto, limite: 3 })).toHaveLength(3);
  });
});

describe('buscarNaLista', () => {
  const grupo = t('g', { etapa: 'Estrutura', isGroup: true, collapsed: true });
  const filha = t('f', { etapa: 'Laje do 1º pavimento', parentId: 'g' });
  const solta = t('s', { etapa: 'Laje de cobertura' });
  const filtrada = t('x', { etapa: 'Laje técnica' }); // escondida por filtro
  const todas = [grupo, filha, solta, filtrada];
  const candidatas = [grupo, filha, solta]; // passam pelos filtros (a filha está em grupo recolhido)
  const visiveis = new Set(['g', 's']); // a filha não está na grade
  const base = { todas, candidatas, visiveis, colunas, textoDaCelula: texto };

  it('marca os resultados que estão dentro de grupo recolhido', () => {
    const { itens } = buscarNaLista({ ...base, termo: 'laje' });
    expect(itens.map((r) => [r.taskId, r.recolhido])).toEqual([['f', true], ['s', false]]);
  });

  it('conta, só quando pedido, as tarefas que casariam mas estão escondidas por filtro', () => {
    expect(buscarNaLista({ ...base, termo: 'laje' }).ocultosPorFiltro).toBe(0);
    expect(buscarNaLista({ ...base, termo: 'laje', contarOcultos: true }).ocultosPorFiltro).toBe(1);
  });

  it('corta no limite e avisa que truncou', () => {
    const muitas = Array.from({ length: LIMITE_RESULTADOS + 5 }, (_, i) => t(`t${i}`, { etapa: 'laje' }));
    const r = buscarNaLista({ todas: muitas, candidatas: muitas, visiveis: new Set(muitas.map((x) => x.id)), colunas, termo: 'laje', textoDaCelula: texto });
    expect(r.itens).toHaveLength(LIMITE_RESULTADOS);
    expect(r.truncado).toBe(true);
    expect(buscarNaLista({ ...base, termo: 'laje' }).truncado).toBe(false);
  });
});

describe('ancestraisRecolhidos', () => {
  const g1 = t('g1', { isGroup: true, collapsed: true });
  const g2 = t('g2', { isGroup: true, collapsed: true, parentId: 'g1' });
  const g3 = t('g3', { isGroup: true, collapsed: false, parentId: 'g2' });
  const folha = t('f', { parentId: 'g3' });
  const etapas = [g1, g2, g3, folha, t('solta')];

  it('lista só os grupos recolhidos da cadeia, do mais próximo ao mais distante', () => {
    expect(ancestraisRecolhidos(etapas, 'f')).toEqual(['g2', 'g1']); // g3 está aberto
  });

  it('tarefa sem pai, ou com tudo aberto, não precisa abrir nada', () => {
    expect(ancestraisRecolhidos(etapas, 'solta')).toEqual([]);
    expect(ancestraisRecolhidos(etapas.map((e) => ({ ...e, collapsed: false })), 'f')).toEqual([]);
  });

  it('pai que não é grupo ou que não existe mais não quebra', () => {
    expect(ancestraisRecolhidos([t('a', { parentId: 'fantasma' })], 'a')).toEqual([]);
    expect(ancestraisRecolhidos([t('p', { collapsed: true }), t('c', { parentId: 'p' })], 'c')).toEqual([]); // não é isGroup
  });
});
