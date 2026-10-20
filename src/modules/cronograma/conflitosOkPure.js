// Conflitos de precedência com "OK": a pessoa reconhece o aviso e ele sai do badge, dos destaques
// laranja do Gantt e do toast de salvar. O OK fica gravado NA TAREFA SUCESSORA (etapa.conflitosOk),
// dentro do cronograma da obra: vale para todos os usuários, viaja pelo mesmo patch de gravação
// (etapasPatch.js compara o JSON de cada etapa) e não precisa de migração.
//
// Um OK vale para UMA dependência exata (sucessora + predecessora + tipo + lag). Se o conflito
// deixa de existir, o OK é podado no próximo commit (podarConfirmacoes), então um conflito que
// volte depois avisa de novo. Mudar o lag da ligação também conta como outra dependência.
import { gmConflicts } from './cronogramaShared';

export const chaveConflito = (c) => `${c.succ}|${c.pred}|${c.tipo}|${c.lag || 0}`;
const chaveOk = (succ, ok) => `${succ}|${ok.pred}|${ok.tipo}|${ok.lag || 0}`;

// Tira o campo quando a lista fica vazia, para a etapa voltar a ser igual à de antes do OK.
const comLista = (e, lista) => {
  if (lista.length) return { ...e, conflitosOk: lista };
  const { conflitosOk: _descartado, ...resto } = e;
  return resto;
};

/** Separa os conflitos em ativos (avisam) e confirmados (OK dado; trazem `por` e `em`). */
export function classificarConflitos(etapas) {
  const okPorChave = new Map();
  etapas.forEach(e => (e.conflitosOk || []).forEach(ok => okPorChave.set(chaveOk(e.id, ok), ok)));
  const ativos = [];
  const confirmados = [];
  gmConflicts(etapas).forEach(c => {
    const ok = okPorChave.get(chaveConflito(c));
    if (ok) confirmados.push({ ...c, por: ok.por || '', em: ok.em || '' });
    else ativos.push(c);
  });
  return { ativos, confirmados };
}

/** Dá OK nos conflitos informados. Devolve o MESMO array quando nada muda. */
export function confirmarConflitos(etapas, conflitos, { por, em }) {
  const porSucc = new Map();
  conflitos.forEach(c => porSucc.set(c.succ, [...(porSucc.get(c.succ) || []), c]));
  let mudou = false;
  const out = etapas.map(e => {
    const novos = porSucc.get(e.id);
    if (!novos) return e;
    const atuais = e.conflitosOk || [];
    const jaTem = new Set(atuais.map(ok => chaveOk(e.id, ok)));
    const acrescentar = novos
      .filter(c => !jaTem.has(chaveConflito(c)))
      .map(c => ({ pred: c.pred, tipo: c.tipo, lag: c.lag || 0, por, em }));
    if (!acrescentar.length) return e;
    mudou = true;
    return { ...e, conflitosOk: [...atuais, ...acrescentar] };
  });
  return mudou ? out : etapas;
}

/** Desfaz o OK de um conflito. Devolve o MESMO array quando não havia OK. */
export function desfazerConfirmacao(etapas, conflito) {
  const chave = chaveConflito(conflito);
  let mudou = false;
  const out = etapas.map(e => {
    if (e.id !== conflito.succ || !e.conflitosOk?.length) return e;
    const resta = e.conflitosOk.filter(ok => chaveOk(e.id, ok) !== chave);
    if (resta.length === e.conflitosOk.length) return e;
    mudou = true;
    return comLista(e, resta);
  });
  return mudou ? out : etapas;
}

/**
 * Remove os OK cujo conflito não existe mais (datas corrigidas, ligação removida, tarefa
 * excluída). Chamada no commit: é o que faz um conflito que reaparece avisar de novo.
 * Devolve o MESMO array quando não há o que podar.
 */
export function podarConfirmacoes(etapas) {
  if (!etapas.some(e => e.conflitosOk?.length)) return etapas;
  const vivos = new Set(gmConflicts(etapas).map(chaveConflito));
  let mudou = false;
  const out = etapas.map(e => {
    if (!e.conflitosOk?.length) return e;
    const resta = e.conflitosOk.filter(ok => vivos.has(chaveOk(e.id, ok)));
    if (resta.length === e.conflitosOk.length) return e;
    mudou = true;
    return comLista(e, resta);
  });
  return mudou ? out : etapas;
}
