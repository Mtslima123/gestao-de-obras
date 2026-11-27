// Qual grupo o "Distribuir pesos" (Orçamento × Cronograma) deve abrir para a linha clicada na Lista. Puro (sem
// React/DOM), testável em node.
//
// O modal reparte entre as subtarefas o valor dos itens vinculados DIRETAMENTE ao grupo aberto (é o mesmo grupo que
// aparece no "Resumo por tarefa" de lá), e mostra os subgrupos intermediários como linhas dele. Então o alvo é o
// grupo mais próximo, subindo a partir da linha, que tenha vínculo direto:
//  - linha de grupo com vínculo direto: o próprio grupo;
//  - subgrupo ou folha dentro de um grupo vinculado: o grupo vinculado que reparte o peso dela;
//  - nenhum grupo da linha para cima recebe vínculo: `null`, e o item nem aparece no menu.
// `comVinculo(id)` diz se a tarefa tem item do orçamento vinculado direto (no CronogramaFull, o Set `vinculadoIds`).
export function alvoDistribuicao({ etapas = [], id, comVinculo = () => false }) {
  const porId = new Map(etapas.map(e => [e.id, e]));
  let atual = porId.get(id);
  if (!atual) return null;
  if (!atual.isGroup) atual = porId.get(atual.parentId); // folha: a distribuição é sempre de um grupo
  const visitados = new Set(); // proteção contra parentId em ciclo (dado corrompido)
  while (atual && !visitados.has(atual.id)) {
    visitados.add(atual.id);
    if (atual.isGroup && comVinculo(atual.id)) return atual.id;
    atual = porId.get(atual.parentId);
  }
  return null;
}
