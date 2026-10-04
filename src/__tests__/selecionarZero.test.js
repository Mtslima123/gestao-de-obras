import { describe, it, expect } from 'vitest';
import { valorZerado, campoNumerico } from '../utils/selecionarZero';

describe('valorZerado', () => {
  it.each(['0', '00', '0,0', '0.00', '0,00', ' 0 '])('%j é zero', (v) => {
    expect(valorZerado(v)).toBe(true);
  });
  it.each(['', '5', '0,5', '10', '0.01', '-0', '05', '0a', null, undefined])('%j não é zero', (v) => {
    expect(valorZerado(v)).toBe(false);
  });
  it('aceita número puro', () => {
    expect(valorZerado(0)).toBe(true);
    expect(valorZerado(7)).toBe(false);
  });
});

describe('campoNumerico', () => {
  it('reconhece type=number e inputMode numérico', () => {
    expect(campoNumerico({ tagName: 'INPUT', type: 'number', inputMode: '' })).toBe(true);
    expect(campoNumerico({ tagName: 'INPUT', type: 'text', inputMode: 'decimal' })).toBe(true);
    expect(campoNumerico({ tagName: 'INPUT', type: 'text', inputMode: 'numeric' })).toBe(true);
  });
  it('ignora texto comum, outros elementos e vazio', () => {
    expect(campoNumerico({ tagName: 'INPUT', type: 'text', inputMode: '' })).toBe(false);
    expect(campoNumerico({ tagName: 'TEXTAREA', type: 'textarea', inputMode: '' })).toBe(false);
    expect(campoNumerico(null)).toBe(false);
  });
});
