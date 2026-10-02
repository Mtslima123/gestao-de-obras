import { describe, it, expect, vi, afterEach } from 'vitest';
import { isNetworkError } from '../utils/connectivity';

describe('isNetworkError', () => {
  it('reconhece falha real de fetch', () => {
    expect(isNetworkError({ message: 'TypeError: Failed to fetch' })).toBe(true);
  });

  it('reconhece erro de DNS/conexão do Chromium', () => {
    expect(isNetworkError({ message: 'net::ERR_INTERNET_DISCONNECTED' })).toBe(true);
  });

  it('reconhece as mensagens de rede do Safari/WebKit (iPhone, inclusive Chrome no iOS)', () => {
    expect(isNetworkError({ message: 'TypeError: Load failed' })).toBe(true);
    expect(isNetworkError({ message: 'The Internet connection appears to be offline.' })).toBe(true);
    expect(isNetworkError({ message: 'The network connection was lost.' })).toBe(true);
  });

  it('reconhece a mensagem de rede do Firefox', () => {
    expect(isNetworkError({ message: 'NetworkError when attempting to fetch resource.' })).toBe(true);
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

// Volta da conexão em "sem sinal" (navigator.onLine nunca muda): quem avisa as telas é a
// primeira requisição que dá certo depois de uma falha. Módulo recarregado a cada teste
// porque guarda estado (offline, horários dos avisos).
describe('aviso de reconexão por sucesso depois de falha', () => {
  const REDE = { message: 'TypeError: Failed to fetch' };
  const carregar = async () => {
    vi.resetModules();
    return import('../utils/connectivity');
  };
  afterEach(() => { vi.useRealTimers(); });

  it('avisa quem espera reconexão quando uma requisição dá certo depois de falhar', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 2, 12, 0, 0));
    const { connectivity, onNetworkReconnect } = await carregar();
    const ouvinte = vi.fn();
    onNetworkReconnect(ouvinte);
    connectivity.reportError(REDE);
    connectivity.reportSuccess();
    expect(ouvinte).toHaveBeenCalledTimes(1);
  });

  it('não avisa de novo se não houve falha depois do último aviso', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 2, 12, 0, 0));
    const { connectivity, onNetworkReconnect } = await carregar();
    const ouvinte = vi.fn();
    onNetworkReconnect(ouvinte);
    connectivity.reportError(REDE);
    connectivity.reportSuccess();
    connectivity.reportSuccess(); // já online: não é transição
    expect(ouvinte).toHaveBeenCalledTimes(1);
  });

  it('dentro de 30s adia o aviso pro fim da janela em vez de descartar', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 2, 12, 0, 0));
    const { connectivity, onNetworkReconnect } = await carregar();
    const ouvinte = vi.fn();
    onNetworkReconnect(ouvinte);
    connectivity.reportError(REDE);
    connectivity.reportSuccess();          // 1º aviso, na hora
    vi.advanceTimersByTime(5000);
    connectivity.reportError(REDE);        // caiu de novo
    connectivity.reportSuccess();          // voltou: dentro da janela, fica adiado
    expect(ouvinte).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(25000);
    expect(ouvinte).toHaveBeenCalledTimes(2);
  });

  it('erro que não é de rede não conta como falha', async () => {
    vi.useFakeTimers();
    const { connectivity, onNetworkReconnect } = await carregar();
    const ouvinte = vi.fn();
    onNetworkReconnect(ouvinte);
    connectivity.reportError({ message: 'permission denied for table obras' });
    connectivity.reportSuccess();
    expect(ouvinte).not.toHaveBeenCalled();
  });
});
