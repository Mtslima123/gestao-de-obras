import { describe, it, expect } from 'vitest';
import { ancestraisDe, filtrarComSubarvore, folhasDaSubarvore, agruparVinculosPorGrupo } from '../modules/financeiro/itensHierarquia';

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

// ─── agruparVinculosPorGrupo ──────────────────────────────────────────────────
// Itens do orçamento (fonte do nome dos grupos) e vínculos (cada um com o item aninhado,
// como vem do vinculoService). O valor é fixo por item só para os subtotais serem conferíveis.
describe('agruparVinculosPorGrupo', () => {
  const valorDe = (it) => it?.valor_total || 0;
  const orc = (id, codigo, nome, valor = 0, orcamento_id = 1) => ({ id, codigo, nome, valor_total: valor, orcamento_id });
  const vinc = (id, item) => ({ id: `v${id}`, orcamento_item_id: item?.id ?? null, orcamento_itens: item ?? null });

  const itens = [
    orc(1, '001', 'SMK'),
    orc(2, '001.07', 'INSTALAÇÕES'),
    orc(3, '001.07.2', 'ELÉTRICA'),
    orc(4, '001.07.10', 'ELEVADORES'),
    orc(5, '001.07.2.01', 'TOMADAS', 100),
    orc(6, '001.07.2.02', 'CABOS', 50),
    orc(7, '001.07.10.01', 'MANUTENÇÃO ELEVADOR', 36000),
  ];
  const doOrc = (codigo) => itens.find(i => i.codigo === codigo);
  const codigosDe = (g) => g.vinculos.map(v => v.orcamento_itens?.codigo);

  it('agrupa pelo pai imediato e ordena grupos e itens pelo código (numérico)', () => {
    // Entrada fora de ordem, como na tela real; 001.07.10 só pode vir depois de 001.07.2
    const vs = [vinc(1, doOrc('001.07.10.01')), vinc(2, doOrc('001.07.2.02')), vinc(3, doOrc('001.07.2.01'))];
    const grupos = agruparVinculosPorGrupo(vs, itens, valorDe);
    expect(grupos.map(g => g.codigo)).toEqual(['001.07.2', '001.07.10']);
    expect(codigosDe(grupos[0])).toEqual(['001.07.2.01', '001.07.2.02']);
    expect(codigosDe(grupos[1])).toEqual(['001.07.10.01']);
  });

  it('traz nome do grupo, contagem e subtotal', () => {
    const vs = [vinc(1, doOrc('001.07.2.01')), vinc(2, doOrc('001.07.2.02')), vinc(3, doOrc('001.07.10.01'))];
    const [eletrica, elevadores] = agruparVinculosPorGrupo(vs, itens, valorDe);
    expect(eletrica).toMatchObject({ codigo: '001.07.2', nome: 'ELÉTRICA', valor: 150 });
    expect(eletrica.vinculos).toHaveLength(2);
    expect(elevadores).toMatchObject({ codigo: '001.07.10', nome: 'ELEVADORES', valor: 36000 });
  });

  it('guarda a cadeia de resumos acima do grupo para o tooltip', () => {
    const [g] = agruparVinculosPorGrupo([vinc(1, doOrc('001.07.2.01'))], itens, valorDe);
    expect(g.caminho).toBe('001 SMK › 001.07 INSTALAÇÕES');
  });

  it('pai imediato inexistente sobe ao ancestral mais próximo que existe', () => {
    // 001.07.9 não existe no orçamento: o item cai em 001.07
    const solto = orc(20, '001.07.9.01', 'ITEM ÓRFÃO', 10);
    const [g] = agruparVinculosPorGrupo([vinc(1, solto)], [...itens, solto], valorDe);
    expect(g).toMatchObject({ codigo: '001.07', nome: 'INSTALAÇÕES' });
  });

  it('sem grupo identificável vai para "Sem grupo", por último, e nenhum vínculo some', () => {
    const raiz = orc(30, '999', 'RAIZ SOLTA', 5);               // sem ponto: não tem ancestral
    const semAncestral = orc(31, '777.01.01', 'SEM PAI', 7);    // nenhum ancestral existe
    const semCodigo = { id: 32, codigo: null, nome: 'SEM CÓDIGO', valor_total: 3, orcamento_id: 1 };
    const vs = [
      vinc(1, raiz), vinc(2, doOrc('001.07.2.01')), vinc(3, semAncestral), vinc(4, semCodigo),
      vinc(5, null), // item do orçamento apagado ("Item removido")
    ];
    const grupos = agruparVinculosPorGrupo(vs, [...itens, raiz, semAncestral, semCodigo], valorDe);
    expect(grupos.map(g => g.codigo)).toEqual(['001.07.2', null]);
    const sem = grupos[1];
    expect(sem).toMatchObject({ chave: 'sem-grupo', nome: null, caminho: '' });
    expect(sem.vinculos).toHaveLength(4);
    expect(sem.valor).toBe(5 + 7 + 3);
    expect(grupos.reduce((n, g) => n + g.vinculos.length, 0)).toBe(vs.length);
  });

  it('não mistura o mesmo código de orçamentos diferentes', () => {
    const a = [orc(1, '001', 'GRUPO A', 0, 1), orc(2, '001.01', 'FOLHA A', 10, 1)];
    const b = [orc(3, '001', 'GRUPO B', 0, 2), orc(4, '001.01', 'FOLHA B', 20, 2)];
    const grupos = agruparVinculosPorGrupo([vinc(1, a[1]), vinc(2, b[1])], [...a, ...b], valorDe);
    expect(grupos.map(g => g.nome)).toEqual(['GRUPO A', 'GRUPO B']);
    expect(grupos.map(g => g.valor)).toEqual([10, 20]);
  });

  it('listas vazias ou ausentes devolvem []', () => {
    expect(agruparVinculosPorGrupo([], itens, valorDe)).toEqual([]);
    expect(agruparVinculosPorGrupo(undefined, undefined, valorDe)).toEqual([]);
  });
});
