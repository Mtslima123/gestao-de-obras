// BUG-002: importar em "Substituir" apagava todos os itens do orçamento e, pelo ON DELETE
// CASCADE, todos os vínculos com o cronograma, sem aviso. Só substitui orçamento sem vínculo,
// e só com a resposta do banco em mãos.
import { describe, it, expect } from 'vitest';
import {
  avaliarSubstituicao, MSG_SUBSTITUIR_COM_VINCULO, MSG_SUBSTITUIR_SEM_CONSULTA,
} from '../modules/financeiro/importacaoOrcamentoPure';

describe('avaliarSubstituicao', () => {
  it('orçamento sem vínculo: pode substituir', () => {
    expect(avaliarSubstituicao({ existe: false, error: null }))
      .toEqual({ permitido: true, motivo: null, mensagem: '' });
  });

  it('orçamento com vínculo: bloqueia e explica o que seria perdido', () => {
    const r = avaliarSubstituicao({ existe: true, error: null });
    expect(r.permitido).toBe(false);
    expect(r.motivo).toBe('vinculado');
    expect(r.mensagem).toBe(MSG_SUBSTITUIR_COM_VINCULO);
    expect(r.mensagem).toMatch(/vinculados ao cronograma/);
    expect(r.mensagem).toMatch(/Adicionar aos itens existentes/);
  });

  it('erro na consulta: bloqueia (falha fechada), mesmo que `existe` venha false', () => {
    const r = avaliarSubstituicao({ existe: false, error: { message: 'JWT expired' } });
    expect(r.permitido).toBe(false);
    expect(r.motivo).toBe('consulta');
    expect(r.mensagem).toBe(MSG_SUBSTITUIR_SEM_CONSULTA);
  });

  it('erro tem prioridade sobre existe: não afirma "tem vínculo" sem ter certeza', () => {
    expect(avaliarSubstituicao({ existe: true, error: { message: 'x' } }).motivo).toBe('consulta');
  });

  it('sem resposta nenhuma (undefined/null): bloqueia', () => {
    expect(avaliarSubstituicao(undefined).permitido).toBe(false);
    expect(avaliarSubstituicao(null).permitido).toBe(false);
  });
});
