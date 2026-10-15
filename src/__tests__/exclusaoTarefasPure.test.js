import { describe, it, expect } from 'vitest';
import {
  destinoSugerido, etapasSemExcluidas, idsExcluidos, opcoesDeDestino, podeConfirmar, vinculosAfetados, vinculosParaAjustar,
} from '../modules/cronograma/exclusaoTarefasPure';

const t = (id, etapa, parentId = null, nivel = 0, isGroup = false) => ({ id, etapa, parentId, nivel, isGroup, inicio: 850, dur: 1, dep: [] });
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
