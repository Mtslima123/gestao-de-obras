// Comparar os vínculos orçamento × tarefa que a Lista tem na tela com os que estão no banco. Puro (sem React/DOM),
// testável em node.
//
// Os vínculos (e o valor do item do orçamento que vem junto) mudam fora da Lista: no Orçamento × Cronograma, ou ao
// editar o orçamento. Isso não mexe em cronogramas.updated_at, então a conferência de versão do cronograma não vê, e a
// Lista restaurada do cache da sessão (ou numa aba que ficou aberta) seguia com o valor vinculado de antes.
// A assinatura resume o que a Lista usa dos vínculos (qual item, em qual tarefa e quanto vale), em ordem estável: se
// as duas assinaturas são iguais não há nada a atualizar, e a tela não recalcula as milhares de linhas à toa.
// `valorDoItem` recebe o `orcamento_itens` embutido no vínculo (no app, o itemValor do vinculoService).
export function assinaturaDosVinculos(vinculos, valorDoItem = () => 0) {
  return (vinculos || [])
    .map(v => `${v.id}|${v.etapa_id}|${v.orcamento_item_id}|${v.orcamento_itens ? valorDoItem(v.orcamento_itens) : ''}`)
    .sort()
    .join(';');
}

export const vinculosMudaram = (antes, depois, valorDoItem) =>
  assinaturaDosVinculos(antes, valorDoItem) !== assinaturaDosVinculos(depois, valorDoItem);
