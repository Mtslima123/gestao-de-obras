// BUG-003: só "zero linhas" (PGRST116) significa obra sem cronograma. Qualquer outro erro de
// leitura não pode abrir o modo demonstração com a edição liberada.
import { describe, it, expect } from 'vitest';
import { ehObraSemCronograma, CODIGO_SEM_LINHA, MSG_ERRO_CARGA_SERVIDOR } from '../modules/cronograma/erroCargaPure';

describe('ehObraSemCronograma', () => {
  it('PGRST116 (zero linhas no .single()) é obra sem cronograma', () => {
    expect(ehObraSemCronograma({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' })).toBe(true);
    expect(CODIGO_SEM_LINHA).toBe('PGRST116');
  });

  it.each([
    ['HTTP 503', { code: '503', status: 503, message: 'Service Unavailable' }],
    ['JWT expirado', { code: 'PGRST301', message: 'JWT expired' }],
    ['statement timeout', { code: '57014', message: 'canceling statement due to statement timeout' }],
    ['erro sem código', { message: 'algo deu errado' }],
    ['erro como texto', 'boom'],
  ])('%s NÃO é obra sem cronograma', (_nome, erro) => {
    expect(ehObraSemCronograma(erro)).toBe(false);
  });

  it('sem erro, null ou undefined: não é obra sem cronograma', () => {
    expect(ehObraSemCronograma(null)).toBe(false);
    expect(ehObraSemCronograma(undefined)).toBe(false);
  });

  it('a mensagem de erro de carga avisa que nada foi alterado e que a edição está bloqueada', () => {
    expect(MSG_ERRO_CARGA_SERVIDOR).toMatch(/Nada foi alterado/);
    expect(MSG_ERRO_CARGA_SERVIDOR).toMatch(/bloqueada/);
  });
});
