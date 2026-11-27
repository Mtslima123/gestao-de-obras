// Comparação dos vínculos que a Lista tem na tela com os do banco. Executar: npm test
import { describe, it, expect } from 'vitest';
import { assinaturaDosVinculos, vinculosMudaram } from '../modules/cronograma/vinculosPure';

const valor = (it) => it.valor_total || (it.quantidade || 0) * (it.valor_unitario || 0);
const v = (id, etapa_id, item, valor_total) => ({ id, etapa_id, orcamento_item_id: item, orcamento_itens: { id: item, valor_total } });

const base = [v(1, 'T1', 10, 100), v(2, 'T1', 11, 250), v(3, 'T2', 12, 40)];

describe('vinculosMudaram', () => {
  it('mesma lista: não mudou', () => {
    expect(vinculosMudaram(base, base.map(x => ({ ...x })), valor)).toBe(false);
  });

  it('a ordem em que o banco devolve não conta', () => {
    expect(vinculosMudaram(base, [base[2], base[0], base[1]], valor)).toBe(false);
  });

  it('vínculo removido', () => {
    expect(vinculosMudaram(base, base.slice(0, 2), valor)).toBe(true);
  });

  it('vínculo novo', () => {
    expect(vinculosMudaram(base, [...base, v(4, 'T3', 13, 5)], valor)).toBe(true);
  });

  it('item movido para outra tarefa', () => {
    expect(vinculosMudaram(base, [v(1, 'T9', 10, 100), base[1], base[2]], valor)).toBe(true);
  });

  it('valor do item editado no orçamento, com o mesmo vínculo', () => {
    expect(vinculosMudaram(base, [v(1, 'T1', 10, 150), base[1], base[2]], valor)).toBe(true);
  });

  it('valor calculado por quantidade x unitário também conta', () => {
    const a = [{ id: 1, etapa_id: 'T1', orcamento_item_id: 10, orcamento_itens: { quantidade: 2, valor_unitario: 5 } }];
    const b = [{ id: 1, etapa_id: 'T1', orcamento_item_id: 10, orcamento_itens: { quantidade: 2, valor_unitario: 6 } }];
    expect(vinculosMudaram(a, b, valor)).toBe(true);
    expect(vinculosMudaram(a, a, valor)).toBe(false);
  });

  it('listas vazias, nulas e indefinidas são iguais entre si', () => {
    expect(vinculosMudaram([], null, valor)).toBe(false);
    expect(vinculosMudaram(undefined, [], valor)).toBe(false);
    expect(vinculosMudaram([], base, valor)).toBe(true);
  });

  it('vínculo sem o item embutido não quebra', () => {
    const sem = [{ id: 1, etapa_id: 'T1', orcamento_item_id: 10 }];
    expect(() => assinaturaDosVinculos(sem, valor)).not.toThrow();
    expect(vinculosMudaram(sem, sem, valor)).toBe(false);
  });
});
