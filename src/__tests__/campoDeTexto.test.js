// Ctrl+Z global do Cronograma: só campo de texto segura o atalho (ver campoDeTextoPure.js).
import { describe, it, expect } from 'vitest';
import { campoDeTextoFocado } from '../modules/cronograma/campoDeTextoPure';

const input = (type) => ({ tagName: 'INPUT', type });

describe('campoDeTextoFocado', () => {
  it.each(['text', 'number', 'search', 'email', 'password', 'date', 'tel', 'url'])('input %s é campo de texto', (t) => {
    expect(campoDeTextoFocado(input(t))).toBe(true);
  });

  it('input sem type declarado vale como texto', () => {
    expect(campoDeTextoFocado({ tagName: 'INPUT' })).toBe(true);
    expect(campoDeTextoFocado({ tagName: 'INPUT', type: '' })).toBe(true);
  });

  it.each(['checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'range', 'file', 'image'])('input %s NÃO segura o atalho', (t) => {
    expect(campoDeTextoFocado(input(t))).toBe(false);
  });

  it('o tipo é comparado sem diferenciar maiúsculas', () => {
    expect(campoDeTextoFocado(input('CheckBox'))).toBe(false);
  });

  it('textarea e conteúdo editável seguram o atalho', () => {
    expect(campoDeTextoFocado({ tagName: 'TEXTAREA' })).toBe(true);
    expect(campoDeTextoFocado({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });

  it('div, botão, select, body e nada em foco não seguram', () => {
    expect(campoDeTextoFocado({ tagName: 'DIV' })).toBe(false);
    expect(campoDeTextoFocado({ tagName: 'BUTTON' })).toBe(false);
    expect(campoDeTextoFocado({ tagName: 'SELECT' })).toBe(false);
    expect(campoDeTextoFocado({ tagName: 'BODY' })).toBe(false);
    expect(campoDeTextoFocado(null)).toBe(false);
  });
});
