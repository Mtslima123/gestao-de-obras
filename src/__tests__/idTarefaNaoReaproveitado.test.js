// BUG-011: o id da tarefa era max(existentes)+1. Excluir a de maior número e criar outra
// devolvia o mesmo id, e a nova herdava vínculos de orçamento, histórico, anexos e linha de
// base da excluída (tudo isso é guardado por task_id/etapa_id fora do cronograma).
import { describe, it, expect } from 'vitest';
import { nextEtapaId, createTask, createGroup, createSubtask } from '../modules/cronograma/scheduleEngine';

const t = (id, extra = {}) => ({ id, displayId: parseInt(id.replace(/\D/g, ''), 10), etapa: id, nivel: 0, parentId: null, inicio: 50, dur: 5, ...extra });
const numero = (id) => parseInt(id.replace(/\D/g, ''), 10);

describe('nextEtapaId', () => {
  it('mantém o formato TSK-<número> (vínculos, histórico e anexos guardam o id como texto)', () => {
    expect(nextEtapaId([t('TSK-001')], 1_800_000_000_000)).toMatch(/^TSK-\d+$/);
  });

  it('excluir a tarefa de maior número e criar outra NÃO devolve o id excluído (o bug)', () => {
    const etapas = [t('TSK-001'), t('TSK-002')];
    const criada = nextEtapaId(etapas, 1_800_000_000_000);      // vira a tarefa de maior número
    const comCriada = [...etapas, t(criada)];
    const aposExcluir = comCriada.filter(e => e.id !== criada); // usuário exclui
    const nova = nextEtapaId(aposExcluir, 1_800_000_000_500);   // criada depois
    expect(nova).not.toBe(criada);
  });

  it('o mesmo vale entre sessões: cronograma que já tinha TSK-310 excluída', () => {
    // 1ª sessão criou TSK-310 (número pequeno, formato antigo) e excluiu. Hoje o relógio
    // está muito acima dela, então o id novo não colide com ela nem com nenhuma antiga.
    const aposExcluir = [t('TSK-001'), t('TSK-309')];
    expect(nextEtapaId(aposExcluir, 1_800_000_000_000)).not.toBe('TSK-310');
  });

  it('nunca fica abaixo de max existente + 1, nem com o relógio atrasado', () => {
    const etapas = [t('TSK-001'), t('TSK-5000000000000')];
    expect(nextEtapaId(etapas, 1000)).toBe('TSK-5000000000001');
  });

  it('criar em lote no mesmo milissegundo segue distinto quando cada id volta à lista', () => {
    const agora = 1_800_000_000_000;
    let base = [t('TSK-001')];
    const ids = [];
    for (let i = 0; i < 50; i++) {
      const id = nextEtapaId(base, agora);
      ids.push(id);
      base = [...base, t(id)];
    }
    expect(new Set(ids).size).toBe(50);
    // e crescentes, para o próximo "max + 1" continuar valendo
    for (let i = 1; i < ids.length; i++) expect(numero(ids[i])).toBeGreaterThan(numero(ids[i - 1]));
  });

  it('lista vazia e ids fora do padrão não quebram', () => {
    expect(nextEtapaId([], 1_800_000_000_000)).toBe('TSK-1800000000000');
    expect(nextEtapaId([{ id: 'abc' }, { id: 'E9000' }], 1_800_000_000_000)).toBe('TSK-1800000000000');
  });

  it.each([['createTask', createTask], ['createSubtask', createSubtask], ['createGroup', createGroup]])(
    '%s gera id no formato novo e diferente dos existentes', (_nome, criar) => {
      const etapas = [t('TSK-001'), t('TSK-002')];
      const nova = criar('TSK-002', etapas, []).find(e => !etapas.some(x => x.id === e.id));
      expect(nova.id).toMatch(/^TSK-\d+$/);
      expect(numero(nova.id)).toBeGreaterThan(2);
    });
});
