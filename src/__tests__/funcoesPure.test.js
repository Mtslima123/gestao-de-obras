import { describe, it, expect } from 'vitest';
import { chaveNome, contarPorFuncao, nomeDaFuncao, nomeDuplicado, normNome, ordenarFuncoes } from '../modules/admin/funcoesPure';

const funcoes = [{ id: 1, nome: 'Engenheiro' }, { id: 2, nome: 'Apontador' }, { id: 3, nome: 'Mestre de Obras' }];

describe('normNome / chaveNome', () => {
  it('tira espaços das pontas e repetidos, sem mexer em acento nem caixa', () => {
    expect(normNome('  Mestre   de  Obras ')).toBe('Mestre de Obras');
    expect(normNome(null)).toBe('');
  });

  it('a chave ignora acento, caixa e espaços', () => {
    expect(chaveNome('  ENGENHEIRÓ ')).toBe('engenheiro');
    expect(chaveNome('Técnico  de Segurança')).toBe('tecnico de seguranca');
  });
});

describe('nomeDuplicado', () => {
  it('acha o nome existente sem diferenciar caixa, acento nem espaços', () => {
    expect(nomeDuplicado(funcoes, 'engenheiro')).toBe(true);
    expect(nomeDuplicado(funcoes, '  APONTADOR ')).toBe(true);
    expect(nomeDuplicado(funcoes, 'mestre  de obras')).toBe(true);
    expect(nomeDuplicado(funcoes, 'Estagiário')).toBe(false);
  });

  it('nome vazio nunca é duplicado (a validação de vazio é outra)', () => {
    expect(nomeDuplicado(funcoes, '   ')).toBe(false);
  });

  it('ao renomear, a própria função não conta (mudar só a caixa é permitido)', () => {
    expect(nomeDuplicado(funcoes, 'ENGENHEIRO', 1)).toBe(false);
    expect(nomeDuplicado(funcoes, 'Apontador', 1)).toBe(true);
    expect(nomeDuplicado(funcoes, 'engenheiro', '1')).toBe(false); // id pode vir como texto
  });
});

describe('ordenar, achar nome e contar', () => {
  it('ordena em ordem alfabética do português, sem alterar a lista original', () => {
    const original = [{ id: 1, nome: 'Zelador' }, { id: 2, nome: 'Água' }, { id: 3, nome: 'Eletricista' }];
    expect(ordenarFuncoes(original).map((f) => f.nome)).toEqual(['Água', 'Eletricista', 'Zelador']);
    expect(original[0].nome).toBe('Zelador');
  });

  it('nome da função pelo id (número ou texto); sem função ou id desconhecido = null', () => {
    expect(nomeDaFuncao(funcoes, 2)).toBe('Apontador');
    expect(nomeDaFuncao(funcoes, '3')).toBe('Mestre de Obras');
    expect(nomeDaFuncao(funcoes, null)).toBeNull();
    expect(nomeDaFuncao(funcoes, 99)).toBeNull();
  });

  it('conta usuários por função e ignora quem não tem', () => {
    const m = contarPorFuncao([{ funcao_id: 1 }, { funcao_id: 1 }, { funcao_id: '2' }, { funcao_id: null }, {}]);
    expect(m.get('1')).toBe(2);
    expect(m.get('2')).toBe(1);
    expect(m.get('3')).toBeUndefined();
  });
});
