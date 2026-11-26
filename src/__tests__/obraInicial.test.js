// Testes da escolha da obra inicial do Cronograma. Executar: npm test
import { describe, it, expect } from 'vitest';
import { escolherObraInicial } from '../modules/cronograma/obraInicialPure';

const obras = [
  { id: 'A', status: 'planejamento' },
  { id: 'B', status: 'em_andamento' },
  { id: 'C', status: 'em_andamento' },
];

describe('escolherObraInicial', () => {
  it('sem deep link nem obra salva abre sem obra, mesmo com obras em andamento', () => {
    expect(escolherObraInicial({ obras })).toBeNull();
  });

  it('o deep link seleciona a obra pedida', () => {
    expect(escolherObraInicial({ initialObraId: 'C', obras })).toBe('C');
  });

  it('a obra salva na sessão (reload) seleciona a obra', () => {
    expect(escolherObraInicial({ obraSalva: 'A', obras })).toBe('A');
  });

  it('o deep link vence a obra salva', () => {
    expect(escolherObraInicial({ initialObraId: 'C', obraSalva: 'A', obras })).toBe('C');
  });

  it('obra salva que não existe mais na lista é ignorada', () => {
    expect(escolherObraInicial({ obraSalva: 'FANTASMA', obras })).toBeNull();
  });

  it('deep link que não está na lista cai na obra salva', () => {
    expect(escolherObraInicial({ initialObraId: 'FANTASMA', obraSalva: 'A', obras })).toBe('A');
  });

  it('com a lista ainda vazia confia no deep link e na obra salva', () => {
    expect(escolherObraInicial({ initialObraId: 'X', obras: [] })).toBe('X');
    expect(escolherObraInicial({ obraSalva: 'Y', obras: [] })).toBe('Y');
  });

  it('sem nada e sem obras abre sem obra', () => {
    expect(escolherObraInicial({ obras: [] })).toBeNull();
    expect(escolherObraInicial({})).toBeNull();
  });

  describe('sem seletor na tela (modo foco da Medição)', () => {
    it('cai na primeira obra em andamento', () => {
      expect(escolherObraInicial({ obras, semSeletor: true })).toBe('B');
    });

    it('sem nenhuma em andamento cai na primeira da lista', () => {
      expect(escolherObraInicial({ obras: [{ id: 'A', status: 'planejamento' }, { id: 'D' }], semSeletor: true })).toBe('A');
    });

    it('o deep link continua vencendo', () => {
      expect(escolherObraInicial({ initialObraId: 'C', obras, semSeletor: true })).toBe('C');
    });

    it('sem obras nenhuma é escolhida', () => {
      expect(escolherObraInicial({ obras: [], semSeletor: true })).toBeNull();
    });
  });
});
