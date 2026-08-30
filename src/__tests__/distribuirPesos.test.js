import { describe, it, expect } from 'vitest';
import {
  buildChildrenMap,
  flattenTree,
  folhaTravada,
  noTravado,
  redistribuirPorValor,
} from '../modules/financeiro/distribuirPesos';
import { computeValorVinculadoMap } from '../modules/cronograma/ganttUtils';

// Árvore de referência, no formato de "Instalações elétricas" da tela real:
//   G  (grupo, R$ 1.000 vinculados)
//   ├─ SG1 (subgrupo)   ├─ L1  └─ L2
//   ├─ SG2 (subgrupo)   └─ L3
//   └─ L4 (folha solta)
const etapa = (id, parentId, nivel, extra = {}) => ({
  id, parentId, nivel, etapa: id, fator_peso: 1, avanco: 0, valorVinculadoFixo: null, ...extra,
});

const arvore = () => [
  etapa('G', null, 0),
  etapa('SG1', 'G', 1),
  etapa('L1', 'SG1', 2),
  etapa('L2', 'SG1', 2),
  etapa('SG2', 'G', 1),
  etapa('L3', 'SG2', 2),
  etapa('L4', 'G', 1),
];

const vinculos = [{ etapa_id: 'G', orcamento_item_id: 'I1' }];
const itens = { I1: 1000 };

const valores = (etapas) => computeValorVinculadoMap(etapas, vinculos, itens);
const soma = (obj, ids) => ids.reduce((s, id) => s + (obj[id] || 0), 0);

describe('buildChildrenMap / flattenTree', () => {
  it('inclui os grupos intermediários, não só as folhas', () => {
    const ids = flattenTree('G', buildChildrenMap(arvore())).map(n => n.etapa.id);
    expect(ids).toEqual(['SG1', 'L1', 'L2', 'SG2', 'L3', 'L4']);
  });

  it('marca temFilhos e a profundidade relativa ao grupo', () => {
    const linhas = flattenTree('G', buildChildrenMap(arvore()));
    const por = Object.fromEntries(linhas.map(n => [n.etapa.id, n]));
    expect(por.SG1.temFilhos).toBe(true);
    expect(por.SG1.depth).toBe(0);
    expect(por.L1.temFilhos).toBe(false);
    expect(por.L1.depth).toBe(1);
  });

  it('para de descer nos ids colapsados', () => {
    const ids = flattenTree('G', buildChildrenMap(arvore()), new Set(['SG1']))
      .map(n => n.etapa.id);
    expect(ids).toEqual(['SG1', 'SG2', 'L3', 'L4']);
  });

  it('não entra em laço se o parentId estiver corrompido em ciclo', () => {
    const etapas = [etapa('A', 'B', 1), etapa('B', 'A', 1)];
    expect(() => flattenTree('A', buildChildrenMap(etapas))).not.toThrow();
  });

  it('a soma dos filhos diretos bate com o valor do grupo', () => {
    const etapas = arvore();
    const v = valores(etapas);
    const diretos = buildChildrenMap(etapas).get('G').map(e => e.id);
    expect(soma(v, diretos)).toBeCloseTo(1000, 6);
    expect(v.SG1).toBeCloseTo(1000 / 3, 6); // um peso de subgrupo vale por toda a subárvore
  });
});

describe('travamento', () => {
  it('folha trava por avanço 100 ou por valor congelado', () => {
    expect(folhaTravada(etapa('X', 'G', 1, { avanco: 100 }))).toBe(true);
    expect(folhaTravada(etapa('X', 'G', 1, { valorVinculadoFixo: 500 }))).toBe(true);
    expect(folhaTravada(etapa('X', 'G', 1))).toBe(false);
  });

  it('grupo NÃO trava pelo avanço derivado, só se todas as folhas estiverem travadas', () => {
    const etapas = arvore();
    const childrenOf = buildChildrenMap(etapas);
    // recomputeHierarchy deriva o avanco do grupo como média dos filhos: 100 aqui
    const sg1 = { ...etapas[1], avanco: 100 };
    expect(noTravado(sg1, childrenOf)).toBe(false);
  });

  it('grupo trava quando toda folha descendente está travada', () => {
    const etapas = arvore().map(e =>
      e.id === 'L1' || e.id === 'L2' ? { ...e, avanco: 100 } : e
    );
    const childrenOf = buildChildrenMap(etapas);
    expect(noTravado(childrenOf.get('G')[0], childrenOf)).toBe(true);  // SG1
    expect(noTravado(childrenOf.get('G')[1], childrenOf)).toBe(false); // SG2
  });
});

