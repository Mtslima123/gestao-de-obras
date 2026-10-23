// ─── importacaoOrcamentoPure ──────────────────────────────────────────────────
// Regra do modo "Substituir itens existentes" na importação do orçamento (BUG-002).
//
// Substituir apaga todos os itens já gravados, e a FK orcamento_cronograma_vinculos.
// orcamento_item_id é ON DELETE CASCADE: os vínculos com o cronograma somem junto, sem
// aviso e sem trilha de auditoria, e com eles o Custo Orçado, o avanço ponderado, a Curva S
// e os pesos da medição da obra. Por isso só se substitui um orçamento sem nenhum vínculo.
//
// A decisão vem da consulta feita NA HORA ao banco (não do estado da tela, que pode estar
// vazio por carga pendente ou erro) e falha fechada: sem resposta confiável, não substitui.

export const MSG_SUBSTITUIR_COM_VINCULO =
  'Este orçamento tem itens vinculados ao cronograma. Substituir apagaria esses vínculos ' +
  'e zeraria o Custo Orçado das tarefas. Nada foi alterado. Remova os vínculos antes ou ' +
  'importe em "Adicionar aos itens existentes".';

export const MSG_SUBSTITUIR_SEM_CONSULTA =
  'Não foi possível conferir se este orçamento tem vínculos com o cronograma. ' +
  'Nada foi alterado. Tente de novo.';

/**
 * @param {{ existe?: boolean, error?: any }} consulta  resultado de
 *   vinculoService.existeVinculoParaOrcamento(orcamentoId)
 * @returns {{ permitido: boolean, motivo: null|'consulta'|'vinculado', mensagem: string }}
 */
export function avaliarSubstituicao(consulta) {
  if (!consulta || consulta.error) {
    return { permitido: false, motivo: 'consulta', mensagem: MSG_SUBSTITUIR_SEM_CONSULTA };
  }
  if (consulta.existe) {
    return { permitido: false, motivo: 'vinculado', mensagem: MSG_SUBSTITUIR_COM_VINCULO };
  }
  return { permitido: true, motivo: null, mensagem: '' };
}
