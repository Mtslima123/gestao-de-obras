import { describe, it, expect } from 'vitest';
import { chaveLeitura, leituraValida, quandoFoiGuardado, reduzirReprogramacoes, VERSAO_CACHE, VALIDADE_CACHE_MS } from '../utils/offlinePure';
import { mesesComReprogramacao } from '../modules/cronograma/scheduleEngine';

const AGORA = new Date(2026, 9, 2, 15, 0).getTime(); // 02/10/2026 15:00 (hora local)
const reg = (extra = {}) => ({ userId: 'u1', versao: VERSAO_CACHE, salvoEm: AGORA - 60_000, dados: {}, ...extra });

describe('chaveLeitura', () => {
  it('começa pelo usuário (limpeza por pessoa e isolamento no tablet compartilhado)', () => {
    expect(chaveLeitura('u1', 'medicao', 'obra9|2026-10')).toBe('u1|medicao|obra9|2026-10');
    expect(chaveLeitura('u1', 'obras')).toBe('u1|obras|-');
  });
});

describe('leituraValida', () => {
  it('aceita registro do próprio usuário, da versão atual e dentro da validade', () => {
    expect(leituraValida(reg(), { uid: 'u1', agora: AGORA })).toBe(true);
  });

  it('recusa registro de outro usuário', () => {
    expect(leituraValida(reg(), { uid: 'u2', agora: AGORA })).toBe(false);
  });

  it('recusa sem usuário definido ou sem registro', () => {
    expect(leituraValida(reg(), { uid: null, agora: AGORA })).toBe(false);
    expect(leituraValida(undefined, { uid: 'u1', agora: AGORA })).toBe(false);
  });

  it('recusa formato de outra versão', () => {
    expect(leituraValida(reg({ versao: VERSAO_CACHE + 1 }), { uid: 'u1', agora: AGORA })).toBe(false);
  });

  it('recusa vencido (mais de 30 dias) e data no futuro (relógio do aparelho mexido)', () => {
    expect(leituraValida(reg({ salvoEm: AGORA - VALIDADE_CACHE_MS - 1 }), { uid: 'u1', agora: AGORA })).toBe(false);
    expect(leituraValida(reg({ salvoEm: AGORA + 60_000 }), { uid: 'u1', agora: AGORA })).toBe(false);
  });
});

describe('quandoFoiGuardado', () => {
  it('mesmo dia mostra "hoje às HH:MM"', () => {
    expect(quandoFoiGuardado(new Date(2026, 9, 2, 9, 5).getTime(), AGORA)).toBe('hoje às 09:05');
  });

  it('outro dia mostra a data', () => {
    expect(quandoFoiGuardado(new Date(2026, 8, 30, 18, 40).getTime(), AGORA)).toBe('30/09 às 18:40');
  });
});

describe('reduzirReprogramacoes', () => {
  const reps = [
    { id: 'r1', nome: 'Rep. set', mesRef: '2026-09', criadaEm: '2026-09-28T10:00:00Z', etapas: [{ id: 1 }], custo: 10 },
    { id: 'r2', nome: 'Antiga', criadaEm: '2026-08-15T10:00:00Z', etapas: [{ id: 1 }] },
  ];

  it('guarda só o cabeçalho, sem a cópia do cronograma', () => {
    expect(reduzirReprogramacoes(reps)).toEqual([
      { id: 'r1', nome: 'Rep. set', mesRef: '2026-09', criadaEm: '2026-09-28T10:00:00Z' },
      { id: 'r2', nome: 'Antiga', mesRef: undefined, criadaEm: '2026-08-15T10:00:00Z' },
    ]);
  });

  it('a Medição continua achando os mesmos meses reprogramados', () => {
    expect(mesesComReprogramacao(reduzirReprogramacoes(reps))).toEqual(mesesComReprogramacao(reps));
  });

  it('aceita lista ausente', () => {
    expect(reduzirReprogramacoes(undefined)).toEqual([]);
  });
});
