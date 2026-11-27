// Fator peso colado na Lista (Ctrl+V do Excel em português ou de outra célula): o valor chega como texto, com
// vírgula decimal. Antes a coluna nem aceitava colar, e o parseFloat cru cortava "28,32" em 28.
// Executar: npm test
import { describe, it, expect } from 'vitest';
import { applyFieldToEtapa } from '../modules/cronograma/scheduleEngine';

const tarefa = (over = {}) => ({ id: 'T1', etapa: 'Tarefa', dur: 5, avanco: 0, fator_peso: 1, dep: [], ...over });
const peso = (raw, over) => applyFieldToEtapa(tarefa(over), 'fator_peso', raw, []).fator_peso;

describe('fator_peso colado', () => {
  it('vírgula decimal brasileira', () => {
    expect(peso('28,32')).toBe(28.32);
    expect(peso('0,5')).toBe(0.5);
  });

  it('milhar com ponto quando há vírgula', () => {
    expect(peso('1.234,5')).toBe(1234.5);
  });

  it('ponto decimal do input numérico continua valendo', () => {
    expect(peso('28.32')).toBe(28.32);
    expect(peso('7')).toBe(7);
  });

  it('ponto sem vírgula não é milhar: "1.234" segue 1,234 como o input sempre gravou', () => {
    expect(peso('1.234')).toBe(1.234);
  });

  it('aceita número de verdade (formulário da tarefa) e espaços em volta', () => {
    expect(peso(12.5)).toBe(12.5);
    expect(peso('  7,5  ')).toBe(7.5);
  });

  it('vazio ou texto sem número volta ao padrão 1; negativo vira 0', () => {
    expect(peso('', { fator_peso: 9 })).toBe(1);
    expect(peso('abc', { fator_peso: 9 })).toBe(1);
    expect(peso('-3')).toBe(0);
    expect(peso('-3,5')).toBe(0);
  });

  it('zero é um peso válido (retirar da distribuição)', () => {
    expect(peso('0')).toBe(0);
    expect(peso('0,0')).toBe(0);
  });

  it('tarefa concluída e peso travado no cadeado não mudam', () => {
    expect(peso('5,5', { avanco: 100, fator_peso: 2 })).toBe(2);
    expect(peso('5,5', { peso_travado: true, fator_peso: 2 })).toBe(2);
  });

  it('só mexe no fator_peso', () => {
    const antes = tarefa({ etapa: 'Alvenaria', dur: 9, avanco: 40 });
    const depois = applyFieldToEtapa(antes, 'fator_peso', '3,25', []);
    expect(depois).toEqual({ ...antes, fator_peso: 3.25 });
  });
});
