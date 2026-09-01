import { describe, it, expect } from 'vitest';
import { ancestraisDe, filtrarComSubarvore, folhasDaSubarvore } from '../modules/financeiro/itensHierarquia';

// Lista de referência espelhando a tela real (001.08.04 Ferragens e as três fechaduras),
// mais um sub-resumo para cobrir profundidade > 1.
const item = (id, codigo, nome) => ({ id, codigo, nome });

const lista = () => [
  item(1, '001', 'EDIFICAÇÃO'),
  item(2, '001.08', 'ESQUADRIAS'),
  item(3, '001.08.04', 'Ferragens'),
  item(4, '001.08.04.01', 'FECHADURA C/CILINDRO - EXTERNO - MAT'),
  item(5, '001.08.04.02', 'FECHADURA C/CHAVE (INTERNA) - MAT'),
  item(6, '001.08.04.03', 'FECHADURA C/TRANQUETA (BANHEIRO)- MAT'),
  item(7, '001.08.05', 'Dobradiças'),
  item(8, '001.08.05.01', 'DOBRADIÇA INOX - MAT'),
  item(9, '002', 'INSTALAÇÕES'),
];

// Resumo = código que é prefixo de outro (mesma regra da tela)
const resumoIdsDe = (l) =>
  new Set(l.filter(it => l.some(o => o.codigo?.startsWith(it.codigo + '.'))).map(it => it.id));

const ids = (arr) => arr.map(x => x.id);

describe('ancestraisDe', () => {
  it('devolve a cadeia sem incluir o próprio código', () => {
    expect(ancestraisDe('001.08.04.01')).toEqual(['001', '001.08', '001.08.04']);
  });

  it('raiz não tem ancestral', () => {
    expect(ancestraisDe('001')).toEqual([]);
  });

  it('código vazio ou ausente não quebra', () => {
    expect(ancestraisDe('')).toEqual([]);
    expect(ancestraisDe(undefined)).toEqual([]);
  });
});

describe('filtrarComSubarvore', () => {
  const todos = lista();
  const disp = (excluir = []) => todos.filter(it => !excluir.includes(it.id));

  it('buscar o nome do resumo traz o resumo e as filhas', () => {
    const r = filtrarComSubarvore(todos, disp(), 'Ferragens');
    // ancestrais entram para dar contexto; as três filhas entram para poder marcar
    expect(ids(r)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('buscar o nome de uma filha traz a filha e os ancestrais', () => {
    const r = filtrarComSubarvore(todos, disp(), 'TRANQUETA');
    expect(ids(r)).toEqual([1, 2, 3, 6]);
  });

  it('buscar por código continua funcionando', () => {
    const r = filtrarComSubarvore(todos, disp(), '001.08.04');
    expect(ids(r)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('resumo já vinculado ainda puxa as filhas livres', () => {
    // o pai saiu dos disponíveis, mas as filhas dele continuam aparecendo
    const r = filtrarComSubarvore(todos, disp([3]), 'Ferragens');
    expect(ids(r)).toEqual([1, 2, 4, 5, 6]);
  });

  it('filha já vinculada some da lista', () => {
    const r = filtrarComSubarvore(todos, disp([4]), 'Ferragens');
    expect(ids(r)).toEqual([1, 2, 3, 5, 6]);
  });

  it('busca vazia devolve todos os disponíveis', () => {
    expect(ids(filtrarComSubarvore(todos, disp(), ''))).toEqual(ids(todos));
    expect(ids(filtrarComSubarvore(todos, disp(), '   '))).toEqual(ids(todos));
  });

  it('busca sem resultado devolve lista vazia', () => {
    expect(filtrarComSubarvore(todos, disp(), 'inexistente')).toEqual([]);
  });

  it('é insensível a maiúsculas', () => {
    expect(ids(filtrarComSubarvore(todos, disp(), 'ferragens')))
      .toEqual(ids(filtrarComSubarvore(todos, disp(), 'FERRAGENS')));
  });

  it('não vaza para irmãos que não casaram', () => {
    const r = filtrarComSubarvore(todos, disp(), 'Ferragens');
    expect(ids(r)).not.toContain(7); // Dobradiças
    expect(ids(r)).not.toContain(9); // INSTALAÇÕES
  });

  it('item sem codigo ou sem nome não quebra o filtro', () => {
    const comBuraco = [...todos, item(10, undefined, 'AVULSO'), item(11, '003', undefined)];
    expect(() => filtrarComSubarvore(comBuraco, comBuraco, 'avulso')).not.toThrow();
    const r = filtrarComSubarvore(comBuraco, comBuraco, 'AVULSO');
    expect(ids(r)).toEqual([10]); // sem código, só sobrevive casando por nome
  });
});

describe('folhasDaSubarvore', () => {
  const todos = lista();
  const resumoIds = resumoIdsDe(todos);

  it('pega só as folhas vinculáveis abaixo do resumo', () => {
    const ferragens = todos.find(i => i.codigo === '001.08.04');
    expect(ids(folhasDaSubarvore(ferragens, todos, resumoIds))).toEqual([4, 5, 6]);
  });

  it('desce mais de um nível e pula os sub-resumos', () => {
    const edificacao = todos.find(i => i.codigo === '001');
    // 001.08 e 001.08.04 e 001.08.05 sao resumos e ficam de fora
    expect(ids(folhasDaSubarvore(edificacao, todos, resumoIds))).toEqual([4, 5, 6, 8]);
  });

  it('opera sobre a lista visível, não sobre a completa', () => {
    const ferragens = todos.find(i => i.codigo === '001.08.04');
    const visivel = todos.filter(i => i.id !== 5);
    expect(ids(folhasDaSubarvore(ferragens, visivel, resumoIds))).toEqual([4, 6]);
  });

  it('folha não tem subárvore', () => {
    const folha = todos.find(i => i.codigo === '001.08.04.01');
    expect(folhasDaSubarvore(folha, todos, resumoIds)).toEqual([]);
  });

  it('não confunde prefixo textual com hierarquia', () => {
    // 001.08.040 não é filho de 001.08.04 — o ponto separador evita o falso positivo
    const l = [...todos, item(12, '001.08.040', 'OUTRO GRUPO')];
    const ferragens = l.find(i => i.codigo === '001.08.04');
    expect(ids(folhasDaSubarvore(ferragens, l, resumoIdsDe(l)))).toEqual([4, 5, 6]);
  });

  it('pai sem código devolve vazio', () => {
    expect(folhasDaSubarvore({ id: 99 }, todos, resumoIds)).toEqual([]);
  });
});
