import { describe, it, expect } from 'vitest';
import { mensagemErroEfetivo, ehConflito, erroDoModulo } from '../modules/maoDeObra/efetivo/efetivoErro';

describe('efetivoErro', () => {
  it('usa a mensagem em português das funções mo_* (PT409, PT400, PT403, PT404)', () => {
    for (const code of ['PT409', 'PT400', 'PT403', 'PT404']) {
      expect(mensagemErroEfetivo({ code, message: 'Previsto trancado. Use "Editar previsto" para alterar.' }))
        .toBe('Previsto trancado. Use "Editar previsto" para alterar.');
    }
  });

  it('erro cru do Postgres passa pelo friendlyError, sem vazar texto técnico', () => {
    const msg = mensagemErroEfetivo({ code: '23505', message: 'duplicate key value violates unique constraint "mo_previsto_pkey"' });
    expect(msg).toMatch(/já existe/i);
    expect(msg).not.toContain('constraint');
  });

  it('42501 do RLS (inglês) não é tratado como mensagem do módulo', () => {
    const e = { code: '42501', message: 'permission denied for table mo_previsto' };
    expect(erroDoModulo(e)).toBe(false);
    expect(mensagemErroEfetivo(e)).toMatch(/não tem permissão/i);
  });

  it('falha de rede e erro nulo caem no texto genérico', () => {
    expect(mensagemErroEfetivo({ message: 'Failed to fetch' })).toMatch(/conexão/i);
    expect(mensagemErroEfetivo(null)).toMatch(/inesperado/i);
  });

  it('código do módulo sem mensagem cai no genérico', () => {
    expect(erroDoModulo({ code: 'PT409', message: '' })).toBe(false);
  });

  it('ehConflito só vale para PT409', () => {
    expect(ehConflito({ code: 'PT409' })).toBe(true);
    expect(ehConflito({ code: 'PT400' })).toBe(false);
    expect(ehConflito(null)).toBe(false);
  });
});
