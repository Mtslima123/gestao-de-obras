import { describe, it, expect } from 'vitest';
import { friendlyError } from '../utils/friendlyError';

describe('friendlyError', () => {
  it('traduz falha de rede', () => {
    expect(friendlyError({ message: 'Failed to fetch' })).toMatch(/conexão/i);
  });

  it('traduz sessão expirada (JWT)', () => {
    expect(friendlyError({ message: 'JWT expired' })).toMatch(/sessão/i);
  });

  it('traduz erro de permissão (RLS)', () => {
    expect(friendlyError({ message: 'new row violates row-level security policy' })).toMatch(/permissão/i);
  });

  it('traduz chave duplicada', () => {
    expect(friendlyError({ message: 'duplicate key value violates unique constraint "obras_pkey"' })).toMatch(/já existe/i);
  });

  it('traduz violação de chave estrangeira', () => {
    expect(friendlyError({ message: 'update or delete on table "obras" violates foreign key constraint' })).toMatch(/vinculados/i);
  });

  it('traduz campo obrigatório (not-null)', () => {
    expect(friendlyError({ message: 'null value in column "nome" violates not-null constraint' })).toMatch(/obrigatórios/i);
  });

  it('cai no genérico para erro desconhecido', () => {
    expect(friendlyError({ message: 'some completely unexpected driver error XYZ' })).toMatch(/inesperado/i);
  });

  it('nunca deixa a mensagem técnica original vazar pro texto final', () => {
    const tecnica = 'duplicate key value violates unique constraint "obras_pkey"';
    const resultado = friendlyError({ message: tecnica });
    expect(resultado).not.toContain('constraint');
    expect(resultado).not.toContain('pkey');
  });

  it('lida com error nulo/indefinido sem quebrar', () => {
    expect(friendlyError(null)).toMatch(/inesperado/i);
    expect(friendlyError(undefined)).toMatch(/inesperado/i);
  });
});