describe('redistribuirPorValor', () => {
  const cenario = (etapas = arvore()) => {
    const childrenOf = buildChildrenMap(etapas);
    const v = valores(etapas);
    return {
      etapas,
      childrenOf,
      valorPorNo: v,
      irmaos: childrenOf.get('G'),
      pesos: Object.fromEntries(etapas.map(e => [e.id, String(e.fator_peso)])),
    };
  };

  // Aplica o patch e recalcula pelo mesmo motor que a tela usa
  const aplicar = (c, patch) => valores(
    c.etapas.map(e => (patch[e.id] != null ? { ...e, fator_peso: parseFloat(patch[e.id]) } : e))
  );

  it('dá ao alvo o valor digitado e reparte o resto entre os irmãos', () => {
    const c = cenario();
    const patch = redistribuirPorValor({
      irmaos: c.irmaos, alvoId: 'SG1', valorAlvo: 500, valorPai: 1000,
      valorPorNo: c.valorPorNo, pesos: c.pesos,
    });
    const v = aplicar(c, patch);
    expect(v.SG1).toBeCloseTo(500, 6);
    expect(v.SG2).toBeCloseTo(250, 6);
    expect(v.L4).toBeCloseTo(250, 6);
    expect(soma(v, ['SG1', 'SG2', 'L4'])).toBeCloseTo(1000, 6);
  });

  it('mantém a proporção que os outros irmãos já tinham entre si', () => {
    const etapas = arvore().map(e =>
      e.id === 'SG2' ? { ...e, fator_peso: 3 } : e // SG2 vale 3x L4
    );
    const c = cenario(etapas);
    const patch = redistribuirPorValor({
      irmaos: c.irmaos, alvoId: 'SG1', valorAlvo: 200, valorPai: 1000,
      valorPorNo: c.valorPorNo, pesos: c.pesos,
    });
    const v = aplicar(c, patch);
    expect(v.SG1).toBeCloseTo(200, 6);
    expect(v.SG2 / v.L4).toBeCloseTo(3, 6);
    expect(soma(v, ['SG1', 'SG2', 'L4'])).toBeCloseTo(1000, 6);
  });

  it('não mexe na divisão interna do subgrupo — as folhas seguem a proporção', () => {
    const etapas = arvore().map(e => (e.id === 'L2' ? { ...e, fator_peso: 3 } : e));
    const c = cenario(etapas);
    const patch = redistribuirPorValor({
      irmaos: c.irmaos, alvoId: 'SG1', valorAlvo: 800, valorPai: 1000,
      valorPorNo: c.valorPorNo, pesos: c.pesos,
    });
    const v = aplicar(c, patch);
    expect(v.SG1).toBeCloseTo(800, 6);
    expect(v.L1).toBeCloseTo(200, 6); // 1/4 de 800
    expect(v.L2).toBeCloseTo(600, 6); // 3/4 de 800
  });

  it('faz clamp quando o valor digitado passa do disponível', () => {
    const c = cenario();
    const patch = redistribuirPorValor({
      irmaos: c.irmaos, alvoId: 'SG1', valorAlvo: 5000, valorPai: 1000,
      valorPorNo: c.valorPorNo, pesos: c.pesos,
    });
    const v = aplicar(c, patch);
    expect(v.SG1).toBeCloseTo(1000, 6);
    expect(v.SG2 || 0).toBeCloseTo(0, 6);
    expect(v.L4 || 0).toBeCloseTo(0, 6);
  });

  it('trata valor negativo como zero', () => {
    const c = cenario();
    const patch = redistribuirPorValor({
      irmaos: c.irmaos, alvoId: 'SG1', valorAlvo: -300, valorPai: 1000,
      valorPorNo: c.valorPorNo, pesos: c.pesos,
    });
    expect(parseFloat(patch.SG1)).toBe(0);
    const v = aplicar(c, patch);
    expect(soma(v, ['SG2', 'L4'])).toBeCloseTo(1000, 6);
  });

  it('irmão com valor congelado fica fora do rateio', () => {
    const etapas = arvore().map(e =>
      e.id === 'L4' ? { ...e, valorVinculadoFixo: 400, avanco: 100 } : e
    );
    const c = cenario(etapas);
    const patch = redistribuirPorValor({
      irmaos: c.irmaos, alvoId: 'SG1', valorAlvo: 200, valorPai: 1000,
      valorPorNo: c.valorPorNo, pesos: c.pesos,
    });
    expect(patch.L4).toBeUndefined();
    const v = aplicar(c, patch);
    expect(v.L4).toBeCloseTo(400, 6);   // congelado, intacto
    expect(v.SG1).toBeCloseTo(200, 6);
    expect(v.SG2).toBeCloseTo(400, 6);  // 600 disponíveis - 200 do alvo
  });

  it('divide igualmente quando os outros irmãos estão todos zerados', () => {
    const etapas = arvore().map(e =>
      e.id === 'SG2' || e.id === 'L4' ? { ...e, fator_peso: 0 } : e
    );
    const c = cenario(etapas);
    const patch = redistribuirPorValor({
      irmaos: c.irmaos, alvoId: 'SG1', valorAlvo: 600, valorPai: 1000,
      valorPorNo: c.valorPorNo, pesos: c.pesos,
    });
    const v = aplicar(c, patch);
    expect(v.SG1).toBeCloseTo(600, 6);
    expect(v.SG2).toBeCloseTo(200, 6);
    expect(v.L4).toBeCloseTo(200, 6);
  });

  it('recusa quando não há grau de liberdade ou dinheiro a repartir', () => {
    const c = cenario();
    // um único irmão aberto sempre recebe tudo
    expect(redistribuirPorValor({
      irmaos: [c.irmaos[0]], alvoId: 'SG1', valorAlvo: 100, valorPai: 1000,
      valorPorNo: c.valorPorNo, pesos: c.pesos,
    })).toBeNull();
    // grupo sem valor nenhum
    expect(redistribuirPorValor({
      irmaos: c.irmaos, alvoId: 'SG1', valorAlvo: 100, valorPai: 0,
      valorPorNo: c.valorPorNo, pesos: c.pesos,
    })).toBeNull();
    // alvo fora do conjunto de irmãos
    expect(redistribuirPorValor({
      irmaos: c.irmaos, alvoId: 'L1', valorAlvo: 100, valorPai: 1000,
      valorPorNo: c.valorPorNo, pesos: c.pesos,
    })).toBeNull();
  });

  it('preserva a soma dos pesos do conjunto (não vira fração minúscula)', () => {
    const c = cenario();
    const patch = redistribuirPorValor({
      irmaos: c.irmaos, alvoId: 'SG1', valorAlvo: 500, valorPai: 1000,
      valorPorNo: c.valorPorNo, pesos: c.pesos,
    });
    const somaPesos = Object.values(patch).reduce((s, p) => s + parseFloat(p), 0);
    expect(somaPesos).toBeCloseTo(3, 6); // três irmãos de peso 1
    expect(parseFloat(patch.SG1)).toBeCloseTo(1.5, 6);
  });

  describe('cadeado (peso_travado)', () => {
    // Pesos como na tela real: Laje = 22, Alvenaria = 21, resto = 1. Trava a Laje.
    const comTravas = () => cenario(arvore().map(e =>
      e.id === 'SG1' ? { ...e, fator_peso: 22 }
        : e.id === 'SG2' ? { ...e, fator_peso: 21 }
        : e
    ));
    const travas = new Set(['SG1']);

    it('irmã travada mantém peso E valor quando o R$ de outra é editado', () => {
      const c = comTravas();
      const patch = redistribuirPorValor({
        irmaos: c.irmaos, alvoId: 'L4', valorAlvo: 30, valorPai: 1000,
        valorPorNo: c.valorPorNo, pesos: c.pesos, travas,
      });
      expect(patch).not.toBeNull();
      const v = aplicar(c, patch);
      expect(v.SG1).toBeCloseTo(c.valorPorNo.SG1, 6);
      expect(v.L4).toBeCloseTo(30, 6);
    });

    it('sem o cadeado, a mesma edição moveria a linha — é o bug que motivou a trava', () => {
      const c = comTravas();
      const patch = redistribuirPorValor({
        irmaos: c.irmaos, alvoId: 'L4', valorAlvo: 30, valorPai: 1000,
        valorPorNo: c.valorPorNo, pesos: c.pesos, // sem travas
      });
      const v = aplicar(c, patch);
      expect(v.SG1).not.toBeCloseTo(c.valorPorNo.SG1, 2);
    });

    it('o patch não contém as linhas travadas', () => {
      const c = comTravas();
      const patch = redistribuirPorValor({
        irmaos: c.irmaos, alvoId: 'L4', valorAlvo: 30, valorPai: 1000,
        valorPorNo: c.valorPorNo, pesos: c.pesos, travas,
      });
      expect(patch.SG1).toBeUndefined();
      expect(patch.SG2).toBeDefined();
      expect(patch.L4).toBeDefined();
    });

    it('a soma dos irmãos continua igual ao valor do pai', () => {
      const c = comTravas();
      const patch = redistribuirPorValor({
        irmaos: c.irmaos, alvoId: 'L4', valorAlvo: 12, valorPai: 1000,
        valorPorNo: c.valorPorNo, pesos: c.pesos, travas,
      });
      const v = aplicar(c, patch);
      expect(soma(v, ['SG1', 'SG2', 'L4'])).toBeCloseTo(1000, 6);
    });

    it('o teto do alvo é só o dinheiro dos livres, não o do pai', () => {
      // SG1 travada com peso 22 de um total 24 → leva R$ 916,67 e não sai de lá.
      // Livres (SG2 e L4) dividem só os R$ 83,33 restantes; pedir 900 satura nisso.
      const c = cenario(arvore().map(e => (e.id === 'SG1' ? { ...e, fator_peso: 22 } : e)));
      const patch = redistribuirPorValor({
        irmaos: c.irmaos, alvoId: 'L4', valorAlvo: 900, valorPai: 1000,
        valorPorNo: c.valorPorNo, pesos: c.pesos, travas: new Set(['SG1']),
      });
      const v = aplicar(c, patch);
      expect(v.SG1).toBeCloseTo(c.valorPorNo.SG1, 6);   // travada, intacta
      expect(v.L4).toBeCloseTo(1000 - v.SG1, 6);        // clampado no teto dos livres
      expect(v.SG2 || 0).toBeCloseTo(0, 6);
      expect(soma(v, ['SG1', 'SG2', 'L4'])).toBeCloseTo(1000, 6);
    });

    it('recusa quando o alvo está travado', () => {
      const c = comTravas();
      expect(redistribuirPorValor({
        irmaos: c.irmaos, alvoId: 'SG1', valorAlvo: 100, valorPai: 1000,
        valorPorNo: c.valorPorNo, pesos: c.pesos, travas,
      })).toBeNull();
    });

    it('recusa quando sobra menos de dois livres', () => {
      const c = comTravas();
      // SG1 e SG2 travadas: só L4 fica livre, e ele recebe o restante por definição
      expect(redistribuirPorValor({
        irmaos: c.irmaos, alvoId: 'L4', valorAlvo: 100, valorPai: 1000,
        valorPorNo: c.valorPorNo, pesos: c.pesos, travas: new Set(['SG1', 'SG2']),
      })).toBeNull();
    });

    it('cadeado e congelamento por conclusão convivem no mesmo conjunto', () => {
      // Quatro irmãs: L4 congelada na conclusão, SG1 no cadeado, SG2 e L5 livres
      const etapas = [
        ...arvore().map(e => (e.id === 'L4' ? { ...e, valorVinculadoFixo: 400, avanco: 100 } : e)),
        etapa('L5', 'G', 1),
      ];
      const c = cenario(etapas);
      const patch = redistribuirPorValor({
        irmaos: c.irmaos, alvoId: 'SG2', valorAlvo: 100, valorPai: 1000,
        valorPorNo: c.valorPorNo, pesos: c.pesos, travas: new Set(['SG1']),
      });
      const v = aplicar(c, patch);
      expect(patch.SG1).toBeUndefined();
      expect(v.L4).toBeCloseTo(400, 6);                 // congelada na conclusão
      expect(v.SG1).toBeCloseTo(200, 6);                // travada no cadeado, 1/3 dos 600
      expect(v.SG2).toBeCloseTo(100, 6);                // valor digitado
      expect(v.L5).toBeCloseTo(300, 6);                 // absorve o restante
      expect(soma(v, ['SG1', 'SG2', 'L4', 'L5'])).toBeCloseTo(1000, 6);
    });

    it('lê peso_travado da etapa quando o modal não passa travas', () => {
      const etapas = arvore().map(e => (e.id === 'SG1' ? { ...e, peso_travado: true } : e));
      const c = cenario(etapas);
      const patch = redistribuirPorValor({
        irmaos: c.irmaos, alvoId: 'SG2', valorAlvo: 500, valorPai: 1000,
        valorPorNo: c.valorPorNo, pesos: c.pesos,
      });
      expect(patch.SG1).toBeUndefined();
      const v = aplicar(c, patch);
      expect(v.SG1).toBeCloseTo(c.valorPorNo.SG1, 6);
    });
  });

  it('ida e volta é estável: redigitar o mesmo valor não move nada', () => {
    const c = cenario();
    const p1 = redistribuirPorValor({
      irmaos: c.irmaos, alvoId: 'SG1', valorAlvo: 430, valorPai: 1000,
      valorPorNo: c.valorPorNo, pesos: c.pesos,
    });
    const v1 = aplicar(c, p1);
    const p2 = redistribuirPorValor({
      irmaos: c.irmaos, alvoId: 'SG1', valorAlvo: 430, valorPai: 1000,
      valorPorNo: v1, pesos: { ...c.pesos, ...p1 },
    });
    const v2 = aplicar(c, p2);
    ['SG1', 'SG2', 'L4'].forEach(id => expect(v2[id]).toBeCloseTo(v1[id], 6));
  });
});
