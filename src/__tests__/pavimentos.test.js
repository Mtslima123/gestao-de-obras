// Testes das regras de pavimento compartilhadas (Medição e Fotos). Executar: npm test
import { describe, it, expect } from 'vitest';
import { chavePavimento, ordenarPavimentos, posicaoPavimento, ordenarFotosPorPavimento } from '../utils/pavimentos';

const foto = (id, data, pavimento, created_at = '2026-09-30T10:00:00Z') => ({ id, data, pavimento, created_at });

describe('posicaoPavimento', () => {
  const pos = posicaoPavimento(['Térreo', '1º tipo', '2º tipo']);

  it('segue a ordem de cadastro, ignorando espaço e maiúscula', () => {
    expect(pos('Térreo')).toBe(0);
    expect(pos(' 1º tipo ')).toBe(1);
    expect(pos('2º TIPO')).toBe(2);
  });

  it('fora do cadastro vem depois dos cadastrados, e sem pavimento por último', () => {
    expect(pos('Cobertura')).toBe(3);
    expect(pos('')).toBe(4);
    expect(pos(null)).toBe(4);
    expect(pos('—')).toBe(4);
  });
});

describe('ordenarFotosPorPavimento', () => {
  const cadastro = ['Térreo', '1º tipo', '2º tipo', '10º tipo'];

  it('na mesma data, o pavimento cadastrado primeiro vem antes, mesmo enviado depois', () => {
    const fotos = [
      foto('a', '2026-09-30', '2º tipo', '2026-09-30T08:00:00Z'),
      foto('b', '2026-09-30', '1º tipo', '2026-09-30T18:00:00Z'), // enviada depois, mas cadastrada antes
      foto('c', '2026-09-30', '10º tipo'),
      foto('d', '2026-09-30', 'Térreo'),
    ];
    expect(ordenarFotosPorPavimento(fotos, cadastro).map(f => f.id)).toEqual(['d', 'b', 'a', 'c']);
  });

  it('a data continua mandando: dia mais recente primeiro, depois o pavimento', () => {
    const fotos = [
      foto('velha1', '2026-09-01', 'Térreo'),
      foto('nova2', '2026-09-30', '2º tipo'),
      foto('nova1', '2026-09-30', '1º tipo'),
    ];
    expect(ordenarFotosPorPavimento(fotos, cadastro).map(f => f.id)).toEqual(['nova1', 'nova2', 'velha1']);
  });

  it('no mesmo dia e pavimento, a foto mais recente vem primeiro', () => {
    const fotos = [
      foto('antiga', '2026-09-30', '1º tipo', '2026-09-30T08:00:00Z'),
      foto('recente', '2026-09-30', '1º tipo', '2026-09-30T17:00:00Z'),
    ];
    expect(ordenarFotosPorPavimento(fotos, cadastro).map(f => f.id)).toEqual(['recente', 'antiga']);
  });

  it('fora do cadastro vai depois dos cadastrados, em ordem natural; sem data e sem pavimento por último', () => {
    const fotos = [
      foto('sem-data', null, 'Térreo'),
      foto('sem-pav', '2026-09-30', null),
      foto('x10', '2026-09-30', 'Mezanino 10'),
      foto('x2', '2026-09-30', 'Mezanino 2'),
      foto('cad', '2026-09-30', '2º tipo'),
    ];
    expect(ordenarFotosPorPavimento(fotos, cadastro).map(f => f.id)).toEqual(['cad', 'x2', 'x10', 'sem-pav', 'sem-data']);
  });

  it('nome com espaço a mais casa com o cadastro', () => {
    const fotos = [
      foto('a', '2026-09-30', ' 2º tipo'),
      foto('b', '2026-09-30', '1º tipo'),
    ];
    expect(ordenarFotosPorPavimento(fotos, cadastro).map(f => f.id)).toEqual(['b', 'a']);
  });

  it('sem cadastro cai em ordem natural e não altera a lista original', () => {
    const fotos = [foto('b', '2026-09-30', '10'), foto('a', '2026-09-30', '2')];
    const copia = [...fotos];
    expect(ordenarFotosPorPavimento(fotos, []).map(f => f.id)).toEqual(['a', 'b']);
    expect(fotos).toEqual(copia);
  });

  it('é estável: mesma entrada, mesma ordem, mesmo com ids iguais em tudo menos o id', () => {
    const fotos = [foto('2', '2026-09-30', '1º tipo'), foto('1', '2026-09-30', '1º tipo')];
    expect(ordenarFotosPorPavimento(fotos, cadastro).map(f => f.id)).toEqual(['1', '2']);
  });
});

describe('chavePavimento e ordenarPavimentos (movidos para o util compartilhado)', () => {
  it('continuam funcionando igual', () => {
    expect(chavePavimento(' puc')).toBe(chavePavimento('PUC'));
    expect(ordenarPavimentos([' 3° tipo', '3° tipo', 'Mezanino'], ['3° tipo'])).toEqual(['3° tipo', 'Mezanino']);
  });
});
