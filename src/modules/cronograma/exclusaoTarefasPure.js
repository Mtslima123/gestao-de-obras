// Excluir tarefas que têm itens do orçamento vinculados (Lista e Gantt), sem React nem
// Supabase, para teste.
//
// Antes, excluir a tarefa deixava os vínculos apontando para um id que não existe mais: no
// Orçamento × Cronograma eles apareciam como "Tarefa removida", o item continuava "ocupado"
// (cada item vincula a uma tarefa só) e o valor dele saía do cronograma. Agora a exclusão pergunta
// o que fazer com eles: mover para outra tarefa, remover os vínculos ou mantê-los assim.
import { computeAllWBS, deleteTask } from './scheduleEngine';

// Etapas que ficam depois de excluir `ids` (com as subtarefas de cada uma, em cascata).
export const etapasSemExcluidas = (etapas, ids) => ids.reduce((acc, id) => deleteTask(id, acc), etapas);

// Ids que saem: os escolhidos e todas as subtarefas deles.
export const idsExcluidos = (etapas, novas) => {
  const ficam = new Set(novas.map((e) => e.id));
  return new Set(etapas.filter((e) => !ficam.has(e.id)).map((e) => e.id));
};

// Vínculos que perdem a tarefa com a exclusão.
export const vinculosAfetados = (vinculos, excluidos) => (vinculos || []).filter((v) => excluidos.has(v.etapa_id));

// Destino sugerido para mover: a tarefa-pai mais próxima que continua existindo (o valor dos itens
// segue no mesmo ramo da EAP). Null quando não há (tarefa de primeiro nível).
export const destinoSugerido = (etapas, idsEscolhidos, novas) => {
  const ficam = new Set(novas.map((e) => e.id));
  const porId = new Map(etapas.map((e) => [e.id, e]));
  let atual = porId.get(idsEscolhidos[0])?.parentId ?? null;
  while (atual && !ficam.has(atual)) atual = porId.get(atual)?.parentId ?? null;
  return atual;
};

const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Tarefas que podem receber os itens: as que ficam, na ordem da EAP, com WBS e recuo pelo nível.
// `busca` filtra por nome ou WBS, sem acento nem caixa; o destino escolhido nunca some do filtro.
export const opcoesDeDestino = (novas, busca = '', manterId = null) => {
  const wbs = computeAllWBS(novas);
  const termo = semAcento(busca).trim();
  return novas
    .map((e) => ({ id: e.id, wbs: wbs[e.id] || '', nome: e.etapa || '', nivel: e.nivel || 0, grupo: !!e.isGroup }))
    .filter((o) => !termo || o.id === manterId || semAcento(`${o.wbs} ${o.nome}`).includes(termo));
};

// A exclusão pode ser confirmada? Sem vínculos afetados, sempre. Com eles, precisa da escolha e,
// para mover, de um destino que continue existindo. Remover os vínculos é só de administrador
// (o banco recusa a exclusão de vínculo de quem não é).
export const podeConfirmar = ({ afetados, acao, destino, novas, isAdmin }) => {
  if (!afetados) return true;
  if (acao === 'manter') return true;
  if (acao === 'remover') return !!isAdmin;
  if (acao === 'mover') return !!destino && novas.some((e) => e.id === destino);
  return false;
};

// Depois de gravada a exclusão: quais vínculos ajustar. Só os que ainda apontam para uma tarefa
// que de fato saiu do que foi gravado (se um Desfazer devolveu a tarefa antes da gravação, nada se
// mexe), e para mover só se o destino estiver no que foi gravado.
export const vinculosParaAjustar = ({ acao, vinculoIds, destino }, vinculos, gravadas) => {
  const existe = new Set(gravadas.map((e) => e.id));
  const alvo = new Set(vinculoIds);
  const ids = (vinculos || []).filter((v) => alvo.has(v.id) && !existe.has(v.etapa_id)).map((v) => v.id);
  if (acao === 'mover' && !existe.has(destino)) return { ids, destinoSumiu: true };
  return { ids, destinoSumiu: false };
};
