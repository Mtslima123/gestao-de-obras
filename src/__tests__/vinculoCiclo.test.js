// Vínculo cruzado (ciclo) é recusado como no MS Project: A não depende de B se B já depende de A, nem por
// cadeia, e uma tarefa não depende do grupo a que pertence. Ciclo que já existia nos dados não conta.
import { describe, it, expect } from 'vitest';
import {
  criaCiclo, mensagemDeCiclo, resumoDeCiclos, idsEmCiclo, ciclosNovos, mensagemDeCiclosNovos,
  depsRecusadosPorCiclo, applyFieldToEtapa, aplicarVinculosEmLote,
} from '../modules/cronograma/scheduleEngine';

const dep = (...ids) => ids.map(id => ({ id, tipo: 'TI', lag: 0 }));
const t = (id, extra = {}) => ({ id, etapa: id, isGroup: false, parentId: null, dep: [], ...extra });

describe('criaCiclo', () => {
  it('ligação mútua direta: a predecessora já depende da sucessora', () => {
    const et = [t('A'), t('B', { dep: dep('A') })];
    // "A passa a depender de B", mas B já depende de A
    expect(criaCiclo(et, 'A', 'B')).toEqual({ tipo: 'mutuo', caminho: ['A', 'B'] });
  });

  it('ciclo por cadeia de 3: devolve o caminho que já existia', () => {
    const et = [t('A'), t('B', { dep: dep('A') }), t('C', { dep: dep('B') })];
    expect(criaCiclo(et, 'A', 'C')).toEqual({ tipo: 'ciclo', caminho: ['A', 'B', 'C'] });
  });

  it('vínculo válido (mesmo sentido, losango, paralelas) não é ciclo', () => {
    const et = [t('A'), t('B', { dep: dep('A') }), t('C', { dep: dep('A') }), t('D', { dep: dep('B', 'C') }), t('E')];
    expect(criaCiclo(et, 'D', 'A')).toBeNull(); // já ligadas no mesmo sentido: não é ciclo
    expect(criaCiclo(et, 'E', 'D')).toBeNull();
    expect(criaCiclo(et, 'C', 'B')).toBeNull(); // paralelas ligadas entre si
    expect(criaCiclo(et, 'A', 'E')).toBeNull();
  });

  it('autoligação e ids vazios não são tratados aqui', () => {
    const et = [t('A')];
    expect(criaCiclo(et, 'A', 'A')).toBeNull();
    expect(criaCiclo(et, '', 'A')).toBeNull();
  });

  it('folha ligada ao grupo a que pertence: hierarquia', () => {
    const et = [t('G', { isGroup: true }), t('SG', { isGroup: true, parentId: 'G' }), t('F', { parentId: 'SG' })];
    expect(criaCiclo(et, 'F', 'G')).toEqual({ tipo: 'hierarquia', caminho: ['F', 'SG', 'G'] });
    expect(criaCiclo(et, 'F', 'SG').tipo).toBe('hierarquia');
  });

  it('X depende do grupo cuja filha depende de X: ciclo pelo envelope do grupo', () => {
    const et = [t('X'), t('G', { isGroup: true }), t('Y', { parentId: 'G', dep: dep('X') })];
    expect(criaCiclo(et, 'X', 'G')).toEqual({ tipo: 'ciclo', caminho: ['X', 'Y', 'G'] });
  });

  it('o dep do próprio grupo é ignorado, como no agendador', () => {
    const et = [t('X', { dep: dep('G') }), t('G', { isGroup: true, dep: dep('X') })];
    expect(criaCiclo(et, 'X', 'G')).toBeNull();
    expect(idsEmCiclo(et).size).toBe(0);
  });
});

