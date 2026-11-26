import { describe, it, expect } from 'vitest';
import {
  destinoSugerido, etapasSemExcluidas, idsExcluidos, opcoesDeDestino, podeConfirmar, vinculosAfetados, vinculosParaAjustar,
} from '../modules/cronograma/exclusaoTarefasPure';
import { deleteTask, converterGrupoEmTarefa } from '../modules/cronograma/scheduleEngine';

const t =(id, etapa, parentId = null, nivel = 0, isGroup = false) => ({ id, etapa, parentId, nivel, isGroup, inicio: 850, dur: 1, dep: [] });
// G1 REVESTIMENTOS > G2 Colocação de azulejo > A subsolo 1, B térreo ; C Pintura (raiz)
const etapas = [
  t('G1', 'REVESTIMENTOS', null, 0, true),
  t('G2', 'Colocação de azulejo', 'G1', 1, true),
  t('A', 'Colocação de azulejo - subsolo 1', 'G2', 2),
  t('B', 'Colocação de azulejo - térreo', 'G2', 2),
  t('C', 'Pintura'),
];
const v = (id, etapa_id) => ({ id, etapa_id, orcamento_item_id: id * 10 });
const vinculos = [v(1, 'A'), v(2, 'A'), v(3, 'B'), v(4, 'G2'), v(5, 'C')];

describe('o que sai com a exclusão', () => {
  it('excluir uma tarefa tira só ela', () => {
    const novas = etapasSemExcluidas(etapas, ['A']);
    expect([...idsExcluidos(etapas, novas)]).toEqual(['A']);
  });

  it('excluir um grupo tira as subtarefas em cascata, e os vínculos delas contam', () => {
    const novas = etapasSemExcluidas(etapas, ['G2']);
    const fora = idsExcluidos(etapas, novas);
    expect([...fora].sort()).toEqual(['A', 'B', 'G2']);
    expect(vinculosAfetados(vinculos, fora).map((x) => x.id)).toEqual([1, 2, 3, 4]);
  });

  it('tarefa sem vínculo não afeta nada', () => {
    const fora = idsExcluidos(etapas, etapasSemExcluidas(etapas, ['B']));
    expect(vinculosAfetados([v(9, 'C')], fora)).toEqual([]);
    expect(vinculosAfetados(undefined, fora)).toEqual([]);
  });
});

