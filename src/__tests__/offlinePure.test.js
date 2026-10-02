import { describe, it, expect } from 'vitest';
import { chaveLeitura, leituraValida, quandoFoiGuardado, reduzirReprogramacoes, VERSAO_CACHE, VALIDADE_CACHE_MS, VERSAO_FILA, itensParaEnviar, proximoAtraso, arquivoJaExiste, ehFalhaPassageira, itemDaFilaVencido } from '../utils/offlinePure';
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

describe('fila de envio: itensParaEnviar', () => {
  const tipos = new Set(['foto']);
  const item = (extra) => ({ id: 'x', tipo: 'foto', userId: 'u1', versao: VERSAO_FILA, status: 'pendente', criadoEm: '2026-10-02T10:00:00.000Z', ...extra });

  it('só envia itens da pessoa logada (nunca a foto de outra com a sessão errada)', () => {
    const r = itensParaEnviar([item({ id: 'a' }), item({ id: 'b', userId: 'u2' })], { uid: 'u1', tipos });
    expect(r.map(i => i.id)).toEqual(['a']);
  });

  it('pula "revisar", versão antiga e tipo sem quem envie', () => {
    const r = itensParaEnviar([
      item({ id: 'revisar', status: 'revisar' }),
      item({ id: 'velho', versao: VERSAO_FILA - 1 }),
      item({ id: 'medicao', tipo: 'medicao-rascunho' }),
      item({ id: 'ok' }),
    ], { uid: 'u1', tipos });
    expect(r.map(i => i.id)).toEqual(['ok']);
  });

  it('envia do mais antigo pro mais novo', () => {
    const r = itensParaEnviar([
      item({ id: 'novo', criadoEm: '2026-10-02T12:00:00.000Z' }),
      item({ id: 'antigo', criadoEm: '2026-10-02T09:00:00.000Z' }),
    ], { uid: 'u1', tipos });
    expect(r.map(i => i.id)).toEqual(['antigo', 'novo']);
  });
});

describe('fila de envio: proximoAtraso', () => {
  it('espaça as tentativas e para no teto de 5 min', () => {
    expect(proximoAtraso(0)).toBe(15000);
    expect(proximoAtraso(1)).toBe(30000);
    expect(proximoAtraso(4)).toBe(300000);
    expect(proximoAtraso(50)).toBe(300000);
  });
});

describe('fila de envio: arquivoJaExiste', () => {
  it('reconhece o "já existe" do Storage (reenvio de foto que já tinha subido)', () => {
    expect(arquivoJaExiste({ statusCode: '409', message: 'Duplicate' })).toBe(true);
    expect(arquivoJaExiste({ message: 'The resource already exists' })).toBe(true);
    expect(arquivoJaExiste({ statusCode: '403', message: 'new row violates row-level security policy' })).toBe(false);
    expect(arquivoJaExiste(null)).toBe(false);
  });
});

describe('fila de envio: ehFalhaPassageira', () => {
  it('sem rede, servidor fora e tempo esgotado tentam de novo depois', () => {
    expect(ehFalhaPassageira({ message: 'TypeError: Failed to fetch' })).toBe(true);
    expect(ehFalhaPassageira({ name: 'StorageUnknownError', message: 'algo' })).toBe(true);
    expect(ehFalhaPassageira({ timeout: true })).toBe(true);
    expect(ehFalhaPassageira({ status: 0 })).toBe(true);
    expect(ehFalhaPassageira({ statusCode: '503', message: 'Service Unavailable' })).toBe(true);
  });

  it('permissão e dado recusado não adianta repetir', () => {
    expect(ehFalhaPassageira({ statusCode: '403', message: 'new row violates row-level security policy' })).toBe(false);
    expect(ehFalhaPassageira({ code: '42501', message: 'permission denied for table fotos_obra' })).toBe(false);
    expect(ehFalhaPassageira({ code: '23502', message: 'null value in column "obra_id"' })).toBe(false);
  });

  it('respeita a classificação já feita por quem lançou o erro', () => {
    expect(ehFalhaPassageira({ passageira: false, message: 'Failed to fetch' })).toBe(false);
    expect(ehFalhaPassageira({ passageira: true, message: 'qualquer' })).toBe(true);
  });
});

describe('fila de envio: erros do banco (postgrest) com o status da resposta', () => {
  it('servidor fora por um instante tenta de novo sozinho', () => {
    expect(ehFalhaPassageira({ code: 'PGRST002', message: 'Could not query the database for the schema cache. Retrying.', status: 503 })).toBe(true);
    expect(ehFalhaPassageira({ code: '57014', message: 'canceling statement due to statement timeout', status: 500 })).toBe(true);
    expect(ehFalhaPassageira({ message: '<html>520</html>', status: 520 })).toBe(true);
  });

  it('login vencido (401) tenta de novo depois da renovação', () => {
    expect(ehFalhaPassageira({ code: 'PGRST301', message: 'JWT expired', status: 401 })).toBe(true);
  });

  it('permissão continua definitiva', () => {
    expect(ehFalhaPassageira({ code: '42501', message: 'new row violates row-level security policy for table "fotos_obra"', status: 403 })).toBe(false);
  });
});

describe('fila de envio: itemDaFilaVencido', () => {
  const AGORA_FILA = Date.parse('2026-10-02T12:00:00.000Z');
  it('mais de 30 dias na fila vence; menos não', () => {
    expect(itemDaFilaVencido({ criadoEm: '2026-08-01T12:00:00.000Z' }, AGORA_FILA)).toBe(true);
    expect(itemDaFilaVencido({ criadoEm: '2026-09-20T12:00:00.000Z' }, AGORA_FILA)).toBe(false);
  });
  it('sem data válida conta como vencido (não fica retido pra sempre)', () => {
    expect(itemDaFilaVencido({}, AGORA_FILA)).toBe(true);
  });
});
