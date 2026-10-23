// BUG-005: folha concluída sem valor vinculado era congelada em R$ 0 (valorVinculadoFixo = 0).
// Ao vincular o orçamento a um grupo depois, as concluídas recebiam exatamente 0 e todo o valor
// do grupo ia para as abertas: Custo Orçado, Curva S e avanço ponderado ignoravam o executado.
import { describe, it, expect } from 'vitest';
import { aplicarTravaDeValor, computeValorVinculadoMap } from '../modules/cronograma/ganttUtils';

const G = { id: 'G', isGroup: true, nivel: 0, parentId: null, avanco: 0 };
const folha = (id, extra = {}) => ({ id, isGroup: false, nivel: 1, parentId: 'G', avanco: 0, fator_peso: 1, valorVinculadoFixo: null, ...extra });
const vinculoNoGrupo = [{ etapa_id: 'G', orcamento_item_id: 'i1' }];
const itens = { i1: 1000 };
const porId = (lista, id) => lista.find(e => e.id === id);

describe('aplicarTravaDeValor: não congela em zero', () => {
  it('obra sem vínculo: folha concluída NÃO fica congelada em 0 (o bug)', () => {
    const etapas = [G, folha('A', { avanco: 100 }), folha('B')];
    const r = aplicarTravaDeValor(etapas, [], {});
    expect(porId(r, 'A').valorVinculadoFixo).toBeNull();
    expect(r).toBe(etapas); // nada a fazer: mesma lista
  });

  it('lista de vínculos que falhou ao carregar (vazia ou ausente) também não congela', () => {
    const etapas = [G, folha('A', { avanco: 100 })];
    expect(porId(aplicarTravaDeValor(etapas, undefined, {}), 'A').valorVinculadoFixo).toBeNull();
    expect(porId(aplicarTravaDeValor(etapas, null, undefined), 'A').valorVinculadoFixo).toBeNull();
  });

  it('vincular depois: as concluídas recebem a parte delas e as abertas ficam com o restante', () => {
    // G vale 1000; A concluída (peso 1), C concluída (peso 2), B aberta (peso 1)
    const etapas = [G, folha('A', { avanco: 100 }), folha('B'), folha('C', { avanco: 100, fator_peso: 2 })];
    const r = aplicarTravaDeValor(etapas, vinculoNoGrupo, itens);
    expect(porId(r, 'A').valorVinculadoFixo).toBeCloseTo(250, 6);
    expect(porId(r, 'C').valorVinculadoFixo).toBeCloseTo(500, 6);
    expect(porId(r, 'B').valorVinculadoFixo).toBeNull();
    const mapa = computeValorVinculadoMap(r, vinculoNoGrupo, itens);
    expect(mapa.A).toBeCloseTo(250, 6);
    expect(mapa.C).toBeCloseTo(500, 6);
    expect(mapa.B).toBeCloseTo(250, 6); // o restante
    expect(mapa.A + mapa.B + mapa.C).toBeCloseTo(1000, 6); // nada se perde
  });
});

describe('aplicarTravaDeValor: cura os zeros já gravados (253 tarefas em 4 obras)', () => {
  it('concluídas congeladas em 0 voltam a receber a parte delas quando surge valor vinculado', () => {
    const etapas = [
      G,
      folha('A', { avanco: 100, valorVinculadoFixo: 0 }),
      folha('B'),
      folha('C', { avanco: 100, fator_peso: 2, valorVinculadoFixo: 0 }),
    ];
    // Sem a cura, A e C receberiam 0 e B ficaria com os 1000 inteiros
    const semCura = computeValorVinculadoMap(etapas, vinculoNoGrupo, itens);
    expect(semCura.A).toBe(0);
    expect(semCura.B).toBeCloseTo(1000, 6);

    const r = aplicarTravaDeValor(etapas, vinculoNoGrupo, itens);
    expect(porId(r, 'A').valorVinculadoFixo).toBeCloseTo(250, 6);
    expect(porId(r, 'C').valorVinculadoFixo).toBeCloseTo(500, 6);
    const mapa = computeValorVinculadoMap(r, vinculoNoGrupo, itens);
    expect(mapa.B).toBeCloseTo(250, 6);
  });

  it('zero sem valor vinculado para a folha continua como está (nada a curar)', () => {
    const etapas = [G, folha('A', { avanco: 100, valorVinculadoFixo: 0 })];
    const r = aplicarTravaDeValor(etapas, [{ etapa_id: 'OUTRO', orcamento_item_id: 'i1' }], itens);
    expect(porId(r, 'A').valorVinculadoFixo).toBe(0);
  });
});

describe('aplicarTravaDeValor: regras que já existiam continuam valendo', () => {
  it('folha concluída com valor vinculado real congela nesse valor', () => {
    const etapas = [G, folha('A', { avanco: 100 }), folha('B')];
    const r = aplicarTravaDeValor(etapas, vinculoNoGrupo, itens);
    expect(porId(r, 'A').valorVinculadoFixo).toBeCloseTo(500, 6);
  });

  it('valor já congelado (> 0) não muda mesmo que o rateio mude depois', () => {
    const etapas = [G, folha('A', { avanco: 100, valorVinculadoFixo: 300 }), folha('B', { fator_peso: 9 })];
    const r = aplicarTravaDeValor(etapas, vinculoNoGrupo, itens);
    expect(porId(r, 'A').valorVinculadoFixo).toBe(300);
    expect(r).toBe(etapas);
  });

  it('folha reaberta (< 100%) destrava, inclusive a que estava congelada em 0', () => {
    const etapas = [G, folha('A', { avanco: 60, valorVinculadoFixo: 250 }), folha('B', { avanco: 40, valorVinculadoFixo: 0 })];
    const r = aplicarTravaDeValor(etapas, vinculoNoGrupo, itens);
    expect(porId(r, 'A').valorVinculadoFixo).toBeNull();
    expect(porId(r, 'B').valorVinculadoFixo).toBeNull();
  });

  it('destravar funciona mesmo sem vínculos', () => {
    const etapas = [G, folha('A', { avanco: 10, valorVinculadoFixo: 0 })];
    expect(porId(aplicarTravaDeValor(etapas, [], {}), 'A').valorVinculadoFixo).toBeNull();
  });

  it('grupos nunca são alterados, nem com avanço 100', () => {
    const grupoCheio = { ...G, avanco: 100 };
    const etapas = [grupoCheio, folha('A', { avanco: 100 })];
    const r = aplicarTravaDeValor(etapas, vinculoNoGrupo, itens);
    expect(porId(r, 'G')).toBe(grupoCheio);
    expect(porId(r, 'G').valorVinculadoFixo).toBeUndefined();
  });

  it('não altera a lista recebida', () => {
    const etapas = [G, folha('A', { avanco: 100 }), folha('B')];
    const copia = JSON.parse(JSON.stringify(etapas));
    aplicarTravaDeValor(etapas, vinculoNoGrupo, itens);
    expect(etapas).toEqual(copia);
  });
});
