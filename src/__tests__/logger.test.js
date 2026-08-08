import { describe, test, expect, afterEach } from 'vitest';
import { maskSensitive, buildLogEntry, setContext, clearContext } from '../services/logger';

afterEach(() => clearContext());

describe('maskSensitive — data masking', () => {
  test('redige chaves sensíveis (senha, password, token, secret)', () => {
    const out = maskSensitive({ senha: '123', password: 'abc', access_token: 'x', apiKey: 'k', nome: 'Joao' });
    expect(out.senha).toBe('[REDACTED]');
    expect(out.password).toBe('[REDACTED]');
    expect(out.access_token).toBe('[REDACTED]');
    expect(out.apiKey).toBe('[REDACTED]');
    expect(out.nome).toBe('Joao'); // campo normal preservado
  });

  test('redige CPF/CNPJ/RG/dados bancários', () => {
    const out = maskSensitive({ cpf: '111', cnpj: '222', rg: '333', dados_bancarios: 'ag/cc' });
    expect(out).toEqual({ cpf: '[REDACTED]', cnpj: '[REDACTED]', rg: '[REDACTED]', dados_bancarios: '[REDACTED]' });
  });

  test('mascara e-mail parcialmente', () => {
    expect(maskSensitive({ email: 'joao.silva@soter.com.br' }).email).toBe('j***@soter.com.br');
    expect(maskSensitive({ userEmail: 'a@b.com' }).userEmail).toBe('a***@b.com');
  });

  test('funciona em objetos aninhados e arrays', () => {
    const out = maskSensitive({ user: { token: 't', perfil: 'admin' }, itens: [{ password: 'p' }] });
    expect(out.user.token).toBe('[REDACTED]');
    expect(out.user.perfil).toBe('admin');
    expect(out.itens[0].password).toBe('[REDACTED]');
  });

  test('serializa Error sem vazar objeto cru', () => {
    const e = new Error('boom');
    const out = maskSensitive(e);
    expect(out.name).toBe('Error');
    expect(out.message).toBe('boom');
    expect(typeof out.stack === 'string' || out.stack === undefined).toBe(true);
  });

  test('protege contra referência circular', () => {
    const a = { nome: 'x' }; a.self = a;
    const out = maskSensitive(a);
    expect(out.nome).toBe('x');
    expect(out.self).toBe('[Circular]');
  });
});

describe('buildLogEntry — formato estruturado', () => {
  test('inclui ts, level, msg e requestId', () => {
    const e = buildLogEntry('info', 'ola');
    expect(e.level).toBe('info');
    expect(e.msg).toBe('ola');
    expect(typeof e.ts).toBe('string');
    expect(typeof e.requestId).toBe('string');
  });

  test('separa module/action e aplica masking em data e err', () => {
    const e = buildLogEntry('error', 'falhou', {
      module: 'auth', action: 'login',
      payload: { password: 'segredo', email: 'x@y.com' },
      err: new Error('rede'),
    });
    expect(e.module).toBe('auth');
    expect(e.action).toBe('login');
    expect(e.data.payload.password).toBe('[REDACTED]');
    expect(e.data.payload.email).toBe('x***@y.com');
    expect(e.err.message).toBe('rede');
  });

  test('inclui o contexto global (userId) quando setado', () => {
    setContext({ userId: 'u-123', userEmail: 'admin@soter.com.br' });
    const e = buildLogEntry('info', 'com contexto');
    expect(e.userId).toBe('u-123');
    // e-mail do contexto não passa pelo masking de data, mas não é dado de payload;
    // é apenas identificação da sessão. Confirma que o userId chega ao log.
  });
});
