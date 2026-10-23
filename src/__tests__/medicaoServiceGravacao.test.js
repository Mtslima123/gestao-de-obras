// BUG-019 e BUG-020: o serviço da medição abria o mês com upsert e gravava/excluía sem condição
// de versão, então podia sobrescrever o rascunho de outro aparelho. Aqui o cliente do Supabase é
// simulado para travar COMO o serviço fala com o banco (insert em vez de upsert, e as condições
// eq de status e updated_at), que é o que impede a perda de dados.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ chamadas: [], fila: [], padrao: { data: null, error: null } }));

vi.mock('../services/supabase', () => {
  const fazer = (tabela) => {
    const q = { tabela, ops: [] };
    const proxy = new Proxy(q, {
      get(alvo, prop) {
        if (prop === 'then') {
          const resp = mocks.fila.length ? mocks.fila.shift() : mocks.padrao;
          return (res, rej) => Promise.resolve(resp).then(res, rej);
        }
        return (...args) => { alvo.ops.push([prop, ...args]); return proxy; };
      },
    });
    mocks.chamadas.push(q);
    return proxy;
  };
  return { supabase: { from: (t) => fazer(t) } };
});
vi.mock('../services/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() } }));

import { medicaoMensalService } from '../modules/cronograma/medicaoMensal.service';

const nomes = (q) => q.ops.map(o => o[0]);
const eqs = (q) => q.ops.filter(o => o[0] === 'eq').map(o => [o[1], o[2]]);
const itens = [{ id: 'A', percMedido: 10, visto: true }];

beforeEach(() => { mocks.chamadas.length = 0; mocks.fila.length = 0; mocks.padrao = { data: null, error: null }; });

describe('medicaoMensalService.abrir', () => {
  it('abre com INSERT, nunca com upsert (não sobrescreve rascunho que já existe)', async () => {
    mocks.padrao = { data: { id: 7, status: 'rascunho' }, error: null };
    const r = await medicaoMensalService.abrir('OB-1', '2026-09', itens, { percPrevisto: 12.5, percPrevistoAcumulado: 40 });
    expect(r.error).toBeNull();
    expect(r.data.id).toBe(7);
    const q = mocks.chamadas[0];
    expect(q.tabela).toBe('medicoes_mensais');
    expect(nomes(q)).toContain('insert');
    expect(nomes(q)).not.toContain('upsert');
    const payload = q.ops.find(o => o[0] === 'insert')[1];
    expect(payload).toMatchObject({ obra_id: 'OB-1', mes_referencia: '2026-09', status: 'rascunho', perc_previsto: 12.5, perc_previsto_acumulado: 40 });
    expect(payload.itens).toHaveLength(1);
  });

  it('mês que já existe (23505): devolve jaExiste e NÃO é tratado como falha de gravação', async () => {
    mocks.padrao = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
    const r = await medicaoMensalService.abrir('OB-1', '2026-09', itens, {});
    expect(r.jaExiste).toBe(true);
    expect(r.data).toBeNull();
    expect(mocks.chamadas).toHaveLength(1); // não tentou de novo
  });

  it('outro erro: devolve o erro, sem jaExiste', async () => {
    mocks.padrao = { data: null, error: { code: '42501', message: 'permission denied' } };
    const r = await medicaoMensalService.abrir('OB-1', '2026-09', itens, {});
    expect(r.jaExiste).toBeUndefined();
    expect(r.error.code).toBe('42501');
    expect(r.data).toBeNull();
  });

  it('coluna do previsto ainda não existe no banco: tenta de novo sem elas, ainda com INSERT', async () => {
    mocks.fila.push({ data: null, error: { code: 'PGRST204', message: "Could not find the 'perc_previsto' column" } });
    mocks.fila.push({ data: { id: 9, status: 'rascunho' }, error: null });
    const r = await medicaoMensalService.abrir('OB-1', '2026-09', itens, { percPrevisto: 1, percPrevistoAcumulado: 2 });
    expect(r.data.id).toBe(9);
    expect(mocks.chamadas).toHaveLength(2);
    const segundo = mocks.chamadas[1].ops.find(o => o[0] === 'insert')[1];
    expect(segundo).not.toHaveProperty('perc_previsto');
    expect(segundo).not.toHaveProperty('perc_previsto_acumulado');
    expect(nomes(mocks.chamadas[1])).not.toContain('upsert');
  });

  it('sem linha e sem erro não conta como aberta', async () => {
    mocks.padrao = { data: null, error: null };
    const r = await medicaoMensalService.abrir('OB-1', '2026-09', itens, {});
    expect(r.data).toBeNull();
    expect(r.error).toBeTruthy();
  });
});

describe('medicaoMensalService.excluir', () => {
  it('sem versão esperada: só obra e mês (comportamento anterior)', async () => {
    mocks.padrao = { data: [{ id: 1 }], error: null };
    await medicaoMensalService.excluir('OB-1', '2026-09');
    expect(eqs(mocks.chamadas[0])).toEqual([['obra_id', 'OB-1'], ['mes_referencia', '2026-09']]);
  });

  it('com versão esperada: só apaga rascunho com o mesmo updated_at (BUG-020)', async () => {
    mocks.padrao = { data: [{ id: 1 }], error: null };
    await medicaoMensalService.excluir('OB-1', '2026-09', { updatedAtEsperado: '2026-10-22T10:00:00+00:00' });
    expect(eqs(mocks.chamadas[0])).toEqual([
      ['obra_id', 'OB-1'], ['mes_referencia', '2026-09'],
      ['status', 'rascunho'], ['updated_at', '2026-10-22T10:00:00+00:00'],
    ]);
    expect(nomes(mocks.chamadas[0])).toContain('delete');
  });

  it('nada apagado (versão mudou): devolve lista vazia para quem chama conferir', async () => {
    mocks.padrao = { data: [], error: null };
    const r = await medicaoMensalService.excluir('OB-1', '2026-09', { updatedAtEsperado: 'x' });
    expect(r.error).toBeNull();
    expect(r.data).toEqual([]);
  });
});

describe('medicaoMensalService.salvarRascunhoCondicional (gravação da lista)', () => {
  it('é UPDATE condicional por id, status rascunho e updated_at: nunca upsert', async () => {
    mocks.padrao = { data: { id: 3, updated_at: 'novo' }, error: null };
    const r = await medicaoMensalService.salvarRascunhoCondicional({ id: 3, itens, updatedAtEsperado: 'antigo' });
    expect(r.data.updated_at).toBe('novo');
    const q = mocks.chamadas[0];
    expect(nomes(q)).toContain('update');
    expect(nomes(q)).not.toContain('upsert');
    expect(eqs(q)).toEqual([['id', 3], ['status', 'rascunho'], ['updated_at', 'antigo']]);
  });

  it('versão mudou: data null sem erro (é o que a tela trata como conflito)', async () => {
    mocks.padrao = { data: null, error: null };
    const r = await medicaoMensalService.salvarRascunhoCondicional({ id: 3, itens, updatedAtEsperado: 'antigo' });
    expect(r.data).toBeNull();
    expect(r.error).toBeNull();
  });
});

describe('o serviço não tem mais gravação de rascunho sem condição', () => {
  it('salvarRascunho (upsert) foi removido', () => {
    expect(medicaoMensalService.salvarRascunho).toBeUndefined();
  });
});
