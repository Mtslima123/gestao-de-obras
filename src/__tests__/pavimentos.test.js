// Testes das regras de pavimento compartilhadas (Medição e Fotos). Executar: npm test
import { describe, it, expect } from 'vitest';
import { chavePavimento, ordenarPavimentos, posicaoPavimento, ordenarFotosPorPavimento, moverNaLista, nomeDaCopia, inserirDepois, nomeArquivoFoto, nomesUnicos } from '../utils/pavimentos';

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

describe('cadastro de pavimentos das fotos: subir/descer e duplicar', () => {
  const lista = ['Subsolo 2', 'Subsolo 1', 'Térreo'];

  it('moverNaLista troca com o vizinho', () => {
    expect(moverNaLista(lista, 1, -1)).toEqual(['Subsolo 1', 'Subsolo 2', 'Térreo']);
    expect(moverNaLista(lista, 1, 1)).toEqual(['Subsolo 2', 'Térreo', 'Subsolo 1']);
  });

  it('moverNaLista fora dos limites devolve a mesma lista (nada a gravar)', () => {
    expect(moverNaLista(lista, 0, -1)).toBe(lista);
    expect(moverNaLista(lista, 2, 1)).toBe(lista);
  });

  it('nomeDaCopia não repete nome já cadastrado (sem diferenciar maiúscula)', () => {
    expect(nomeDaCopia('1º Tipo I', lista)).toBe('1º Tipo I (cópia)');
    expect(nomeDaCopia('1º Tipo I', [...lista, '1º tipo i (CÓPIA)'])).toBe('1º Tipo I (cópia 2)');
  });

  it('nomeDaCopia cabe nos 60 caracteres do campo', () => {
    const longo = 'X'.repeat(60);
    const c = nomeDaCopia(longo, []);
    expect(c.length).toBeLessThanOrEqual(60);
    expect(c.endsWith(' (cópia)')).toBe(true);
  });

  it('inserirDepois coloca a cópia logo abaixo do original', () => {
    expect(inserirDepois(lista, 'Subsolo 1', 'Subsolo 1 (cópia)')).toEqual(['Subsolo 2', 'Subsolo 1', 'Subsolo 1 (cópia)', 'Térreo']);
    expect(inserirDepois(lista, 'Inexistente', 'Novo')).toEqual([...lista, 'Novo']);
  });
});

describe('nomeArquivoFoto', () => {
  it('monta "Pavimento - dd-mm-aaaa.ext"', () => {
    expect(nomeArquivoFoto({ id: 1, pavimento: 'Térreo', data: '2026-09-14' }, 'jpg')).toBe('Térreo - 14-09-2026.jpg');
  });
  it('troca caracteres proibidos em nome de arquivo', () => {
    expect(nomeArquivoFoto({ id: 1, pavimento: 'Tipo 1/2', data: '2026-09-14' }, 'png')).toBe('Tipo 1-2 - 14-09-2026.png');
  });
  it('usa só o que tiver e cai em foto-<id> sem pavimento nem data', () => {
    expect(nomeArquivoFoto({ id: 1, pavimento: 'Garagem' })).toBe('Garagem.jpg');
    expect(nomeArquivoFoto({ id: 1, data: '2026-09-14' })).toBe('14-09-2026.jpg');
    expect(nomeArquivoFoto({ id: 7 })).toBe('foto-7.jpg');
  });
});

describe('nomesUnicos', () => {
  it('numera repetidos antes da extensão, sem diferenciar maiúscula', () => {
    expect(nomesUnicos(['Térreo - 14-09-2026.jpg', 'Garagem.jpg', 'térreo - 14-09-2026.jpg', 'Térreo - 14-09-2026.jpg']))
      .toEqual(['Térreo - 14-09-2026.jpg', 'Garagem.jpg', 'térreo - 14-09-2026 (2).jpg', 'Térreo - 14-09-2026 (3).jpg']);
  });
});
