import { describe, it, expect } from 'vitest';
import { passoDeRolagem, ZONA_BORDA, PASSO_MAX } from '../modules/cronograma/listaAutoScroll';

// Container de 400px de altura, começando em y=100 e terminando em y=500
const rect = { top: 100, bottom: 500, height: 400 };
const MAX = 2000; // scrollHeight - clientHeight

describe('passoDeRolagem', () => {
  it('ponteiro no meio não rola', () => {
    expect(passoDeRolagem(300, rect, 500, MAX)).toBe(0);
  });

  it('logo fora da zona de borda ainda não rola', () => {
    expect(passoDeRolagem(rect.top + ZONA_BORDA, rect, 500, MAX)).toBe(0);
    expect(passoDeRolagem(rect.bottom - ZONA_BORDA, rect, 500, MAX)).toBe(0);
  });

  it('perto do topo sobe, perto da base desce', () => {
    expect(passoDeRolagem(rect.top + 5, rect, 500, MAX)).toBeLessThan(0);
    expect(passoDeRolagem(rect.bottom - 5, rect, 500, MAX)).toBeGreaterThan(0);
  });

  it('quanto mais perto da borda, maior o passo', () => {
    const raso = passoDeRolagem(rect.top + 20, rect, 500, MAX);
    const fundo = passoDeRolagem(rect.top + 5, rect, 500, MAX);
    expect(Math.abs(fundo)).toBeGreaterThan(Math.abs(raso));
  });

  it('ponteiro além do container rola no passo máximo', () => {
    expect(passoDeRolagem(rect.bottom + 200, rect, 500, MAX)).toBe(PASSO_MAX);
    expect(passoDeRolagem(rect.top - 200, rect, 500, MAX)).toBe(-PASSO_MAX);
  });

  it('nunca passa do passo máximo', () => {
    for (let y = rect.top - 300; y <= rect.bottom + 300; y += 7) {
      expect(Math.abs(passoDeRolagem(y, rect, 500, MAX))).toBeLessThanOrEqual(PASSO_MAX);
    }
  });

  it('no topo não sobe mais; no fim não desce mais', () => {
    expect(passoDeRolagem(rect.top + 5, rect, 0, MAX)).toBe(0);
    expect(passoDeRolagem(rect.bottom - 5, rect, MAX, MAX)).toBe(0);
    // mas o outro sentido continua livre
    expect(passoDeRolagem(rect.bottom - 5, rect, 0, MAX)).toBeGreaterThan(0);
    expect(passoDeRolagem(rect.top + 5, rect, MAX, MAX)).toBeLessThan(0);
  });

  it('scrollTop fora dos limites é tratado como no limite', () => {
    expect(passoDeRolagem(rect.top + 5, rect, -50, MAX)).toBe(0);
    expect(passoDeRolagem(rect.bottom - 5, rect, MAX + 999, MAX)).toBe(0);
  });

  it('sem nada para rolar, fica parado nos dois sentidos', () => {
    expect(passoDeRolagem(rect.top + 5, rect, 0, 0)).toBe(0);
    expect(passoDeRolagem(rect.bottom - 5, rect, 0, 0)).toBe(0);
  });

  it('container baixo não rola para os dois lados ao mesmo tempo', () => {
    // 30px de altura: sem limitar a zona a metade, todo ponto seria topo E base
    const baixo = { top: 0, bottom: 30, height: 30 };
    for (let y = 0; y <= 30; y++) {
      const passo = passoDeRolagem(y, baixo, 500, MAX);
      if (y < 15) expect(passo).toBeLessThanOrEqual(0);
      else expect(passo).toBeGreaterThanOrEqual(0);
    }
  });

  it('entradas degeneradas não geram NaN', () => {
    expect(passoDeRolagem(300, null, 0, MAX)).toBe(0);
    expect(passoDeRolagem(300, { top: 0, bottom: 0 }, 0, MAX)).toBe(0);
    expect(passoDeRolagem(NaN, rect, 0, MAX)).toBe(0);
    expect(passoDeRolagem(300, rect, 0, undefined)).toBe(0);
    expect(Number.isNaN(passoDeRolagem(rect.top + 5, rect, undefined, MAX))).toBe(false);
  });
});
