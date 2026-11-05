// Regras puras da Lista do Cronograma na casca mobile (sem React): o que aparece, como filtra, como lê as datas e
// como uma edição vira o novo array de etapas. Quem grava continua sendo o `commit` do CronogramaFull (undo,
// trava de conflito, ciclo recusado e salvamento valem igual); aqui só se calcula o array novo, com as mesmas
// funções da Lista e do formulário do Gantt (commitFieldChange, filtrarComAncestrais).
import { effStatus, commitFieldChange, filtrarComAncestrais } from '../../../cronograma/scheduleEngine';
import { offsetToISO, taskEndDisplay, parseAnyDateToISO } from '../../../cronograma/cronogramaDateUtils';

// ---- Filtro por situação ----
export const FILTROS_DE_SITUACAO = [
  { id: 'todas',      label: 'Todas' },
  { id: 'atrasadas',  label: 'Atrasadas' },
  { id: 'execucao',   label: 'Em execução' },
  { id: 'futuras',    label: 'Futuras' },
  { id: 'concluidas', label: 'Concluídas' },
];

// Situação de uma tarefa para exibir e filtrar. Mesma regra da Lista e do Gantt (effStatus: 100% conta como
// concluída). Qualquer outro valor salvo cai em "em execução".
export const chaveDeSituacao = (e) => {
  const s = effStatus(e);
  if (s === 'done') return 'concluidas';
  if (s === 'late') return 'atrasadas';
  if (s === 'upcoming') return 'futuras';
  return 'execucao';
};
const ROTULOS = { concluidas: 'Concluída', atrasadas: 'Atrasada', futuras: 'Futura', execucao: 'Em execução' };
export const rotuloDeSituacao = (chave) => ROTULOS[chave] || ROTULOS.execucao;

// Sem acento e sem caixa: "fundacao" acha "Fundação".
export const normalizarTexto = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// 56.15 -> "56,2%", 100 -> "100%", 0 -> "0%": uma casa decimal só quando existe (grupo traz o avanço arredondado em
// 1 casa, tarefa traz inteiro). Valor ausente ou inválido vira 0%.
export const formatarPercentual = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0%';
  return `${String(Math.round(v * 10) / 10).replace('.', ',')}%`;
};

// ---- Linhas da Lista ----
// Devolve as linhas na ordem da EAP. Sem busca nem filtro, uma tarefa só aparece se todos os grupos acima dela
// estiverem abertos (`expandidos`: Set de ids de grupo). Com busca ou filtro mostra tudo o que casa mais os
// grupos acima de cada resultado, abertos, como a Lista do desktop (filtrarComAncestrais).
export const linhasDaLista = ({ etapas = [], wbsMap = {}, expandidos = new Set(), texto = '', filtro = 'todas' }) => {
  const filhos = new Set();
  etapas.forEach(e => { if (e.parentId) filhos.add(e.parentId); });
  const t = normalizarTexto(texto.trim());
  const filtrando = !!t || filtro !== 'todas';

  let base;
  if (filtrando) {
    const passa = (e) => {
      if (t && !normalizarTexto(`${wbsMap[e.id] || ''} ${e.etapa || ''} ${e.responsavel || ''} ${e.pavimento || ''}`).includes(t)) return false;
      // Grupo não tem situação própria: com filtro de situação só entra como "pai" de quem casou.
      if (filtro !== 'todas' && (e.isGroup || chaveDeSituacao(e) !== filtro)) return false;
      return true;
    };
    base = filtrarComAncestrais(etapas, etapas, passa);
  } else {
    const byId = new Map(etapas.map(e => [e.id, e]));
    const cache = new Map();
    const visivel = (e) => {
      if (!e.parentId) return true;
      if (cache.has(e.id)) return cache.get(e.id);
      const pai = byId.get(e.parentId);
      const v = !pai || (expandidos.has(pai.id) && visivel(pai));
      cache.set(e.id, v);
      return v;
    };
    base = etapas.filter(visivel);
  }
  return base.map(e => ({
    e,
    nivel: e.nivel || 0,
    temFilhos: filhos.has(e.id),
    aberto: filtrando ? true : expandidos.has(e.id),
  }));
};

