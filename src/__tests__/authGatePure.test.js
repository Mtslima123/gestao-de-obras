import { describe, it, expect } from 'vitest';
import { decidirFonteDeSessao } from '../utils/authGatePure';

describe('decidirFonteDeSessao', () => {
  it('usa a sessão real quando ela existe, mesmo havendo cache', () => {
    const session = { user: { id: '1', email: 'a@soter.com.br' } };
    expect(decidirFonteDeSessao({ session, temCache: true })).toBe('sessao');
    expect(decidirFonteDeSessao({ session, temCache: false })).toBe('sessao');
  });

  it('SIGNED_OUT deliberado (botão Sair) sempre desloga, mesmo com cache disponível', () => {
    expect(decidirFonteDeSessao({ session: null, event: 'SIGNED_OUT', temCache: true, deslogamentoDeliberado: true })).toBe('deslogado');
    expect(decidirFonteDeSessao({ session: null, event: 'SIGNED_OUT', temCache: false, deslogamentoDeliberado: true })).toBe('deslogado');
  });

  it('SIGNED_OUT NÃO deliberado (disparado pelo SDK, ex.: sessão corrompida por aba encerrada) usa o cache quando existe', () => {
    expect(decidirFonteDeSessao({ session: null, event: 'SIGNED_OUT', temCache: true, deslogamentoDeliberado: false })).toBe('cache');
  });

  it('SIGNED_OUT não deliberado e sem cache desloga (nada pra restaurar)', () => {
    expect(decidirFonteDeSessao({ session: null, event: 'SIGNED_OUT', temCache: false, deslogamentoDeliberado: false })).toBe('deslogado');
  });

  it('INITIAL_SESSION com sessão nula usa o cache quando existe (reload offline, ou a aba foi reiniciada pelo celular)', () => {
    expect(decidirFonteDeSessao({ session: null, event: 'INITIAL_SESSION', temCache: true })).toBe('cache');
  });

  it('INITIAL_SESSION com sessão nula e sem cache desloga (primeira visita de verdade)', () => {
    expect(decidirFonteDeSessao({ session: null, event: 'INITIAL_SESSION', temCache: false })).toBe('deslogado');
  });

  it('chamada direta a getSession() sem evento usa o cache quando existe', () => {
    expect(decidirFonteDeSessao({ session: null, temCache: true })).toBe('cache');
  });

  it('chamada direta a getSession() sem evento e sem cache desloga', () => {
    expect(decidirFonteDeSessao({ session: null, temCache: false })).toBe('deslogado');
  });
});