describe('mensagens', () => {
  const et = [t('A'), t('B', { dep: dep('A') }), t('C', { dep: dep('B') })];

  it('ligação mútua usa o texto do Project', () => {
    expect(mensagemDeCiclo(et, { tipo: 'mutuo', caminho: ['A', 'B'] })).toBe('Estas tarefas já estão vinculadas entre si.');
  });

  it('hierarquia', () => {
    expect(mensagemDeCiclo(et, { tipo: 'hierarquia', caminho: ['B', 'A'] })).toBe('Uma tarefa não pode ser vinculada ao grupo a que pertence.');
  });

  it('ciclo por cadeia cita as linhas da calha e fecha a volta', () => {
    expect(mensagemDeCiclo(et, criaCiclo(et, 'A', 'C'))).toBe('Vínculo recusado: criaria um ciclo (linhas 1, 2, 3, 1).');
  });

  it('cadeia muito longa é abreviada', () => {
    const longa = Array.from({ length: 12 }, (_, i) => t('T' + i, i ? { dep: dep('T' + (i - 1)) } : {}));
    const msg = mensagemDeCiclo(longa, criaCiclo(longa, 'T0', 'T11'));
    expect(msg).toBe('Vínculo recusado: criaria um ciclo (linhas 1, 2, 3, …, 11, 12, 1).');
  });

  it('vários recusados: conta e mostra a primeira mensagem', () => {
    const r = [
      { succId: 'A', predId: 'B', ciclo: { tipo: 'mutuo', caminho: ['A', 'B'] } },
      { succId: 'A', predId: 'C', ciclo: { tipo: 'ciclo', caminho: ['A', 'B', 'C'] } },
    ];
    expect(resumoDeCiclos(et, r)).toBe('2 vínculos recusados por criarem ciclo. Estas tarefas já estão vinculadas entre si.');
    expect(resumoDeCiclos(et, r.slice(0, 1))).toBe('Estas tarefas já estão vinculadas entre si.');
    expect(resumoDeCiclos(et, [])).toBe('');
  });
});

describe('Predecessora (applyFieldToEtapa e depsRecusadosPorCiclo)', () => {
  // linhas da calha: A=1, B=2, C=3
  const et = [t('A'), t('B', { dep: dep('A') }), t('C')];

  it('digitar na A a linha da B (que já depende da A) descarta o vínculo e o aviso o aponta', () => {
    expect(applyFieldToEtapa(et[0], 'dep', '2', et).dep).toEqual([]);
    const r = depsRecusadosPorCiclo(et, 'A', '2');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ succId: 'A', predId: 'B', ciclo: { tipo: 'mutuo' } });
  });

  it('vínculo válido digitado continua entrando', () => {
    expect(applyFieldToEtapa(et[2], 'dep', '2', et).dep).toEqual(dep('B'));
    expect(depsRecusadosPorCiclo(et, 'C', '2')).toEqual([]);
  });

  it('mistura: o válido entra e só o cruzado é descartado', () => {
    expect(applyFieldToEtapa(et[0], 'dep', '2; 3', et).dep).toEqual(dep('C'));
  });

  it('dado antigo em ciclo não some quando a célula é regravada', () => {
    const velho = [t('A', { dep: dep('B') }), t('B', { dep: dep('A') })];
    expect(applyFieldToEtapa(velho[0], 'dep', '2', velho).dep).toEqual(dep('B'));
    expect(depsRecusadosPorCiclo(velho, 'A', '2')).toEqual([]);
  });
});

