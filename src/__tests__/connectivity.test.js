import { describe, it, expect } from 'vitest';
import { isNetworkError } from '../utils/connectivity';

describe('isNetworkError', () => {
  it('reconhece falha real de fetch', () => {
    expect(isNetworkError({ message: 'TypeError: Failed to fetch' })).toBe(true);
  });

  it('reconhece erro de DNS/conexão do Chromium', () => {
    expect(isNetworkError({ message: 'net::ERR_INTERNET_DISCONNECTED' })).toBe(true);
  });

  it('não confunde erro de permissão (RLS) com falha de rede', () => {
    expect(isNetworkError({ message: 'new row violates row-level security policy' })).toBe(false);
  });

  it('não confunde "sem linha" (PGRST116, obra sem cronograma) com falha de rede', () => {
    expect(isNetworkError({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' })).toBe(false);
  });

  it('não confunde campo obrigatório faltando com falha de rede', () => {
    expect(isNetworkError({ message: 'null value in column "nome" violates not-null constraint' })).toBe(false);
  });

  it('lida com error nulo/indefinido sem quebrar', () => {
    expect(isNetworkError(null)).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
  });
});
