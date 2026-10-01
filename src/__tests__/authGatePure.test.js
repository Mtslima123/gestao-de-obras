import { describe, it, expect } from 'vitest';
import { decidirFonteDeSessao } from '../utils/authGatePure';

const ERRO_REDE = { message: 'TypeError: Failed to fetch' };
const ERRO_INVALIDO = { message: 'invalid_grant' };

describe('decidirFonteDeSessao', () => {
  it('usa a sessão real quando ela existe, mesmo havendo cache', () => {
    const session = { user: { id: '1', email: 'a@soter.com.br' } };
    expect(decidirFonteDeSessao({ session, temCache: true })).toBe('sessao');
    expect(decidirFonteDeSessao({ session, temCache: false })).toBe('sessao');
  });

  it('SIGNED_OUT sempre desloga, mesmo com cache disponível', () => {
    expect(decidirFonteDeSessao({ session: null, event: 'SIGNED_OUT', temCache: true })).toBe('deslogado');
    expect(decidirFonteDeSessao({ session: null, event: 'SIGNED_OUT', temCache: false })).toBe('deslogado');
  });

  it('INITIAL_SESSION com sessão nula usa o cache quando existe (reload offline)', () => {
    expect(decidirFonteDeSessao({ session: null, event: 'INITIAL_SESSION', temCache: true })).toBe('cache');
  });

  it('INITIAL_SESSION com sessão nula e sem cache desloga (primeira visita de verdade)', () => {
    expect(decidirFonteDeSessao({ session: null, event: 'INITIAL_SESSION', temCache: false })).toBe('deslogado');
  });

  it('chamada direta a getSession() com erro de rede usa o cache quando existe', () => {
    expect(decidirFonteDeSessao({ session: null, error: ERRO_REDE, temCache: true })).toBe('cache');
  });

  it('chamada direta a getSession() com erro de rede mas sem cache desloga', () => {
    expect(decidirFonteDeSessao({ session: null, error: ERRO_REDE, temCache: false })).toBe('deslogado');
  });

  it('chamada direta a getSession() com erro que não é de rede desloga, mesmo com cache', () => {
    expect(decidirFonteDeSessao({ session: null, error: ERRO_INVALIDO, temCache: true })).toBe('deslogado');
  });

  it('sem sessão, sem evento e sem erro desloga (nunca logou)', () => {
    expect(decidirFonteDeSessao({ session: null, temCache: true })).toBe('deslogado');
    expect(decidirFonteDeSessao({ session: null, temCache: false })).toBe('deslogado');
  });
});
