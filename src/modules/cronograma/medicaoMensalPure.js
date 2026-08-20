// Medição Mensal — funções puras (sem state, sem JSX, sem I/O). Mesmo padrão de
// separação de taskDetailPure.js: cálculos testáveis, consumidos pela tela em
// ./MedicaoMensal.jsx e pelo service em ./medicaoMensal.service.js.
//
// Convenção de "valor" do item: cada ItemMedicao carrega o valor JÁ FATIADO para o
// mês de referência (monthlyDist[etapaId][mesRefKey], a mesma distribuição por-dia
// usada em Uso da Tarefa/Curva Física — computeMonthlyDist já aplica o peso vinculado
// do orçamento quando há vínculos). Por isso "previsto do mês" é sempre 100%: o valor
// do item para o mês é, por definição, o que estava programado para ser produzido
// naquele mês — a meta é entregar 100% dele até o fim do mês.
//
// ATENÇÃO: não usar formatPct de utils/formatters.js aqui — ela espera fração 0-1
// e todos os percentuais desta tela já estão na escala 0-100. Usar fmtPct100.

import { formatNum } from '../../utils/formatters';
import { offsetToDate, taskEnd } from './cronogramaDateUtils';

export const PREVISTO_MES_PCT = 100;

const formatDDMM = (date) => `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;

export const fmtPct100 = (v) => `${formatNum(v, 1)}%`;

// Para cada etapa, sobe por parentId até o ancestral raiz (nível 0) e usa esse grupo
// como "disciplina" — reaproveita a hierarquia N1/N2/N3 já existente no cronograma
// em vez de exigir um campo novo.
export function computeDisciplinaInfo(etapas, wbsMap) {
  const map = new Map(etapas.map(e => [e.id, e]));
  const result = {};
  etapas.forEach(e => {
    let cur = e;
    const visited = new Set();
    while (cur.parentId && !visited.has(cur.id)) {
      visited.add(cur.id);
      const parent = map.get(cur.parentId);
      if (!parent) break;
      cur = parent;
    }
    result[e.id] = { disciplina: cur.etapa || '—', disciplinaCodigo: wbsMap[cur.id] || '0' };
  });
  return result;
}

// Itens do cronograma agendados no mês de referência: folhas cujo monthlyDist tem
// fatia naquele mês (mesma janela de dias já usada por computeMonthlyDist — garante
// que "quais itens aparecem" e "qual valor cada um carrega" vêm da mesma fonte).
export function buildItensMedicao(etapas, mesRefKey, { monthlyDist, wbsMap, disciplinaInfo }) {
  return etapas
    .filter(e => !e.isGroup && monthlyDist[e.id] && mesRefKey in monthlyDist[e.id])
    .map(e => {
      const info = disciplinaInfo[e.id] || { disciplina: '—', disciplinaCodigo: '0' };
      const percExecutado = e.avanco || 0;
      return {
        id: e.id,
        wbs: wbsMap[e.id] || '',
        descricao: e.etapa || '',
        pavimento: e.pavimento || '—',
        disciplina: info.disciplina,
        disciplinaCodigo: info.disciplinaCodigo,
        dataInicio: formatDDMM(offsetToDate(e.inicio)),
        dataTermino: formatDDMM(offsetToDate(taskEnd(e))),
        duracaoDias: e.dur,
        valor: monthlyDist[e.id][mesRefKey] || 0,
        percExecutado,
        percMedido: percExecutado, // default; mergePercMedido sobrepõe com o que estiver salvo
        status: undefined,
      };
    });
}

// Parse do input "% medido": aceita vírgula ou ponto, remove lixo, clamp 0-100.
export function parsePercInput(raw) {
  const limpo = Number(String(raw).replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(limpo) ? Math.max(0, Math.min(100, limpo)) : 0;
}

// Deriva o status quando a API/etapa não traz um valor explícito. "Atrasada" nunca
// é derivada automaticamente — só aparece se vier setada explicitamente no item.
export function derivarStatus(item) {
  if (item.status) return item.status;
  if (item.percExecutado <= 0) return 'pendente';
  if (item.percExecutado >= 100) return 'concluida';
  return 'andamento';
}

// Agrupa por disciplina; %executado/%medido do grupo = média ponderada por valor.
export function computeGruposMedicao(itens, valorTotalBase) {
  const mapa = new Map();
  itens.forEach(i => {
    const k = `${i.disciplinaCodigo}|${i.disciplina}`;
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(i);
  });
  return Array.from(mapa.entries())
    .sort(([a], [b]) => a.localeCompare(b, 'pt-BR', { numeric: true }))
    .map(([k, rows]) => {
      const [codigo, nome] = k.split('|');
      const valor = rows.reduce((s, r) => s + r.valor, 0);
      const exec = valor ? rows.reduce((s, r) => s + r.valor * r.percExecutado, 0) / valor : 0;
      const med = valor ? rows.reduce((s, r) => s + r.valor * r.percMedido, 0) / valor : 0;
      return { codigo, nome, rows, valor, exec, med, peso: valorTotalBase ? (valor / valorTotalBase) * 100 : 0 };
    });
}

// Totais gerais: numerador sobre os itens filtrados, denominador (valorTotalBase)
// sobre a base NÃO filtrada — para o total não se distorcer quando um filtro é aplicado.
export function computeTotaisMedicao(itensFiltrados, valorTotalBase) {
  const valor = itensFiltrados.reduce((s, i) => s + i.valor, 0);
  const exec = valorTotalBase ? itensFiltrados.reduce((s, i) => s + i.valor * i.percExecutado, 0) / valorTotalBase : 0;
  const med = valorTotalBase ? itensFiltrados.reduce((s, i) => s + i.valor * i.percMedido, 0) / valorTotalBase : 0;
  const peso = valorTotalBase ? (valor / valorTotalBase) * 100 : 0;
  const valorAMedir = itensFiltrados.reduce((s, i) => s + (i.valor * i.percMedido) / 100, 0);
  return { valor, exec, med, peso, valorAMedir, qtd: itensFiltrados.length };
}

// Resumo financeiro/físico do mês: meta programada (% do valor da obra que este mês
// representa), previsto e executado acumulados (% do valor da obra até o fim do mês).
export function computeResumo({ monthlyTotals, realizedTotalsAte, mesRefKey }) {
  const totalPlan = Object.values(monthlyTotals).reduce((s, v) => s + v, 0);
  const planAteMes = Object.entries(monthlyTotals).reduce((s, [k, v]) => (k <= mesRefKey ? s + v : s), 0);
  const realAteMes = Object.values(realizedTotalsAte).reduce((s, v) => s + v, 0);
  return {
    valorObra: totalPlan,
    metaProgramada: totalPlan > 0 ? ((monthlyTotals[mesRefKey] || 0) / totalPlan) * 100 : 0,
    previstoAcumulado: totalPlan > 0 ? (planAteMes / totalPlan) * 100 : 0,
    executadoAcumulado: totalPlan > 0 ? (realAteMes / totalPlan) * 100 : 0,
  };
}

// Bloqueia o fechamento se algum item tiver %medido acima do %executado da tarefa.
export function validarFechamento(itens) {
  const violacoes = itens.filter(i => i.percMedido > i.percExecutado);
  return { ok: violacoes.length === 0, violacoes };
}

// Aplica o %medido salvo (registro do banco) por id; itens sem registro salvo mantêm
// o default (percExecutado) já aplicado em buildItensMedicao.
export function mergePercMedido(itensBase, registroItens) {
  if (!registroItens?.length) return itensBase;
  const salvos = new Map(registroItens.map(r => [r.id, r.percMedido]));
  return itensBase.map(i => (salvos.has(i.id) ? { ...i, percMedido: salvos.get(i.id) } : i));
}
