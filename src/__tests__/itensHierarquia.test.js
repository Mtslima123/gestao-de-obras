import { describe, it, expect } from 'vitest';
import {
  ancestraisDe, filtrarComSubarvore, folhasDaSubarvore, conjuntoDePais, calcularTotaisItens,
} from '../modules/financeiro/itensHierarquia';

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

describe('conjuntoDePais', () => {
  it('é derivado da lista recebida: todo prefixo de código é pai', () => {
    expect([...conjuntoDePais(lista())].sort()).toEqual(['001', '001.08', '001.08.04', '001.08.05']);
  });

  it('lista vazia ou ausente não tem pais', () => {
    expect(conjuntoDePais([]).size).toBe(0);
    expect(conjuntoDePais(undefined).size).toBe(0);
  });
});

describe('calcularTotaisItens', () => {
  // Planilha importada: os grupos (001, 002) vêm com quantidade e valor unitário próprios,
  // que não valem nada: o total do grupo é a soma das folhas.
  const importada = () => [
    { id: 1, codigo: '001', nome: 'EDIFICAÇÃO', quantidade: 1, valor_unitario: 999 },
    { id: 2, codigo: '001.01', nome: 'Alvenaria', quantidade: 10, valor_unitario: 100 },
    { id: 3, codigo: '001.02', nome: 'Pintura', quantidade: 5, valor_unitario: 40 },
    { id: 4, codigo: '002', nome: 'INSTALAÇÕES', quantidade: 1, valor_unitario: 777 },
    { id: 5, codigo: '002.01', nome: 'Elétrica', quantidade: 2, valor_unitario: 250 },
  ];
  const totalDe = (l, codigo) => l.find(i => i.codigo === codigo).valor_total;

  it('folha = quantidade x valor unitário', () => {
    const r = calcularTotaisItens(importada());
    expect(totalDe(r, '001.01')).toBe(1000);
    expect(totalDe(r, '002.01')).toBe(500);
  });

  it('grupo = soma dos filhos, ignorando a quantidade e o valor da própria linha (BUG-014)', () => {
    const r = calcularTotaisItens(importada());
    expect(totalDe(r, '001')).toBe(1200);
    expect(totalDe(r, '002')).toBe(500);
  });

  it('o total geral (raízes) é a soma das folhas, também na primeira importação', () => {
    // Regressão: o cálculo usava os pais da lista ANTERIOR (vazia), tratava 001 e 002 como
    // folha e gravava 999 + 777 = 1776 em orcamentos.valor.
    const r = calcularTotaisItens(importada());
    const geral = r.filter(i => !i.codigo.includes('.')).reduce((s, i) => s + i.valor_total, 0);
    expect(geral).toBe(1700);
  });

  it('não guarda estado entre chamadas: lista nova, pais novos', () => {
    calcularTotaisItens([{ id: 9, codigo: '009', quantidade: 3, valor_unitario: 2 }]);
    const r = calcularTotaisItens(importada());
    expect(totalDe(r, '001')).toBe(1200);
  });

  it('soma vários níveis de baixo para cima', () => {
    const l = [
      { id: 1, codigo: '001', quantidade: 0, valor_unitario: 0 },
      { id: 2, codigo: '001.01', quantidade: 0, valor_unitario: 0 },
      { id: 3, codigo: '001.01.01', quantidade: 2, valor_unitario: 10 },
      { id: 4, codigo: '001.01.02', quantidade: 1, valor_unitario: 5 },
      { id: 5, codigo: '001.02', quantidade: 4, valor_unitario: 1 },
    ];
    const r = calcularTotaisItens(l);
    expect(totalDe(r, '001.01')).toBe(25);
    expect(totalDe(r, '001')).toBe(29);
  });

  it('arredonda para centavos por linha antes de somar', () => {
    const l = [
      { id: 1, codigo: '001', quantidade: 0, valor_unitario: 0 },
      { id: 2, codigo: '001.01', quantidade: 1, valor_unitario: 0.1 },
      { id: 3, codigo: '001.02', quantidade: 1, valor_unitario: 0.2 },
    ];
    expect(totalDe(calcularTotaisItens(l), '001')).toBe(0.3);
  });

  it('quantidade ou valor ausente vira zero e não quebra', () => {
    const l = [{ id: 1, codigo: '001', quantidade: null }, { id: 2, codigo: '002', valor_unitario: 'abc' }];
    const r = calcularTotaisItens(l);
    expect(r.map(i => i.valor_total)).toEqual([0, 0]);
  });

  it('mantém a ordem e os demais campos, e não altera a lista original', () => {
    const original = importada();
    const copia = JSON.parse(JSON.stringify(original));
    const r = calcularTotaisItens(original);
    expect(r.map(i => i.id)).toEqual([1, 2, 3, 4, 5]);
    expect(r[1].nome).toBe('Alvenaria');
    expect(original).toEqual(copia);
  });

  it('lista vazia ou ausente devolve lista vazia', () => {
    expect(calcularTotaisItens([])).toEqual([]);
    expect(calcularTotaisItens(undefined)).toEqual([]);
  });
});