// Grupo que perde todos os filhos volta a ser tarefa comum (antes seguia como linha-resumo vazia: seta, negrito).
describe('grupo que perde todos os filhos', () => {
  const porId = (lista, id) => lista.find((e) => e.id === id);

  it('com um filho que sobra continua grupo', () => {
    const novas = etapasSemExcluidas(etapas, ['A']);
    expect(porId(novas, 'G2').isGroup).toBe(true);
  });

  it('ao excluir o último filho volta a ser tarefa comum', () => {
    const novas = etapasSemExcluidas(etapas, ['A', 'B']);
    expect(porId(novas, 'G2')).toMatchObject({ isGroup: false, collapsed: false });
  });

  it('o mesmo vale excluindo um filho de cada vez, em duas exclusões', () => {
    const novas = deleteTask('B', deleteTask('A', etapas));
    expect(porId(novas, 'G2').isGroup).toBe(false);
  });

  it('só o pai direto muda: o avô continua grupo porque o pai segue como filho dele', () => {
    const novas = etapasSemExcluidas(etapas, ['A', 'B']);
    expect(porId(novas, 'G1').isGroup).toBe(true);
    expect(novas.map((e) => e.id)).toEqual(['G1', 'G2', 'C']);
  });

  it('excluir o único subgrupo devolve o avô a tarefa comum, e o subgrupo sai em cascata', () => {
    const novas = etapasSemExcluidas(etapas, ['G2']);
    expect(porId(novas, 'G1').isGroup).toBe(false);
    expect(novas.map((e) => e.id)).toEqual(['G1', 'C']);
  });

  it('zera collapsed: se receber subtarefa de novo, a nova não pode nascer escondida', () => {
    const recolhido = etapas.map((e) => (e.id === 'G2' ? { ...e, collapsed: true } : e));
    const novas = etapasSemExcluidas(recolhido, ['A', 'B']);
    expect(porId(novas, 'G2').collapsed).toBe(false);
  });

  it('mantém o resto da tarefa (nome, datas, peso)', () => {
    const comPeso = etapas.map((e) => (e.id === 'G2' ? { ...e, fator_peso: 4, peso_travado: true, inicio: 900, dur: 7 } : e));
    const g2 = porId(etapasSemExcluidas(comPeso, ['A', 'B']), 'G2');
    expect(g2).toMatchObject({ etapa: 'Colocação de azulejo', fator_peso: 4, peso_travado: true, inicio: 900, dur: 7 });
  });

  it('o "Novo grupo" vazio, que não perdeu filho agora, não é tocado', () => {
    const comNovoGrupo = [...etapas, t('N', 'Novo grupo', null, 0, true)];
    const novas = etapasSemExcluidas(comNovoGrupo, ['C']);
    expect(porId(novas, 'N').isGroup).toBe(true);
  });

  it('continua limpando as predecessoras que apontavam para o que saiu', () => {
    const comDep = etapas.map((e) => (e.id === 'C' ? { ...e, dep: [{ id: 'A', tipo: 'TI', lag: 0 }, { id: 'G1', tipo: 'TI', lag: 0 }] } : e));
    const novas = etapasSemExcluidas(comDep, ['A']);
    expect(porId(novas, 'C').dep).toEqual([{ id: 'G1', tipo: 'TI', lag: 0 }]);
  });
});

// "Converter em tarefa" (botão direito): cura grupo que já ficou vazio e o "Novo grupo" que ninguém preencheu.
describe('converterGrupoEmTarefa', () => {
  const vazio = [...etapas, { ...t('N', 'Novo grupo', null, 0, true), collapsed: true, fator_peso: 3, dur: 9 }];
  const porId = (lista, id) => lista.find((e) => e.id === id);

  it('grupo sem filhos vira tarefa comum e mantém o resto', () => {
    const novas = converterGrupoEmTarefa('N', vazio);
    expect(porId(novas, 'N')).toMatchObject({ etapa: 'Novo grupo', isGroup: false, collapsed: false, fator_peso: 3, dur: 9 });
    expect(novas).toHaveLength(vazio.length);
  });

  it('não mexe nas outras tarefas', () => {
    const novas = converterGrupoEmTarefa('N', vazio);
    expect(novas.filter((e) => e.id !== 'N')).toEqual(vazio.filter((e) => e.id !== 'N'));
  });

  it('grupo com filhos não é convertido: devolve o mesmo array', () => {
    expect(converterGrupoEmTarefa('G2', vazio)).toBe(vazio);
    expect(converterGrupoEmTarefa('G1', vazio)).toBe(vazio);
  });

  it('folha e id inexistente também devolvem o mesmo array', () => {
    expect(converterGrupoEmTarefa('C', vazio)).toBe(vazio);
    expect(converterGrupoEmTarefa('XX', vazio)).toBe(vazio);
  });

  it('grupo vazio dentro de outro grupo: só ele vira tarefa, o pai segue grupo', () => {
    const aninhado = [t('P', 'Pai', null, 0, true), t('V', 'Vazio', 'P', 1, true)];
    const novas = converterGrupoEmTarefa('V', aninhado);
    expect(porId(novas, 'V').isGroup).toBe(false);
    expect(porId(novas, 'P').isGroup).toBe(true);
  });
});

