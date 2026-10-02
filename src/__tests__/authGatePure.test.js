import { describe, it, expect } from 'vitest';
import { decidirFonteDeSessao } from '../utils/authGatePure';

const SESSAO = { user: { id: '1', email: 'a@soter.com.br' } };

describe('decidirFonteDeSessao', () => {
  it('usa a sessão real quando ela existe, mesmo havendo cache', () => {
    expect(decidirFonteDeSessao({ session: SESSAO, temCache: true })).toBe('sessao');
    expect(decidirFonteDeSessao({ session: SESSAO, temCache: false, event: 'SIGNED_IN' })).toBe('sessao');
  });

  it('ignora INITIAL_SESSION (o boot é decidido pela chamada direta a getSession, que tem o erro real)', () => {
    expect(decidirFonteDeSessao({ session: null, event: 'INITIAL_SESSION', temCache: true, offline: true })).toBe('ignorar');
    expect(decidirFonteDeSessao({ session: SESSAO, event: 'INITIAL_SESSION', temCache: false })).toBe('ignorar');
  });

  it('reabrir COM internet sem sessão real vai pro login, mesmo havendo cache (não fica "logado" pelo cache)', () => {
    expect(decidirFonteDeSessao({ session: null, temCache: true, erroDeRede: false, offline: false })).toBe('deslogado');
  });

  it('sem sessão por falha de rede usa o cache quando existe', () => {
    expect(decidirFonteDeSessao({ session: null, temCache: true, erroDeRede: true, offline: false })).toBe('cache');
  });

  it('aparelho offline sem sessão (ex.: aba encerrada pelo celular) usa o cache quando existe', () => {
    expect(decidirFonteDeSessao({ session: null, temCache: true, erroDeRede: false, offline: true })).toBe('cache');
  });

  it('sem rede e sem cache desloga (nada pra restaurar)', () => {
    expect(decidirFonteDeSessao({ session: null, temCache: false, erroDeRede: true, offline: true })).toBe('deslogado');
  });

  it('SIGNED_OUT pelo botão Sair sempre desloga, mesmo offline e com cache', () => {
    expect(decidirFonteDeSessao({ session: null, event: 'SIGNED_OUT', temCache: true, deslogamentoDeliberado: true, offline: true })).toBe('deslogado');
  });

  it('depois do Sair, um refresh de token que termina tarde (TOKEN_REFRESHED com sessão) NÃO reloga', () => {
    expect(decidirFonteDeSessao({ session: SESSAO, event: 'TOKEN_REFRESHED', temCache: true, deslogamentoDeliberado: true })).toBe('deslogado');
    expect(decidirFonteDeSessao({ session: SESSAO, temCache: true, deslogamentoDeliberado: true })).toBe('deslogado');
  });

  it('SIGNED_OUT disparado pelo SDK offline usa o cache', () => {
    expect(decidirFonteDeSessao({ session: null, event: 'SIGNED_OUT', temCache: true, deslogamentoDeliberado: false, offline: true })).toBe('cache');
  });

  it('SIGNED_OUT disparado pelo SDK COM internet desloga (ex.: refresh token recusado)', () => {
    expect(decidirFonteDeSessao({ session: null, event: 'SIGNED_OUT', temCache: true, deslogamentoDeliberado: false, offline: false })).toBe('deslogado');
  });
});
