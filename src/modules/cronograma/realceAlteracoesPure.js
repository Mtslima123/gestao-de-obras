// Realce de alterações (estilo MS Project): depois de uma edição, as células Início, Duração e Término
// que MUDARAM ficam com fundo azul-claro na Lista: a própria tarefa, as sucessoras que o recálculo
// moveu e os resumos acima delas. O realce vale só para a última alteração (a próxima edição troca por
// outro ou limpa), então aqui só existe a comparação entre dois estados; quem guarda e limpa é o
// CronogramaFull (Cronograma.jsx) e quem pinta é a ListaInterativa.
import { taskEnd } from './cronogramaDateUtils';
import { computeGroupValues } from './scheduleEngine';

// Ids de coluna da Lista que recebem o realce (os mesmos de `cells` em ListaInterativa.jsx).
export const COLUNA_INICIO = 'inicio';
export const COLUNA_DURACAO = 'duracao';
export const COLUNA_FIM = 'fim';

// Início e duração como a Lista MOSTRA, não como estão gravados: a tarefa-resumo exibe o envelope dos
// filhos (computeGroupValues), e o valor gravado dela pode estar velho (só o agendador o atualiza).
// Comparar o gravado faria o resumo ficar sem realce justamente quando a pessoa vê o número mudar.
// Resumo sem filhos não entra em computeGroupValues e cai nos próprios campos, como a Lista.
function inicioEDuracao(etapas) {
  const gv = computeGroupValues(etapas);
  const mapa = new Map();
  etapas.forEach(e => {
    const g = e.isGroup ? gv[e.id] : null;
    mapa.set(e.id, { isGroup: !!e.isGroup, inicio: g ? g.inicio : e.inicio, dur: g ? g.dur : e.dur });
  });
  return mapa;
}

/**
 * Quais células (por tarefa) mudaram de `antes` para `depois`.
 * Devolve `Map<idDaTarefa, Set<'inicio'|'duracao'|'fim'>>` só com o que mudou, ou `null` quando nada
 * mudou (nem data nem duração). Tarefa que só existe de um lado (nova, excluída) fica de fora, e mudar
 * a ordem das linhas ou qualquer campo que não seja data (nome, avanço, custo) não realça.
 */
export function realcarAlteracoes(antes, depois) {
  if (!antes?.length || !depois?.length) return null;
  const antesPorId = inicioEDuracao(antes);
  const depoisPorId = inicioEDuracao(depois);
  const realce = new Map();
  depoisPorId.forEach((d, id) => {
    const a = antesPorId.get(id);
    if (!a) return;
    const colunas = new Set();
    if (a.inicio !== d.inicio) colunas.add(COLUNA_INICIO);
    if (a.dur !== d.dur) colunas.add(COLUNA_DURACAO);
    // Término é função de início + duração (dias úteis, ou dias corridos no resumo): se os dois
    // são iguais ele não mudou e nem precisa ser calculado (workEnd percorre os dias). Mesmo com um
    // deles diferente o término pode ficar igual (início adianta e a duração encolhe), por isso compara.
    if (colunas.size && taskEnd(a) !== taskEnd(d)) colunas.add(COLUNA_FIM);
    if (colunas.size) realce.set(id, colunas);
  });
  return realce.size ? realce : null;
}
