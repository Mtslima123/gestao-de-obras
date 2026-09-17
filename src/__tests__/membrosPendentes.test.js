import { describe, it, expect } from 'vitest';
import { membrosPendentes } from '../modules/admin/usuariosPure';

describe('membrosPendentes', () => {
  it('retorna membros do grupo cujo e-mail ainda não está cadastrado', () => {
    const grupo = [
      { id: '1', nome: 'João', email: 'joao@soter.com.br' },
      { id: '2', nome: 'Ana', email: 'ana@soter.com.br' },
    ];
    const cadastrados = ['ana@soter.com.br'];
    expect(membrosPendentes(grupo, cadastrados)).toEqual([grupo[0]]);
  });

  it('compara e-mail sem diferenciar maiúsculas/minúsculas', () => {
    const grupo = [{ id: '1', nome: 'João', email: 'Joao@Soter.com.br' }];
    expect(membrosPendentes(grupo, ['joao@soter.com.br'])).toEqual([]);
  });

  it('grupo vazio retorna lista vazia', () => {
    expect(membrosPendentes([], ['ana@soter.com.br'])).toEqual([]);
  });

  it('sem nenhum cadastrado retorna o grupo inteiro', () => {
    const grupo = [{ id: '1', nome: 'João', email: 'joao@soter.com.br' }];
    expect(membrosPendentes(grupo, [])).toEqual(grupo);
  });

  it('todos já cadastrados retorna lista vazia', () => {
    const grupo = [
      { id: '1', nome: 'João', email: 'joao@soter.com.br' },
      { id: '2', nome: 'Ana', email: 'ana@soter.com.br' },
    ];
    expect(membrosPendentes(grupo, ['joao@soter.com.br', 'ana@soter.com.br'])).toEqual([]);
  });

  it('lida com entradas nulas/indefinidas sem quebrar', () => {
    expect(membrosPendentes(null, null)).toEqual([]);
    expect(membrosPendentes(undefined, undefined)).toEqual([]);
  });
});