// Ids de todos os grupos que têm filhos (para "Expandir tudo").
export const idsDeGrupos = (etapas) => {
  const pais = new Set();
  etapas.forEach(e => { if (e.parentId) pais.add(e.parentId); });
  return pais;
};

// Grupos abertos de saída: os que a equipe deixou abertos no cronograma (flag `collapsed` gravado).
export const expandidosIniciais = (etapas) => new Set(etapas.filter(e => e.isGroup && !e.collapsed).map(e => e.id));

// ---- Datas e avanço de uma linha ----
// Grupo mostra o envelope dos filhos (groupVals); tarefa, os próprios campos. Mesma leitura do painel de
// detalhes do desktop (TaskFormPanel). O término é o último dia de trabalho (inclusivo), nunca o offset exclusivo.
export const datasDaTarefa = (e, groupVals = {}) => {
  const gv = e.isGroup ? groupVals[e.id] : null;
  const inicio = gv ? gv.inicio : e.inicio;
  const dur = gv ? gv.dur : e.dur;
  return {
    inicioISO: offsetToISO(inicio),
    fimISO: offsetToISO(taskEndDisplay({ ...e, inicio, dur })),
    dur,
    avanco: gv ? gv.avanco : (e.avanco ?? 0),
  };
};

// Término projetado da obra (maior término de tarefa), em ISO. null sem tarefas.
export const terminoProjetadoISO = (etapas, groupVals = {}) => {
  const folhas = etapas.filter(e => !e.isGroup);
  if (!folhas.length) return null;
  const maior = Math.max(...folhas.map(e => taskEndDisplay(e)));
  return offsetToISO(maior);
};

// ---- Edição pela folha ----
// Mesmos campos do formulário de tarefa do Gantt. Grupo só renomeia (as datas e o avanço dele vêm dos filhos).
export const camposEditaveis = (e) => (e.isGroup ? ['etapa'] : ['etapa', 'inicio', 'duracaoDias', 'avanco', 'responsavel']);

export const valoresIniciais = (e) => ({
  etapa: e.etapa || '',
  inicio: offsetToISO(e.inicio),
  duracaoDias: String(e.dur ?? 1),
  avanco: String(e.avanco ?? 0),
  responsavel: e.responsavel || '',
});

// Mensagem por campo; objeto vazio = pode salvar.
export const validarFolha = (valores, e) => {
  const erros = {};
  const campos = camposEditaveis(e);
  if (campos.includes('etapa') && !String(valores.etapa || '').trim()) erros.etapa = 'Informe o nome da tarefa.';
  if (campos.includes('inicio') && !parseAnyDateToISO(valores.inicio)) erros.inicio = 'Informe uma data válida.';
  if (campos.includes('duracaoDias')) {
    const d = Number(valores.duracaoDias);
    if (!Number.isInteger(d) || d < 1) erros.duracaoDias = 'Use um número inteiro de dias, a partir de 1.';
  }
  if (campos.includes('avanco')) {
    const a = Number(valores.avanco);
    if (!Number.isInteger(a) || a < 0 || a > 100) erros.avanco = 'Use um número inteiro de 0 a 100.';
  }
  return erros;
};

// Novo array de etapas com só o que mudou, aplicado campo a campo pelo mesmo commitFieldChange do desktop (que
// reagenda pelas dependências quando preciso). Devolve o MESMO array se nada mudou (nada a gravar nem a desfazer).
export const aplicarFolha = (etapas, id, valores) => {
  const original = etapas.find(e => e.id === id);
  if (!original) return etapas;
  const ini = valoresIniciais(original);
  let atual = etapas;
  camposEditaveis(original).forEach(campo => {
    const novo = campo === 'etapa' || campo === 'responsavel' ? String(valores[campo] ?? '').trim() : String(valores[campo] ?? '');
    if (novo !== String(ini[campo])) atual = commitFieldChange(atual, id, campo, novo);
  });
  return atual;
};
