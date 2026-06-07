/**
 * Testes de segurança — executados contra o Supabase real (não mocks).
 * Requer duas contas de teste configuradas:
 *   TEST_USER_A_EMAIL / TEST_USER_A_PASS  → usuário A
 *   TEST_USER_B_EMAIL / TEST_USER_B_PASS  → usuário B (sem permissão admin)
 *
 * Rodar: npx vitest run src/__tests__/security.test.js
 */
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const URL  = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

const clienteA = createClient(URL, ANON);
const clienteB = createClient(URL, ANON);

let userA, userB;
const obrasCriadas = [];

beforeAll(async () => {
  const { data: sessaoA } = await clienteA.auth.signInWithPassword({
    email: process.env.TEST_USER_A_EMAIL,
    password: process.env.TEST_USER_A_PASS,
  });
  const { data: sessaoB } = await clienteB.auth.signInWithPassword({
    email: process.env.TEST_USER_B_EMAIL,
    password: process.env.TEST_USER_B_PASS,
  });
  userA = sessaoA?.user;
  userB = sessaoB?.user;
  if (!userA || !userB) throw new Error('Configure TEST_USER_A_* e TEST_USER_B_* no env');
});

afterAll(async () => {
  // Limpeza: remove obras criadas pelo teste usando o cliente do dono
  for (const { id, cliente } of obrasCriadas) {
    await cliente.from('obras').delete().eq('id', id);
  }
  await clienteA.auth.signOut();
  await clienteB.auth.signOut();
});

// ──────────────────────────────────────────────────────────
// VULN-1: RLS — isolamento de dados entre usuários (IDOR)
// ──────────────────────────────────────────────────────────
describe('VULN-1: RLS — Isolamento cross-tenant (IDOR CWE-639)', () => {
  test('Usuário B não deve conseguir ler obra criada pelo Usuário A', async () => {
    const { data: obra, error: errCriacao } = await clienteA
      .from('obras')
      .insert([{ nome: 'Obra Secreta A', user_id: userA.id }])
      .select()
      .single();
    expect(errCriacao).toBeNull();
    obrasCriadas.push({ id: obra.id, cliente: clienteA });

    const { data, error } = await clienteB
      .from('obras')
      .select('*')
      .eq('id', obra.id)
      .single();

    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  test('Usuário B não deve conseguir deletar obra do Usuário A', async () => {
    const { data: obra } = await clienteA
      .from('obras')
      .insert([{ nome: 'Obra Para Deletar', user_id: userA.id }])
      .select()
      .single();
    obrasCriadas.push({ id: obra.id, cliente: clienteA });

    await clienteB.from('obras').delete().eq('id', obra.id);

    const { data: check } = await clienteA
      .from('obras')
      .select('id')
      .eq('id', obra.id)
      .single();

    expect(check).not.toBeNull();
  });

  test('Listagem de obras retorna apenas as do próprio usuário', async () => {
    const { data } = await clienteB.from('obras').select('*');
    data?.forEach(obra => expect(obra.user_id).toBe(userB.id));
  });
});

// ──────────────────────────────────────────────────────────
// VULN-2: Privilege Escalation + Trilha de Auditoria
// ──────────────────────────────────────────────────────────
describe('VULN-2: Privilege Escalation via user_profiles (CWE-269)', () => {
  test('Usuário B não deve escalar para perfil admin', async () => {
    const { error } = await clienteB
      .from('user_profiles')
      .update({ perfil: 'admin' })
      .eq('id', userB.id);

    expect(error).not.toBeNull();

    const { data: profile } = await clienteB
      .from('user_profiles')
      .select('perfil')
      .eq('id', userB.id)
      .single();

    expect(profile?.perfil).not.toBe('admin');
  });

  test('Usuário B não deve ler perfil do Usuário A', async () => {
    const { data } = await clienteB
      .from('user_profiles')
      .select('*')
      .eq('id', userA.id)
      .single();

    expect(data).toBeNull();
  });

  test('Audit logs não devem ser deletáveis por usuário comum', async () => {
    const { error } = await clienteB
      .from('audit_logs')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    expect(error).not.toBeNull();
  });

  test('Audit logs não devem ser modificáveis por usuário comum', async () => {
    const { data: logs } = await clienteB.from('audit_logs').select('id').limit(1);
    if (!logs || logs.length === 0) return;
    const { error } = await clienteB
      .from('audit_logs')
      .update({ acao: 'MANIPULADO' })
      .eq('id', logs[0].id);

    expect(error).not.toBeNull();
  });
});

// ──────────────────────────────────────────────────────────
// VULN-6: estimativas_base — somente leitura
// ──────────────────────────────────────────────────────────
describe('VULN-6: estimativas_base — leitura OK, escrita bloqueada (CWE-732)', () => {
  test('Usuário autenticado pode LEITURA de estimativas_base', async () => {
    const { error } = await clienteB.from('estimativas_base').select('id').limit(1);
    expect(error).toBeNull();
  });

  test('Usuário autenticado NÃO deve modificar estimativas_base', async () => {
    const { data } = await clienteB.from('estimativas_base').select('id').limit(1);
    if (!data || data.length === 0) return;
    const { error } = await clienteB
      .from('estimativas_base')
      .update({ custo_m2: 0.01 })
      .eq('id', data[0].id);
    expect(error).not.toBeNull();
  });

  test('Usuário autenticado NÃO deve inserir em estimativas_base', async () => {
    const { error } = await clienteB
      .from('estimativas_base')
      .insert([{ tipo: 'TESTE_MALICIOSO', custo_m2: 999 }]);
    expect(error).not.toBeNull();
  });
});

// ──────────────────────────────────────────────────────────
// VULN-3: permissions.js — Fail-Secure (testes unitários puros)
// ──────────────────────────────────────────────────────────
describe('VULN-3: permissions.js — Fail-Secure (CWE-636)', () => {
  test('podeVerAba retorna false quando userProfile é null', async () => {
    const { podeVerAba } = await import('../utils/permissions.js');
    expect(podeVerAba(null, 'admin', 'usuarios')).toBe(false);
  });

  test('podeVerAba retorna false quando não há restrições definidas para o módulo', async () => {
    const { podeVerAba } = await import('../utils/permissions.js');
    const perfil = { perfil: 'usuario', abas_ids: [] };
    expect(podeVerAba(perfil, 'admin', 'usuarios')).toBe(false);
  });

  test('podeVerAba retorna true para admin independente do módulo', async () => {
    const { podeVerAba } = await import('../utils/permissions.js');
    const admin = { perfil: 'admin', abas_ids: [] };
    expect(podeVerAba(admin, 'qualquer', 'aba')).toBe(true);
  });

  test('podeVerAba respeita whitelist de abas quando definida', async () => {
    const { podeVerAba } = await import('../utils/permissions.js');
    const perfil = { perfil: 'usuario', abas_ids: ['cronograma.gantt'] };
    expect(podeVerAba(perfil, 'cronograma', 'gantt')).toBe(true);
    expect(podeVerAba(perfil, 'cronograma', 'outro')).toBe(false);
  });
});