describe('aplicarVinculosEmLote com ciclo', () => {
  it('A->B e B->A no mesmo lote: entra um, o outro é recusado', () => {
    const et = [t('A'), t('B')];
    const r = aplicarVinculosEmLote(et, { novos: [['B', 'A'], ['A', 'B']] });
    expect(r.criados).toBe(1);
    expect(r.ciclos).toHaveLength(1);
    expect(r.ciclos[0].ciclo.tipo).toBe('mutuo');
    const deps = Object.fromEntries(r.etapas.map(e => [e.id, e.dep.map(d => d.id)]));
    expect(deps.A.length + deps.B.length).toBe(1);
  });

  it('vínculo que fecha ciclo com o que já existe é pulado, o resto entra', () => {
    const et = [t('A'), t('B', { dep: dep('A') }), t('C')];
    const r = aplicarVinculosEmLote(et, { novos: [['A', 'B'], ['C', 'B']] });
    expect(r.criados).toBe(1);
    expect(r.ciclos).toHaveLength(1);
    expect(r.etapas.find(e => e.id === 'A').dep).toEqual([]);
    expect(r.etapas.find(e => e.id === 'C').dep).toEqual(dep('B'));
  });

  it('tudo recusado devolve o mesmo array', () => {
    const et = [t('A'), t('B', { dep: dep('A') })];
    const r = aplicarVinculosEmLote(et, { novos: [['A', 'B']] });
    expect(r.etapas).toBe(et);
    expect(r.criados).toBe(0);
    expect(r.ciclos).toHaveLength(1);
  });

  it('tirar A->B e criar B->A no mesmo lote vale em qualquer ordem das tarefas', () => {
    // B depende de A; o lote remove isso e faz A depender de B
    const et = [t('A'), t('B', { dep: dep('A') })];
    const r = aplicarVinculosEmLote(et, { novos: [['A', 'B']], edicoes: { B: { A: { remover: true } } } });
    expect(r.ciclos).toEqual([]);
    expect(r.criados).toBe(1);
    expect(r.removidos).toBe(1);
    expect(r.etapas.find(e => e.id === 'A').dep).toEqual(dep('B'));
    expect(r.etapas.find(e => e.id === 'B').dep).toEqual([]);
  });

  it('troca de predecessora que fecha ciclo fica como era', () => {
    // C depende de A; B depende de C. Trocar a predecessora de C para B fecharia o ciclo C<->B.
    const et = [t('A'), t('B', { dep: dep('C') }), t('C', { dep: dep('A') })];
    const r = aplicarVinculosEmLote(et, { edicoes: { C: { A: { predId: 'B' } } } });
    expect(r.ciclos).toHaveLength(1);
    expect(r.alterados).toBe(0);
    expect(r.etapas).toBe(et);
  });

  it('troca de predecessora válida continua funcionando', () => {
    const et = [t('A'), t('B'), t('C', { dep: dep('A') })];
    const r = aplicarVinculosEmLote(et, { edicoes: { C: { A: { predId: 'B' } } } });
    expect(r.ciclos).toEqual([]);
    expect(r.alterados).toBe(1);
    expect(r.etapas.find(e => e.id === 'C').dep).toEqual(dep('B'));
  });

  it('cadeia grande em sequência sem ciclo entra inteira', () => {
    const et = Array.from({ length: 50 }, (_, i) => t('T' + i));
    const novos = et.slice(1).map((e, i) => [e.id, 'T' + i]);
    const r = aplicarVinculosEmLote(et, { novos });
    expect(r.criados).toBe(49);
    expect(r.ciclos).toEqual([]);
  });
});

describe('ciclosNovos / idsEmCiclo', () => {
  it('ciclo que já existia não conta', () => {
    const antes = [t('A', { dep: dep('B') }), t('B', { dep: dep('A') }), t('C')];
    const depois = [t('A', { dep: dep('B') }), t('B', { dep: dep('A') }), t('C', { dep: dep('A') })];
    expect([...idsEmCiclo(antes)].sort()).toEqual(['A', 'B']);
    expect(ciclosNovos(antes, depois)).toEqual([]);
  });

  it('ciclo novo é apontado na ordem da lista', () => {
    const antes = [t('C'), t('D', { dep: dep('C') }), t('E')];
    const depois = [t('C', { dep: dep('D') }), t('D', { dep: dep('C') }), t('E')];
    expect(ciclosNovos(antes, depois)).toEqual(['C', 'D']);
  });

  it('cadeia fechada por 3 tarefas, e quem só depende do ciclo não entra nele', () => {
    const et = [t('A', { dep: dep('C') }), t('B', { dep: dep('A') }), t('C', { dep: dep('B') }), t('D', { dep: dep('C') })];
    expect([...idsEmCiclo(et)].sort()).toEqual(['A', 'B', 'C']);
  });

  it('autoligação conta como ciclo', () => {
    expect([...idsEmCiclo([t('A', { dep: dep('A') })])]).toEqual(['A']);
  });

  it('cadeia de 5000 tarefas não estoura a pilha', () => {
    const longa = Array.from({ length: 5000 }, (_, i) => t('T' + i, i ? { dep: dep('T' + (i - 1)) } : {}));
    expect(idsEmCiclo(longa).size).toBe(0);
    const fechada = [{ ...longa[0], dep: dep('T4999') }, ...longa.slice(1)];
    expect(idsEmCiclo(fechada).size).toBe(5000);
  });

  it('mensagem do commit recusado cita as linhas e abrevia', () => {
    const et = Array.from({ length: 9 }, (_, i) => t('T' + i));
    expect(mensagemDeCiclosNovos(et, ['T3', 'T5'])).toBe('Alteração desfeita: criaria um ciclo entre vínculos (linhas 4, 6).');
    expect(mensagemDeCiclosNovos(et, et.map(e => e.id))).toBe('Alteração desfeita: criaria um ciclo entre vínculos (linhas 1, 2, 3, 4, 5, 6, …).');
  });
});