describe('destinoSugerido', () => {
  it('é a tarefa-pai mais próxima que continua existindo', () => {
    expect(destinoSugerido(etapas, ['A'], etapasSemExcluidas(etapas, ['A']))).toBe('G2');
    expect(destinoSugerido(etapas, ['G2'], etapasSemExcluidas(etapas, ['G2']))).toBe('G1');
  });

  it('tarefa de primeiro nível não tem sugestão', () => {
    expect(destinoSugerido(etapas, ['C'], etapasSemExcluidas(etapas, ['C']))).toBeNull();
  });
});

describe('opcoesDeDestino', () => {
  const novas = etapasSemExcluidas(etapas, ['A']);

  it('lista só as que ficam, na ordem da EAP, com WBS', () => {
    const ops = opcoesDeDestino(novas);
    expect(ops.map((o) => o.id)).toEqual(['G1', 'G2', 'B', 'C']);
    expect(ops.find((o) => o.id === 'B').wbs).toBe('1.1.1');
    expect(ops.find((o) => o.id === 'G2').grupo).toBe(true);
  });

  it('busca por nome ou WBS sem acento nem caixa, mantendo o destino escolhido', () => {
    expect(opcoesDeDestino(novas, 'TERREO').map((o) => o.id)).toEqual(['B']);
    expect(opcoesDeDestino(novas, '1.1').map((o) => o.id)).toEqual(['G2', 'B']);
    expect(opcoesDeDestino(novas, 'pintura', 'G2').map((o) => o.id)).toEqual(['G2', 'C']);
  });
});

describe('podeConfirmar', () => {
  const novas = etapasSemExcluidas(etapas, ['A']);

  it('sem vínculos afetados, sempre', () => {
    expect(podeConfirmar({ afetados: 0, acao: null, novas })).toBe(true);
  });

  it('com vínculos, exige escolher o que fazer', () => {
    expect(podeConfirmar({ afetados: 2, acao: null, novas })).toBe(false);
    expect(podeConfirmar({ afetados: 2, acao: 'manter', novas })).toBe(true);
  });

  it('mover exige um destino que fica', () => {
    expect(podeConfirmar({ afetados: 2, acao: 'mover', destino: '', novas })).toBe(false);
    expect(podeConfirmar({ afetados: 2, acao: 'mover', destino: 'A', novas })).toBe(false); // A está sendo excluída
    expect(podeConfirmar({ afetados: 2, acao: 'mover', destino: 'B', novas })).toBe(true);
  });

  it('remover os vínculos é só de administrador', () => {
    expect(podeConfirmar({ afetados: 2, acao: 'remover', novas, isAdmin: false })).toBe(false);
    expect(podeConfirmar({ afetados: 2, acao: 'remover', novas, isAdmin: true })).toBe(true);
  });
});

describe('vinculosParaAjustar (depois de gravada a exclusão)', () => {
  const gravadas = etapasSemExcluidas(etapas, ['A']);

  it('ajusta os vínculos da tarefa que saiu', () => {
    expect(vinculosParaAjustar({ acao: 'mover', vinculoIds: [1, 2], destino: 'G2' }, vinculos, gravadas)).toEqual({ ids: [1, 2], destinoSumiu: false });
  });

  it('se um Desfazer devolveu a tarefa antes de gravar, não mexe em nada', () => {
    expect(vinculosParaAjustar({ acao: 'remover', vinculoIds: [1, 2] }, vinculos, etapas).ids).toEqual([]);
  });

  it('destino que também sumiu do que foi gravado: avisa em vez de mover', () => {
    const semG2 = etapasSemExcluidas(etapas, ['G2']);
    expect(vinculosParaAjustar({ acao: 'mover', vinculoIds: [1, 2], destino: 'G2' }, vinculos, semG2).destinoSumiu).toBe(true);
  });

  it('ignora vínculo que já não está na lista (removido em outra tela)', () => {
    expect(vinculosParaAjustar({ acao: 'remover', vinculoIds: [1, 2, 99] }, vinculos, gravadas).ids).toEqual([1, 2]);
  });
});
